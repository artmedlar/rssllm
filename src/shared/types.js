/**
 * Shared types (framework-agnostic). Used by main and renderer.
 */

/**
 * @typedef {Object} Feed
 * @property {number} id
 * @property {string} url
 * @property {string} title
 * @property {number} addedAt
 * @property {number|null} lastFetchedAt
 */

/**
 * @typedef {Object} FeedItem
 * @property {number} id
 * @property {number} feedId
 * @property {string} feedTitle
 * @property {string} guid
 * @property {string} title
 * @property {string} link
 * @property {string} description
 * @property {number} publishedAt
 * @property {string|null} thumbnailUrl
 * @property {number|null} readAt - unix ms if read
 */

/**
 * @typedef {Object} UnifiedFeedPage
 * @property {FeedItem[]} items
 * @property {boolean} hasMore
 */

export default {}
