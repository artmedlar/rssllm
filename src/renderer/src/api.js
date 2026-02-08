/**
 * Thin API layer: plain async functions that call electronAPI.
 * No React imports. Can be reused by another renderer (e.g. Svelte) later.
 */

function getAPI() {
  if (typeof window === 'undefined' || !window.electronAPI) {
    return null
  }
  return window.electronAPI
}

export async function ping() {
  const api = getAPI()
  return api ? api.ping() : null
}

/** @returns {Promise<{ id: number, url: string, title: string, addedAt: number, lastFetchedAt: number|null }[]>} */
export async function getSubscriptions() {
  const api = getAPI()
  if (!api?.subscriptionsList) return []
  return api.subscriptionsList()
}

/**
 * @param {string} url - Feed URL
 * @returns {Promise<{ id: number, url: string, title: string }>}
 */
export async function addSubscription(url) {
  const api = getAPI()
  if (!api?.subscriptionsAdd) throw new Error('Not available')
  return api.subscriptionsAdd(url)
}

/**
 * @param {number} [page=0]
 * @param {number} [limit=30]
 * @param {string} [topic='all'] - 'all' | 'news' | 'business' | 'sports' | 'tech' | 'entertainment' | 'science' | 'other'
 * @returns {Promise<{ items: Array<{ id: number, feedId: number, feedTitle: string, title: string, link: string, description: string, publishedAt: number, thumbnailUrl: string|null, readAt: number|null }>, hasMore: boolean }>}
 */
export async function getFeed(page = 0, limit = 30, topic = 'all') {
  const api = getAPI()
  if (!api?.feedGet) return { items: [], hasMore: false }
  return api.feedGet(page, limit, topic)
}

/**
 * @param {number} feedId
 * @returns {Promise<boolean>}
 */
export async function removeSubscription(feedId) {
  const api = getAPI()
  if (!api?.subscriptionsRemove) return false
  return api.subscriptionsRemove(feedId)
}

/**
 * @param {number} itemId
 * @returns {Promise<boolean>}
 */
export async function markRead(itemId) {
  const api = getAPI()
  if (!api?.feedMarkRead) return false
  return api.feedMarkRead(itemId)
}

/**
 * @param {string} url - Open in system browser
 */
export function openExternal(url) {
  const api = getAPI()
  if (api?.openExternal) api.openExternal(url)
}
