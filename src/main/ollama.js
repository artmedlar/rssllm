/**
 * Ollama API client for embeddings (localhost:11434).
 * Used for similarity scoring when available; app works without it.
 * Can try to start Ollama automatically if not running.
 */

import { spawn } from 'node:child_process'

const OLLAMA_URL = 'http://127.0.0.1:11434'
const EMBED_MODEL = 'nomic-embed-text'
const CHAT_MODEL = 'llama3.2'

let _available = null
let _lastCheck = 0
const RECHECK_INTERVAL_MS = 30000 // retry every 30s if previously unavailable

/**
 * @returns {Promise<boolean>}
 */
export async function isAvailable() {
  // If previously unavailable, allow periodic rechecks
  if (_available === false && Date.now() - _lastCheck < RECHECK_INTERVAL_MS) return false
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) })
    if (!r.ok) {
      _available = false
      _lastCheck = Date.now()
      return false
    }
    _available = true
    return true
  } catch {
    _available = false
    _lastCheck = Date.now()
    return false
  }
}

/**
 * If Ollama isn't running, try to start it (ollama serve) and pull the embed model in background.
 * Safe to call at app startup; does not block. No-op if Ollama is not installed.
 */
export function ensureRunning() {
  isAvailable().then((ok) => {
    if (ok) return
    _available = null
    try {
      const p = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' })
      p.unref()
      setTimeout(() => {
        try {
          spawn('ollama', ['pull', EMBED_MODEL], { detached: true, stdio: 'ignore' }).unref()
          spawn('ollama', ['pull', CHAT_MODEL], { detached: true, stdio: 'ignore' }).unref()
        } catch (_) {}
      }, 5000)
    } catch (_) {}
  })
}

/**
 * Send a prompt to the LLM and get a text response. Used for newsworthiness scoring.
 * @param {string} prompt
 * @returns {Promise<string|null>}
 */
export async function generate(prompt) {
  if (!prompt?.trim()) return null
  try {
    const r = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: CHAT_MODEL, prompt, stream: false }),
      signal: AbortSignal.timeout(30000),
    })
    if (!r.ok) return null
    const data = await r.json()
    return data.response?.trim() ?? null
  } catch {
    return null
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
