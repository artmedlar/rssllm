/**
 * Fetch article page and extract og:image, twitter:image, JSON-LD image, or first body image.
 * Used when the RSS feed doesn't include an image.
 */

const TIMEOUT_MS = 12_000
const MAX_HTML_BYTES = 500_000
const TRACKER_OR_TINY = /(pixel|tracking|analytics|1x1|spacer|blank\.(gif|png)|data:image\/gif|data:image\/png;base64,[\w+/=]{0,50}$)/i

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
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
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

  const url = extractImage(html, articleUrl)
  return url
}

/**
 * @param {string} html
 * @param {string} baseUrl
 * @returns {string|null}
 */
function extractImage(html, baseUrl) {
  // 1. og:image – multiple patterns (attribute order, single/double quotes)
  const ogPatterns = [
    /<meta\s[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i,
    /<meta\s[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:image["']/i,
    /<meta\s[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*([^\s>]+)/i,
  ]
  for (const re of ogPatterns) {
    const m = html.match(re)
    if (m?.[1]) {
      const u = resolveUrl(m[1].trim(), baseUrl)
      if (u && !TRACKER_OR_TINY.test(u)) return u
    }
  }

  // 2. twitter:image
  const twPatterns = [
    /<meta\s[^>]*name\s*=\s*["']twitter:image["'][^>]*content\s*=\s*["']([^"']+)["']/i,
    /<meta\s[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']twitter:image["']/i,
  ]
  for (const re of twPatterns) {
    const m = html.match(re)
    if (m?.[1]) {
      const u = resolveUrl(m[1].trim(), baseUrl)
      if (u && !TRACKER_OR_TINY.test(u)) return u
    }
  }

  // 3. JSON-LD (Article or NewsArticle image)
  const ldJson = html.match(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  if (ldJson) {
    for (const block of ldJson) {
      const inner = block.replace(/<\/?script[^>]*>/gi, '').trim()
      let obj
      try {
        obj = JSON.parse(inner)
      } catch {
        continue
      }
      const arr = Array.isArray(obj) ? obj : [obj]
      for (const item of arr) {
        const img = item?.image?.url ?? item?.image ?? item?.thumbnailUrl
        const src = typeof img === 'string' ? img : img?.[0] ?? img?.['@id']
        if (src && typeof src === 'string') {
          const u = resolveUrl(src.trim(), baseUrl)
          if (u && !TRACKER_OR_TINY.test(u)) return u
        }
      }
    }
  }

  // 4. First substantial <img> in document (skip trackers, data URLs, tiny)
  const imgRegex = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*(?:width\s*=\s*["']?(\d+)["']?)?[^>]*(?:height\s*=\s*["']?(\d+)["']?)?[^>]*>/gi
  let best = null
  let bestPixels = 0
  let m
  while ((m = imgRegex.exec(html)) !== null) {
    const src = m[1].trim()
    if (src.startsWith('data:') || TRACKER_OR_TINY.test(src)) continue
    const w = parseInt(m[2], 10) || 0
    const h = parseInt(m[3], 10) || 0
    const pixels = w * h
    if (pixels >= 10000 || (pixels === 0 && !best)) {
      const u = resolveUrl(src, baseUrl)
      if (!u) continue
      if (pixels > bestPixels || (pixels === 0 && !best)) {
        best = u
        bestPixels = pixels || 1
      }
    }
  }
  if (best) return best
  const simpleImg = html.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i)
  if (simpleImg?.[1]) {
    const src = simpleImg[1].trim()
    if (!src.startsWith('data:') && !TRACKER_OR_TINY.test(src)) return resolveUrl(src, baseUrl)
  }

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
