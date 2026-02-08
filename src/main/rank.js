/**
 * Rank feed by recency + engagement. Optional: add similarity when Ollama is available.
 */
import { getUnifiedFeedPool, getEngagementCountsByItem } from './db.js'

const RECENCY_WEIGHT = 1
const ENGAGEMENT_WEIGHT = 0.8
const POOL_SIZE = 300

/**
 * Score = recency (newer = higher) + log(1 + engagement count).
 * @param {number} publishedAt
 * @param {number} engagementCount
 * @param {number} now
 */
function scoreItem(publishedAt, engagementCount, now) {
  const hoursAgo = (now - publishedAt) / (3600 * 1000)
  const recencyScore = RECENCY_WEIGHT / (1 + hoursAgo / 24)
  const engagementScore = ENGAGEMENT_WEIGHT * Math.log(1 + (engagementCount || 0))
  return recencyScore + engagementScore
}

/**
 * @param {number} page
 * @param {number} limit
 * @param {string} [topic]
 * @returns {{ items: import('./db.js').getUnifiedFeedPool extends () => infer R ? R[number][] : never[], hasMore: boolean }}
 */
export function getRankedFeed(page, limit, topic = 'all') {
  const pool = getUnifiedFeedPool(topic, POOL_SIZE)
  const engagementCounts = getEngagementCountsByItem(0)
  const now = Date.now()

  const scored = pool.map((item) => ({
    ...item,
    _score: scoreItem(item.publishedAt, engagementCounts.get(item.id) || 0, now),
  }))
  scored.sort((a, b) => b._score - a._score)

  const offset = page * limit
  const slice = scored.slice(offset, offset + limit + 1)
  const hasMore = slice.length > limit
  const items = (hasMore ? slice.slice(0, limit) : slice).map(({ _score, ...item }) => item)

  return { items, hasMore }
}
