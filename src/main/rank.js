/**
 * Multi-signal ranking: recency, user engagement, source reputation,
 * cluster size (cross-source signal), user affinity (embedding similarity),
 * and LLM newsworthiness score.
 */
import {
  getUnifiedFeedPool,
  getEngagementCountsByItem,
  getItemTitleDescription,
  getItemEmbedding,
  setItemEmbedding,
  getFeedEngagementRates,
  getClusterSizesForItems,
  getRecentEngagementEmbeddings,
  getNewsworthinessScores,
} from './db.js'
import { isAvailable, getEmbedding } from './ollama.js'

// Scoring weights
const RECENCY_WEIGHT = 1.0
const ENGAGEMENT_WEIGHT = 0.6
const SOURCE_REP_WEIGHT = 0.5
const CLUSTER_WEIGHT = 0.4          // reduced — was 0.7; cluster signal should complement, not dominate
const CLUSTER_CAP = 3               // cap effective cluster size (distinct feeds) to prevent runaway boost
const AFFINITY_WEIGHT = 1.0
const NEWSWORTHINESS_WEIGHT = 0.8
const POOL_SIZE = 300
const EMBED_CONCURRENCY = 5
const FOR_YOU_SEED_COUNT = 25
const FOR_YOU_SIMILARITY_WEIGHT = 1.4

/** Cosine similarity [0, 1]. */
function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  if (denom === 0) return 0
  return Math.max(0, Math.min(1, (dot / denom + 1) / 2))
}

/** Average multiple embedding vectors into one "interest profile" vector. */
function averageEmbeddings(embeddings) {
  if (!embeddings.length) return null
  const dim = embeddings[0].length
  const avg = new Array(dim).fill(0)
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) avg[i] += emb[i]
  }
  for (let i = 0; i < dim; i++) avg[i] /= embeddings.length
  return avg
}

/**
 * Multi-signal score for a single item.
 * @param {object} item
 * @param {number} now
 * @param {number} engagementCount
 * @param {number} sourceReputation
 * @param {number} clusterSize
 * @param {number} affinityScore - cosine similarity to user interest profile
 * @param {number} newsworthinessScore - LLM score 1-10 (0 if not scored)
 */
function scoreItem(item, now, engagementCount, sourceReputation, clusterSize, affinityScore, newsworthinessScore) {
  const hoursAgo = (now - item.publishedAt) / (3600 * 1000)
  const recency = RECENCY_WEIGHT / (1 + hoursAgo / 24)
  const engagement = ENGAGEMENT_WEIGHT * Math.log(1 + (engagementCount || 0))
  const sourceRep = SOURCE_REP_WEIGHT * Math.log(1 + (sourceReputation || 0))
  const effectiveCluster = Math.min(clusterSize || 1, CLUSTER_CAP)
  const cluster = CLUSTER_WEIGHT * Math.log(1 + Math.max(0, effectiveCluster - 1))
  const affinity = AFFINITY_WEIGHT * (affinityScore || 0)
  // Normalize LLM score from 1-10 to 0-1, then apply weight. Score of 5 = neutral (0.0 boost).
  const nw = newsworthinessScore > 0
    ? NEWSWORTHINESS_WEIGHT * ((newsworthinessScore - 5) / 5)
    : 0
  return recency + engagement + sourceRep + cluster + affinity + nw
}

/**
 * Get embedding for item: from cache or compute via Ollama.
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
 * Fetch embeddings for items in batches.
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
 * "For you" feed: rank by similarity to engagement seeds.
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
    _score: RECENCY_WEIGHT / (1 + (now - item.publishedAt) / (3600 * 1000 * 24)) +
            ENGAGEMENT_WEIGHT * Math.log(1 + (engagementCounts.get(item.id) || 0)),
  }))

  const ollamaOk = seedIds.length > 0 && (await isAvailable())
  if (ollamaOk) {
    const seedEmbeddings = []
    for (const id of seedIds) {
      const text = getItemTitleDescription(id)
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
          let totalSim = 0, n = 0
          for (const seedEmb of seedEmbeddings) {
            totalSim += cosineSimilarity(emb, seedEmb)
            n++
          }
          if (n > 0) item._score += FOR_YOU_SIMILARITY_WEIGHT * (totalSim / n)
        }
      }
    }
  }

  scored.sort((a, b) => b._score - a._score)
  const offset = page * limit
  const slice = scored.slice(offset, offset + limit + 1)
  const hasMore = slice.length > limit
  const items = (hasMore ? slice.slice(0, limit) : slice).map(({ _score, ...item }) => item)
  return { items, hasMore }
}

/**
 * Main ranked feed with multi-signal scoring.
 */
export async function getRankedFeed(page, limit, topic = 'all', similarToItemId = null, readFilter = 'unread') {
  // Archive: just return by read time
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
  const feedEngagementRates = getFeedEngagementRates()
  const itemIds = pool.map((i) => i.id)
  let clusterSizes, nwScores
  try { clusterSizes = getClusterSizesForItems(itemIds) } catch { clusterSizes = new Map() }
  try { nwScores = getNewsworthinessScores(itemIds) } catch { nwScores = new Map() }
  const now = Date.now()

  // Compute user interest profile for affinity scoring
  let interestProfile = null
  const ollamaOk = await isAvailable()
  if (ollamaOk) {
    const recentEmbeddings = getRecentEngagementEmbeddings(30)
    interestProfile = averageEmbeddings(recentEmbeddings)
  }

  // Score all items
  const scored = pool.map((item) => {
    const engCount = engagementCounts.get(item.id) || 0
    const sourceRep = feedEngagementRates.get(item.feedId) || 0
    const cSize = clusterSizes.get(item.id) || 1
    const nw = nwScores.get(item.id) || 0

    let affinity = 0
    if (interestProfile) {
      const emb = getItemEmbedding(item.id)
      if (emb) affinity = cosineSimilarity(emb, interestProfile)
    }

    return {
      ...item,
      _score: scoreItem(item, now, engCount, sourceRep, cSize, affinity, nw),
    }
  })

  scored.sort((a, b) => b._score - a._score)

  // "More like this" similarity boost on top of base scoring
  if (similarToItemId && ollamaOk) {
    const seedText = getItemTitleDescription(similarToItemId)
    const seedEmb = await getItemEmbeddingOrCompute(similarToItemId, seedText)
    if (seedEmb?.length) {
      const top50 = scored.slice(0, 50)
      const getText = (id) => {
        const it = pool.find((i) => i.id === id)
        return it ? { title: it.title, description: it.description } : null
      }
      const embeddings = await getEmbeddingsForItems(top50, getText)
      for (const item of scored) {
        const emb = embeddings.get(item.id)
        if (emb) item._score += 1.2 * cosineSimilarity(seedEmb, emb)
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
