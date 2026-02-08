/**
 * Classify an item into a topic (keyword-based for now; can be replaced with LLM later).
 * @param {string} title
 * @param {string} description
 * @returns {'news'|'business'|'sports'|'tech'|'entertainment'|'science'|'other'}
 */
export function classifyTopic(title, description) {
  const text = `${title || ''} ${description || ''}`.toLowerCase()
  const rules = [
    { topic: 'sports', words: ['sport', 'football', 'soccer', 'basketball', 'baseball', 'nfl', 'nba', 'mlb', 'game', 'match', 'score', 'league', 'championship', 'olympics', 'tennis', 'golf', 'hockey'] },
    { topic: 'business', words: ['stock', 'market', 'trading', 'earnings', 'economy', 'business', 'finance', 'invest', 'wall street', 'fed', 'inflation', 'recession', 'ceo', 'merger', 'ipo'] },
    { topic: 'tech', words: ['tech', 'software', 'apple', 'google', 'microsoft', 'ai', 'android', 'iphone', 'startup', 'coding', 'developer', 'app', 'digital', 'gadget'] },
    { topic: 'science', words: ['science', 'research', 'study', 'climate', 'space', 'nasa', 'health', 'medical', 'vaccine', 'physics', 'biology', 'discovery'] },
    { topic: 'entertainment', words: ['movie', 'film', 'music', 'celebrity', 'tv', 'netflix', 'album', 'band', 'actor', 'oscar', 'grammy', 'entertainment'] },
    { topic: 'news', words: ['news', 'breaking', 'politics', 'election', 'government', 'world', 'today', 'reuters', 'ap ', 'bbc', 'cnn', 'reported', 'said'] },
  ]
  for (const { topic, words } of rules) {
    if (words.some((w) => text.includes(w))) return topic
  }
  return 'other'
}

/** Fixed list for UI tabs (All is handled separately) */
export const TOPIC_TABS = ['news', 'business', 'sports', 'tech', 'entertainment', 'science', 'other']
