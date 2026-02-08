/**
 * Rank feed by recency + engagement. When Ollama is available and user clicked
 * "More like this", add similarity boost from embeddings.
 */
import {
  getUnifiedFeedPool,
  getEngagementCountsByItem,
  getItemTitleDescription,
  getItemEmbedding,
  setItemEmbedding,
} from './db.js'
import { isAvailable, getEmbedding } from './ollama.js'

const RECENCY_WEIGHT = 1
const ENGAGEMENT_WEIGHT = 0.8
const SIMILARITY_WEIGHT = 1.2
const POOL_SIZE = 300
const SIMILARITY_TOP_N = 50
const EMBED_CONCURRENCY = 5
const FOR_YOU_SEED_COUNT = 25
const FOR_YOU_SIMILARITY_WEIGHT = 1.4

/**
 * Score = recency (newer = higher) + log(1 + engagement count).
 */
function scoreItem(publishedAt, engagementCount, now) {
  const hoursAgo = (now - publishedAt) / (3600 * 1000)
  const recencyScore = RECENCY_WEIGHT / (1 + hoursAgo / 24)
  const engagementScore = ENGAGEMENT_WEIGHT * Math.log(1 + (engagementCount || 0))
  return recencyScore + engagementScore
}

/** Cosine similarity [0, 1]. Returns 0 if either vector is missing or zero. */
function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  if (denom === 0) return 0
  const cos = dot / denom
  return Math.max(0, Math.min(1, (cos + 1) / 2))
}

/**
 * Get embedding for item: from cache or compute via Ollama and store.
 * @param {number} itemId
 * @param {string} text - title + description for embedding
 * @returns {Promise<number[]|null>}
 */
async function getItemEmbeddingOrCompute(itemId, text) {
  const cached = getItemEmbedding(itemId)
  if (cached?.length) return cached
  const combined = `${(text?.title || '').slice(0, 2000)} ${(text?.description || '').slice(0, 4000)}`.trim()
  if (!combined) return null
  const embedding = await getEmbedding(combined)
  if (embedding?.length) setItemEmbedding(itemId, embedding)
  return embedding
}

/**
 * Fetch embeddings for items in batches to avoid overwhelming Ollama.
 * @param {{ id: number }[]} items
 * @param {(id: number) => { title: string, description: string }|null} getText
 * @returns {Promise<Map<number, number[]>>}
 */
async function getEmbeddingsForItems(items, getText) {
  const out = new Map()
  for (let i = 0; i < items.length; i += EMBED_CONCURRENCY) {
    const batch = items.slice(i, i + EMBED_CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (item) => {
        const text = getText(item.id)
        const emb = await getItemEmbeddingOrCompute(item.id, text)
        return { id: item.id, emb }
      })
    )
    for (const { id, emb } of results) {
      if (emb) out.set(id, emb)
    }
  }
  return out
}

/**
 * "For you" feed: rank unread items by similarity to highest-engagement items (seeds).
 * Seeds are excluded from results so we never recommend something already seen.
 * @returns {Promise<{ items: any[], hasMore: boolean }>}
 */
