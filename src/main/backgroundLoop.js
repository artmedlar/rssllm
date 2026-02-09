/**
 * Background processing loop: continuously fetches feeds in the background,
 * tracks new items, and signals the renderer when changes are ready.
 *
 * Usage: call start() after DB is initialized. Call getPendingStatus() to
 * check if new items are available. Call applyPending() to mark pending
 * items as "seen" (renderer will re-fetch from DB).
 */

import { getFeeds, setFeedLastFetched, upsertItemsReturningNew, getItemsWithoutEmbeddings, getItemTitleDescription, getItemEmbedding, setItemEmbedding } from './db.js'
import { fetchAndParse } from './feed.js'
import { classifyTopic } from './classifier.js'
import { isAvailable as ollamaIsAvailable, getEmbedding } from './ollama.js'
import { runClustering } from './cluster.js'
import { runNewsworthinessScoring } from './scorer.js'

const PARALLEL_FEEDS = 6
const CYCLE_DELAY_MS = 2 * 60 * 1000     // 2 min between full cycles
const FEED_DELAY_MS = 500                  // small delay between batches within a cycle
const PER_HOST_MIN_MS = 3000               // min ms between requests to same host
const EMBED_BATCH_SIZE = 10                // items to embed per batch
const EMBED_BATCH_DELAY_MS = 200           // short pause between embedding batches

/** Per-host rate limiter */
const hostLastFetch = new Map()

function getHost(url) {
  try { return new URL(url).hostname } catch { return '_default' }
}

async function rateLimitedFetch(url) {
  const host = getHost(url)
  const now = Date.now()
  const last = hostLastFetch.get(host) ?? 0
  const wait = Math.max(0, PER_HOST_MIN_MS - (now - last))
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  hostLastFetch.set(host, Date.now())
  return fetchAndParse(url)
}

/** State */
let running = false
let pendingNewItemIds = new Set()
let lastCycleAt = 0
let cycleInProgress = false

/**
 * Fetch a single feed, upsert items, return count of genuinely new items.
 */
async function fetchOneFeed(feed) {
  try {
    const { items } = await rateLimitedFetch(feed.url)
    if (!items.length) return 0
    const itemsWithTopic = items.map((it) => ({
      ...it,
      topic: classifyTopic(it.title, it.description),
    }))
    const newIds = upsertItemsReturningNew(feed.id, itemsWithTopic)
    setFeedLastFetched(feed.id, Date.now())
    for (const id of newIds) pendingNewItemIds.add(id)
    return newIds.length
  } catch {
    return 0
  }
}

/**
 * Run one full cycle: fetch all feeds in parallel batches.
 */
async function runCycle() {
  if (cycleInProgress) return
  cycleInProgress = true
  try {
    const feeds = getFeeds()
    if (!feeds.length) return

    // Process in parallel batches
    for (let i = 0; i < feeds.length; i += PARALLEL_FEEDS) {
      if (!running) break
      const batch = feeds.slice(i, i + PARALLEL_FEEDS)
      await Promise.all(batch.map(fetchOneFeed))
      if (i + PARALLEL_FEEDS < feeds.length) {
        await new Promise((r) => setTimeout(r, FEED_DELAY_MS))
      }
    }
    lastCycleAt = Date.now()
  } finally {
    cycleInProgress = false
  }
}

/**
 * Compute embeddings for items that don't have them yet.
 * Runs after each feed fetch cycle. Processes in batches.
 */
async function runEmbeddings() {
  if (!(await ollamaIsAvailable())) return

  const itemIds = getItemsWithoutEmbeddings(EMBED_BATCH_SIZE * 5)
  if (!itemIds.length) return

  for (let i = 0; i < itemIds.length; i += EMBED_BATCH_SIZE) {
    if (!running) break
    const batch = itemIds.slice(i, i + EMBED_BATCH_SIZE)

    await Promise.all(batch.map(async (itemId) => {
      // Skip if already computed (race condition guard)
      if (getItemEmbedding(itemId)) return
      const item = getItemTitleDescription(itemId)
      if (!item) return
      const text = `${item.title.slice(0, 2000)} ${item.description.slice(0, 4000)}`
      const embedding = await getEmbedding(text)
      if (embedding) setItemEmbedding(itemId, embedding)
    }))

    if (i + EMBED_BATCH_SIZE < itemIds.length) {
      await new Promise((r) => setTimeout(r, EMBED_BATCH_DELAY_MS))
    }
  }
}

/**
 * Main loop: fetch feeds -> compute embeddings -> cluster stories -> wait -> repeat.
 */
async function loop() {
  while (running) {
    await runCycle()
    if (!running) break
    await runEmbeddings()
    if (!running) break
    try { runClustering() } catch (e) { console.warn('[background] clustering error:', e.message) }
    if (!running) break
    try { await runNewsworthinessScoring() } catch (e) { console.warn('[background] scoring error:', e.message) }
    if (!running) break
    await new Promise((r) => setTimeout(r, CYCLE_DELAY_MS))
  }
}

// --- Public API ---

export function start() {
  if (running) return
  running = true
  // Start first cycle after a short delay so the app loads first
  setTimeout(() => loop(), 5000)
}

export function stop() {
  running = false
}

/** Get pending status for the renderer. */
export function getPendingStatus() {
  return {
    newItemCount: pendingNewItemIds.size,
    hasChanges: pendingNewItemIds.size > 0,
    cycleInProgress,
    lastCycleAt,
  }
}

/** Called when user "applies" the refresh -- clears pending state. */
export function applyPending() {
  const count = pendingNewItemIds.size
  pendingNewItemIds = new Set()
  return { applied: count }
}
