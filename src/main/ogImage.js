/**
 * Fetch article page and extract og:image or twitter:image for use as thumbnail.
 * Used when the RSS feed doesn't include an image.
 */

const TIMEOUT_MS = 8000
const MAX_HTML_BYTES = 400_000

/**
 * @param {string} articleUrl - Full URL of the article page
 * @returns {Promise<string|null>} - Absolute image URL or null
 */
export async function fetchOgImage(articleUrl) {
  if (!articleUrl || !articleUrl.startsWith('http')) return null
  let html = ''
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const res = await fetch(articleUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RSS-Reader/1.0; +https://github.com/artmedlar/rssllm)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    clearTimeout(timeoutId)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const decoder = new TextDecoder('utf-8', { fatal: false })
    html = decoder.decode(buf.slice(0, MAX_HTML_BYTES))
  } catch {
    return null
  }

  // og:image (preferred)
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
  if (ogMatch?.[1]) return resolveUrl(ogMatch[1], articleUrl)

  // twitter:image
  const twMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i)
  if (twMatch?.[1]) return resolveUrl(twMatch[1], articleUrl)

  return null
}

function resolveUrl(url, base) {
  if (!url || !base) return null
  const u = url.trim()
  if (u.startsWith('http://') || u.startsWith('https://')) return u
  try {
    return new URL(u, base).href
  } catch {
    return u
  }
}