async function getForYouRankedFeed(page, limit) {
  const pool = getUnifiedFeedPool('all', POOL_SIZE, 'unread')
  const engagementCounts = getEngagementCountsByItem(0)
  const seedIds = [...engagementCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, FOR_YOU_SEED_COUNT)
    .map(([id]) => id)
  const seedSet = new Set(seedIds)
  const poolExcludingSeeds = pool.filter((item) => !seedSet.has(item.id))

  const now = Date.now()
  let scored = poolExcludingSeeds.map((item) => ({
    ...item,
    _score: scoreItem(item.publishedAt, engagementCounts.get(item.id) || 0, now),
  }))

  const ollamaOk = seedIds.length > 0 && (await isAvailable())
  if (ollamaOk) {
    const seedTexts = new Map(seedIds.map((id) => [id, getItemTitleDescription(id)]))
    const seedEmbeddings = []
    for (const id of seedIds) {
      const text = seedTexts.get(id)
      const emb = await getItemEmbeddingOrCompute(id, text)
      if (emb?.length) seedEmbeddings.push(emb)
    }
    if (seedEmbeddings.length > 0) {
      const getText = (id) => {
        const it = poolExcludingSeeds.find((i) => i.id === id)
        return it ? { title: it.title, description: it.description } : null
      }
      const itemEmbeddings = await getEmbeddingsForItems(poolExcludingSeeds, getText)
      for (const item of scored) {
        const emb = itemEmbeddings.get(item.id)
        if (emb) {
          let totalSim = 0
          let n = 0
          for (const seedEmb of seedEmbeddings) {
            totalSim += cosineSimilarity(emb, seedEmb)
            n += 1
          }
          if (n > 0) item._score += FOR_YOU_SIMILARITY_WEIGHT * (totalSim / n)
        }
      }
      scored.sort((a, b) => b._score - a._score)
    }
  } else {
    scored.sort((a, b) => b._score - a._score)
  }

  const offset = page * limit
  const slice = scored.slice(offset, offset + limit + 1)
  const hasMore = slice.length > limit
  const items = (hasMore ? slice.slice(0, limit) : slice).map(({ _score, ...item }) => item)
  return { items, hasMore }
}

/**
 * @param {number} page
 * @param {number} limit
 * @param {string} [topic]
 * @param {number} [similarToItemId] - When set and Ollama available, boost items similar to this (unread only)
 * @param {'unread'|'read'} [readFilter='unread'] - unread: to-read feed (ranked); read: already-read list (by read_at desc)
 * @returns {Promise<{ items: import('./db.js').getUnifiedFeedPool extends () => infer R ? R[number][] : never[], hasMore: boolean }>}
 */
export async function getRankedFeed(page, limit, topic = 'all', similarToItemId = null, readFilter = 'unread') {
  if (readFilter === 'read') {
    const pool = getUnifiedFeedPool(topic, POOL_SIZE, readFilter)
    const offset = page * limit
    const slice = pool.slice(offset, offset + limit + 1)
    const hasMore = slice.length > limit
    const items = hasMore ? slice.slice(0, limit) : slice
    return { items, hasMore }
  }

  if (topic === 'for_you') return getForYouRankedFeed(page, limit)

  const pool = getUnifiedFeedPool(topic, POOL_SIZE, readFilter)
  const engagementCounts = getEngagementCountsByItem(0)
  const now = Date.now()

  let scored = pool.map((item) => ({
    ...item,
    _score: scoreItem(item.publishedAt, engagementCounts.get(item.id) || 0, now),
  }))
  scored.sort((a, b) => b._score - a._score)

  const ollamaOk = similarToItemId != null && (await isAvailable())
  if (ollamaOk && similarToItemId) {
    const seedText = getItemTitleDescription(similarToItemId)
    const seedEmb = await getItemEmbeddingOrCompute(similarToItemId, seedText)
    if (seedEmb?.length) {
      const topForSimilarity = scored.slice(0, SIMILARITY_TOP_N)
      const getText = (id) => {
        const it = pool.find((i) => i.id === id)
        return it ? { title: it.title, description: it.description } : null
      }
      const embeddings = await getEmbeddingsForItems(topForSimilarity, getText)
      for (const item of scored) {
        const emb = embeddings.get(item.id)
        if (emb) {
          const sim = cosineSimilarity(seedEmb, emb)
          item._score += SIMILARITY_WEIGHT * sim
        }
      }
      scored.sort((a, b) => b._score - a._score)
    }
  }

  const offset = page * limit
  const slice = scored.slice(offset, offset + limit + 1)
  const hasMore = slice.length > limit
  const items = (hasMore ? slice.slice(0, limit) : slice).map(({ _score, ...item }) => item)

  return { items, hasMore }
}
