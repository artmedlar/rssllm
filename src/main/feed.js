import Parser from 'rss-parser'

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'RSS-Reader/1.0' },
  customFields: {
    item: [
      ['media:thumbnail', 'media:thumbnail', { keepArray: false }],
      ['media:content', 'media:content', { keepArray: false }],
    ],
  },
})

/**
 * Fetch and parse an RSS/Atom feed. Returns normalized items for upsert.
 * @param {string} url - Feed URL
 * @returns {{ title: string, items: { guid: string, link: string, title: string, description: string, publishedAt: number, thumbnailUrl: string|null }[] }}
 */
export async function fetchAndParse(url) {
  const feed = await parser.parseURL(url)
  const title = feed.title || feed.link || url

  const items = (feed.items || []).map((item) => {
    const link = item.link || item.guid || ''
    const guid = item.guid || item.link || link
    const pubDate = item.pubDate || item.isoDate
    const publishedAt = pubDate ? new Date(pubDate).getTime() : Date.now()
    const description = item.contentSnippet || stripHtml(item.content || '') || item.summary || ''
    const thumbnailUrl = getThumbnail(item)

    return {
      guid,
      link,
      title: item.title || '',
      description: description.slice(0, 5000),
      publishedAt,
      thumbnailUrl,
    }
  })

  return { title, items }
}

function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|avif)(\?|$)/i
const TRACKING_OR_TINY = /(pixel|tracking|analytics|1x1|spacer|blank\.(gif|png)|data:image\/gif)/i

/** Resolve relative URL against article link so thumbnails work when feed uses relative paths. */
function resolveUrl(url, base) {
  if (!url || !base || typeof url !== 'string' || typeof base !== 'string') return url
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  try {
    return new URL(url, base).href
  } catch {
    return url
  }
}

/**
 * Normalize and validate thumbnail URL: reject data URLs and obvious trackers.
 * @param {string} url
 * @returns {string|null}
 */
function cleanThumbnailUrl(url) {
  if (!url || typeof url !== 'string') return null
  const u = url.trim()
  if (u.startsWith('data:')) return null
  if (TRACKING_OR_TINY.test(u)) return null
  return u
}

/**
 * Extract first usable image URL from HTML (prefer larger by width/height if present).
 * @param {string} html
 * @returns {string|null}
 */
function firstImageFromHtml(html) {
  if (!html || typeof html !== 'string') return null
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*(?:width=["']?(\d+)["']?)?[^>]*(?:height=["']?(\d+)["']?)?[^>]*>/gi
  let best = null
  let bestPixels = 0
  let m
  while ((m = imgRegex.exec(html)) !== null) {
    const url = cleanThumbnailUrl(m[1])
    if (!url) continue
    const w = parseInt(m[2], 10) || 0
    const h = parseInt(m[3], 10) || 0
    const pixels = w * h
    if (pixels > bestPixels || (pixels === 0 && !best)) {
      best = url
      bestPixels = pixels || 1
    }
  }
  if (best) return best
  const simple = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return simple ? cleanThumbnailUrl(simple[1]) : null
}

/**
 * Get media URL from various RSS/Atom/Media RSS shapes (object or array).
 * @param {unknown} media
 * @returns {string|null}
 */
function urlFromMedia(media) {
  if (!media) return null
  const first = Array.isArray(media) ? media[0] : media
  const url = first?.$?.url ?? first?.url ?? first?.$?.['media:url']
  return cleanThumbnailUrl(url)
}

/**
 * @param {Record<string, unknown>} item - rss-parser item (enclosure, content, media:*)
 * @returns {string|null}
 */
function getThumbnail(item) {
  if (!item) return null

  // 1. Enclosure (RSS) – image type or image file extension
  if (item.enclosure?.url) {
    const type = (item.enclosure.type || '').toLowerCase()
    if (type.startsWith('image/')) return cleanThumbnailUrl(item.enclosure.url)
    if (!type && IMAGE_EXT.test(item.enclosure.url)) return cleanThumbnailUrl(item.enclosure.url)
  }

  // 2. Media RSS: media:content, media:thumbnail (object or array)
  const mediaContent = item['media:content'] ?? item['media:thumbnail']
  const mediaUrl = urlFromMedia(mediaContent)
  if (mediaUrl) return mediaUrl

  // 3. media:group – first image in group
  const group = item['media:group']
  if (group) {
    const g = Array.isArray(group) ? group[0] : group
    const inGroup = g?.['media:content'] ?? g?.['media:thumbnail']
    const u = urlFromMedia(inGroup)
    if (u) return u
  }

  // 4. iTunes item image (podcast episode art)
  const itunesImg = item.itunes?.image ?? item.itunes?.image?.href
  const itunesUrl = typeof itunesImg === 'string' ? itunesImg : itunesImg?.href
  if (cleanThumbnailUrl(itunesUrl)) return cleanThumbnailUrl(itunesUrl)

  // 5. Atom link rel="enclosure" type="image/*"
  const links = item.links ?? (item.link ? [item.link] : [])
  const linkList = Array.isArray(links) ? links : [links]
  for (const l of linkList) {
    const href = typeof l === 'string' ? l : l?.href ?? l?.$?.href
    const rel = (typeof l === 'object' && l?.rel) || (l?.$?.rel) || ''
    const type = (typeof l === 'object' && l?.type) || (l?.$?.type) || ''
    if (rel.toLowerCase().includes('enclosure') && type.toLowerCase().startsWith('image/') && href) {
      const u = cleanThumbnailUrl(href)
      if (u) return u
    }
  }

  // 6. First image in HTML content (prefer one with larger width/height)
  const content = item.content || item['content:encoded'] || ''
  const fromContent = firstImageFromHtml(content)
  if (fromContent) return resolveUrl(fromContent, item.link)

  // 7. First image in summary/description
  const summary = item.summary || item.description || ''
  const fromSummary = firstImageFromHtml(summary)
  if (fromSummary) return resolveUrl(fromSummary, item.link)

  return null
}
