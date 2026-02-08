/**
 * Classify an item into a topic (keyword-based; word boundaries + scoring).
 * @param {string} title
 * @param {string} description
 * @returns {'news'|'business'|'sports'|'tech'|'entertainment'|'science'|'other'}
 */
export function classifyTopic(title, description) {
  const text = `${title || ''} ${description || ''}`.toLowerCase()

  // Word-boundary safe: escape regex special chars, then match \bword\b
  function countMatches(words) {
    let n = 0
    for (const w of words) {
      const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`\\b${escaped}\\b`, 'i')
      if (re.test(text)) n++
    }
    return n
  }

  const topics = [
    {
      topic: 'sports',
      words: [
        'sport', 'football', 'soccer', 'basketball', 'baseball', 'nfl', 'nba', 'mlb', 'nhl', 'ncaa',
        'game', 'match', 'score', 'league', 'championship', 'olympics', 'tennis', 'golf', 'hockey',
        'quarterback', 'touchdown', 'playoffs', 'fifa', 'uefa', 'super bowl', 'world cup', 'mvp',
      ],
    },
    {
      topic: 'business',
      words: [
        'stock', 'market', 'trading', 'earnings', 'economy', 'business', 'finance', 'invest',
        'wall street', 'fed', 'inflation', 'recession', 'ceo', 'merger', 'ipo', 'quarterly',
        'revenue', 'profit', 'sec ', 'ftse', 'dow jones', 's&p', 'nasdaq', 'bond', 'dividend',
      ],
    },
    {
      topic: 'tech',
      words: [
        'tech', 'software', 'hardware', 'apple', 'google', 'microsoft', 'android', 'iphone',
        'ai', 'machine learning', 'llm', 'openai', 'gpu', 'cpu', 'algorithm', 'coding',
        'developer', 'app', 'digital', 'gadget', 'startup', 'cloud', 'api', 'linux',
        'python', 'javascript', 'programming', 'gaming', 'meta', 'amazon', 'aws',
      ],
    },
    {
      topic: 'science',
      words: [
        'science', 'research', 'study', 'studies', 'climate', 'space', 'nasa', 'health',
        'medical', 'vaccine', 'physics', 'biology', 'discovery', 'nature', 'journal',
        'paper', 'experiment', 'scientist', 'data', 'genome', 'evolution', 'environment',
      ],
    },
    {
      topic: 'entertainment',
      words: [
        'movie', 'film', 'music', 'celebrity', 'tv ', 'netflix', 'album', 'band', 'actor',
        'actress', 'oscar', 'grammy', 'entertainment', 'trailer', 'premiere', 'box office',
        'broadway', 'concert', 'streaming', 'spotify',
      ],
    },
    {
      topic: 'news',
      words: [
        'breaking', 'politics', 'election', 'government', 'congress', 'senate', 'vote',
        'reuters', 'ap news', 'bbc', 'cnn', 'reported', 'minister', 'president', 'court',
        'law', 'policy', 'crime', 'attack', 'crisis', 'war', 'europe', 'asia', 'middle east',
      ],
    },
  ]

  let bestTopic = 'other'
  let bestScore = 0

  for (const { topic, words } of topics) {
    const score = countMatches(words)
    if (score > bestScore) {
      bestScore = score
      bestTopic = topic
    }
  }

  return bestTopic
}

/** Fixed list for UI tabs (All is handled separately) */
export const TOPIC_TABS = ['news', 'business', 'sports', 'tech', 'entertainment', 'science', 'other']
