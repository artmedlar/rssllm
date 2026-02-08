/**
 * Ollama API client for embeddings (localhost:11434).
 * Used for similarity scoring when available; app works without it.
 */

const OLLAMA_URL = 'http://127.0.0.1:11434'
const EMBED_MODEL = 'nomic-embed-text'

let _available = null

/**
 * @returns {Promise<boolean>}
 */
export async function isAvailable() {
  if (_available === false) return false
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) })
    if (!r.ok) return false
    _available = true
    return true
  } catch {
    _available = false
    return false
  }
}

/**
 * Get embedding vector for text. Returns array of numbers or null if unavailable.
 * @param {string} text
 * @returns {Promise<number[]|null>}
 */
export async function getEmbedding(text) {
  if (!text?.trim()) return null
  try {
    const r = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text.slice(0, 8000) }),
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) return null
    const data = await r.json()
    return data.embedding ?? null
  } catch {
    return null
  }
}
