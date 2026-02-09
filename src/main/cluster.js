/**
 * Story clustering: group articles about the same event/topic using embedding similarity.
 *
 * Algorithm:
 * - For each unclustered item with an embedding, compare against existing clustered items
 * - If cosine similarity > threshold, add to that cluster
 * - Otherwise, leave it as a standalone (single-item cluster created only if needed later)
 */

import {
  getUnclusteredItemIds,
  getItemEmbedding,
  getRecentItemsWithEmbeddings,
  getClusterForItem,
  createCluster,
  addToCluster,
  updateClusterRepresentative,
  getClusterMembers,
} from './db.js'

const SIMILARITY_THRESHOLD = 0.82  // high threshold -- only very similar stories cluster together

/** Cosine similarity, normalized to [0, 1]. */
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

/**
 * Run one clustering pass: assign unclustered items to existing clusters or create new ones.
 * Called from the background loop after embeddings are computed.
 */
export function runClustering() {
  const unclusteredIds = getUnclusteredItemIds()
  if (!unclusteredIds.length) return { processed: 0, clustered: 0 }

  // Load all recent items with embeddings as candidate cluster targets
  const recentItems = getRecentItemsWithEmbeddings()
  if (!recentItems.length) return { processed: 0, clustered: 0 }

  // Build a map of itemId -> embedding for fast lookup
  const embeddingMap = new Map()
  for (const item of recentItems) {
    embeddingMap.set(item.id, item.embedding)
  }

  // Build a map of itemId -> clusterId for items already in clusters
  const itemClusterMap = new Map()
  for (const item of recentItems) {
    const cid = getClusterForItem(item.id)
    if (cid != null) itemClusterMap.set(item.id, cid)
  }

  let clustered = 0

  for (const itemId of unclusteredIds) {
    const embedding = getItemEmbedding(itemId)
    if (!embedding) continue

    // Find the most similar item that's already in a cluster
    let bestSim = 0
    let bestClusterId = null
    let bestItemId = null

    for (const [otherId, otherEmb] of embeddingMap) {
      if (otherId === itemId) continue
      const sim = cosineSimilarity(embedding, otherEmb)
      if (sim > bestSim) {
        bestSim = sim
        bestItemId = otherId
        bestClusterId = itemClusterMap.get(otherId) ?? null
      }
    }

    if (bestSim >= SIMILARITY_THRESHOLD) {
      if (bestClusterId != null) {
        // Add to existing cluster
        addToCluster(bestClusterId, itemId, bestSim)
        itemClusterMap.set(itemId, bestClusterId)
      } else {
        // Create a new cluster with the two items
        const clusterId = createCluster(bestItemId, [
          { itemId: bestItemId, similarity: 1.0 },
          { itemId: itemId, similarity: bestSim },
        ])
        itemClusterMap.set(bestItemId, clusterId)
        itemClusterMap.set(itemId, clusterId)
      }
      // Update representative to be the most recent item in the cluster
      const cid = itemClusterMap.get(itemId)
      if (cid != null) {
        const members = getClusterMembers(cid)
        if (members.length > 0) {
          // Most recent item is first (ordered by published_at DESC)
          updateClusterRepresentative(cid, members[0].itemId)
        }
      }
      clustered++
    }

    // Add this item's embedding to the map for subsequent comparisons
    embeddingMap.set(itemId, embedding)
  }

  return { processed: unclusteredIds.length, clustered }
}
