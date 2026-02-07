import Parser from 'rss-parser'

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'RSS-Reader/1.0' },
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

/**
 * @param {{ enclosure?: { url?: string, type?: string }, 'media:content'?: { $?: { url?: string } }, content?: string }} item
 * @returns {string|null}
 */
function getThumbnail(item) {
  if (item.enclosure?.url) {
    const type = (item.enclosure.type || '').toLowerCase()
    if (type.startsWith('image/')) return item.enclosure.url
    if (!type && /\.(jpg|jpeg|png|gif|webp)$/i.test(item.enclosure.url)) return item.enclosure.url
  }
  const media = item['media:content'] || item['media:thumbnail']
  const url = media?.$?.url ?? media?.url
  if (url) return url
  const content = item.content || item['content:encoded'] || ''
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (imgMatch) return imgMatch[1]
  return null
}
