/**
 * LLM newsworthiness scorer: asks a local LLM to rate article importance.
 * Only runs on recent items that haven't been scored yet.
 * Designed to run in the background loop after clustering.
 */

import { getItemsWithoutNewsworthinessScore, setNewsworthinessScore } from './db.js'
import { isAvailable, generate } from './ollama.js'

const BATCH_SIZE = 5  // score this many per cycle (LLM calls are slow)

const PROMPT_TEMPLATE = `Rate the newsworthiness of this article on a scale of 1 to 10, where:
- 1-3: routine, niche, or filler content
- 4-6: moderately interesting, relevant to some audiences
- 7-8: significant news, broad interest
- 9-10: major breaking news, historic event

Article title: {title}
Article summary: {summary}

Respond with ONLY a JSON object like: {"score": 7, "reason": "brief explanation"}
Do not include any other text.`

/**
 * Parse the LLM response to extract score and reason.
 * Handles various response formats (JSON, plain number, etc.)
 */
function parseScoreResponse(response) {
  if (!response) return null

  // Try JSON parse first
  try {
    // Find JSON in the response (LLM might include extra text)
    const jsonMatch = response.match(/\{[\s\S]*?"score"[\s\S]*?\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      const score = Number(parsed.score)
      if (score >= 1 && score <= 10) {
        return { score, reason: parsed.reason || '' }
      }
    }
  } catch {}

  // Try plain number
  const numMatch = response.match(/\b(\d+)\b/)
  if (numMatch) {
    const score = Number(numMatch[1])
    if (score >= 1 && score <= 10) {
      return { score, reason: '' }
    }
  }

  return null
}

/**
 * Score a batch of items using the LLM.
 * Called from the background loop.
 */
export async function runNewsworthinessScoring() {
  if (!(await isAvailable())) return { scored: 0 }

  const items = getItemsWithoutNewsworthinessScore(24 * 60 * 60 * 1000, BATCH_SIZE)
  if (!items.length) return { scored: 0 }

  let scored = 0

  for (const item of items) {
    const summary = (item.description || '').slice(0, 500)
    const prompt = PROMPT_TEMPLATE
      .replace('{title}', item.title || '(no title)')
      .replace('{summary}', summary || '(no summary)')

    const response = await generate(prompt)
    const result = parseScoreResponse(response)

    if (result) {
      setNewsworthinessScore(item.id, result.score, result.reason)
      scored++
    } else {
      // If LLM didn't give a parseable score, assign a neutral 5
      setNewsworthinessScore(item.id, 5, 'auto: unparseable LLM response')
      scored++
    }
  }

  return { scored }
}
