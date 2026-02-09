import fs from 'fs'
import path from 'path'
import initSqlJs from 'sql.js'

let db = null
let dbPath = null

async function getWasmPath() {
  try {
    const { createRequire } = await import('module')
    const require = createRequire(import.meta.url)
    const sqlJsDir = path.dirname(require.resolve('sql.js'))
    return path.join(sqlJsDir, 'sql-wasm.wasm')
  } catch {
    return path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  }
}

/**
 * @param {string} pathToDb - Full path to the SQLite file
 * @returns {Promise<void>}
 */
export async function initDb(pathToDb) {
  if (db) return
  dbPath = pathToDb

  const wasmPath = await getWasmPath()
  const SQL = await initSqlJs({ locateFile: () => wasmPath })

  let buffer
  try {
    buffer = fs.readFileSync(dbPath)
  } catch {
    buffer = undefined
  }
  db = new SQL.Database(buffer)

  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA foreign_keys = ON')

  db.run(`
    CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      added_at INTEGER NOT NULL,
      last_fetched_at INTEGER
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
      guid TEXT NOT NULL,
      link TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      published_at INTEGER NOT NULL,
      thumbnail_url TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(feed_id, guid)
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS read_state (
      item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      read_at INTEGER NOT NULL
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_items_feed_published ON items(feed_id, published_at DESC)')
  db.run('CREATE INDEX IF NOT EXISTS idx_items_published ON items(published_at DESC)')

  const tableInfo = db.exec("PRAGMA table_info(items)")
  const hasTopic = tableInfo[0]?.values?.some((row) => row[1] === 'topic')
  if (!hasTopic) {
    db.run("ALTER TABLE items ADD COLUMN topic TEXT DEFAULT 'general'")
    db.run('CREATE INDEX IF NOT EXISTS idx_items_topic ON items(topic)')
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS engagement_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      duration_ms INTEGER,
      at INTEGER NOT NULL
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_engagement_item ON engagement_events(item_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_engagement_type ON engagement_events(event_type)')

  db.run(`
    CREATE TABLE IF NOT EXISTS item_embeddings (
      item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      embedding TEXT NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS story_clusters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      representative_item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS cluster_members (
      cluster_id INTEGER NOT NULL REFERENCES story_clusters(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      similarity REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (cluster_id, item_id)
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_cluster_members_item ON cluster_members(item_id)')

  db.run(`
    CREATE TABLE IF NOT EXISTS newsworthiness_scores (
      item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      score REAL NOT NULL,
      reason TEXT,
      scored_at INTEGER NOT NULL
    )
  `)

  persist()
}

function persist() {
  if (!db || !dbPath) return
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(dbPath, buffer)
}

function getDb() {
  if (!db) throw new Error('DB not initialized. Call initDb(dbPath) first.')
  return db
}

export function addFeed(url, title = '') {
  const d = getDb()
  const addedAt = Date.now()
  d.run('INSERT INTO feeds (url, title, added_at) VALUES (?, ?, ?)', [url.trim(), title || url, addedAt])
  const row = d.exec('SELECT last_insert_rowid() as id')
  const id = row[0]?.values?.[0]?.[0] ?? 0
  persist()
  return id
}

export function removeFeed(feedId) {
  const d = getDb()
  d.run('DELETE FROM read_state WHERE item_id IN (SELECT id FROM items WHERE feed_id = ?)', [feedId])
  d.run('DELETE FROM items WHERE feed_id = ?', [feedId])
  d.run('DELETE FROM feeds WHERE id = ?', [feedId])
  persist()
}

export function getFeeds() {
  const d = getDb()
  const result = d.exec('SELECT id, url, title, added_at AS addedAt, last_fetched_at AS lastFetchedAt FROM feeds ORDER BY added_at DESC')
  if (!result.length || !result[0].values) return []
  const cols = result[0].columns
  const idx = (name) => cols.indexOf(name)
  return result[0].values.map((row) => ({
    id: row[idx('id')],
    url: row[idx('url')],
    title: row[idx('title')],
    addedAt: row[idx('addedAt')],
    lastFetchedAt: row[idx('lastFetchedAt')] ?? null,
  }))
}

export function upsertItems(feedId, items) {
  const d = getDb()
  const created = Date.now()
  for (const it of items) {
    const topic = it.topic || 'general'
    d.run(
      `INSERT INTO items (feed_id, guid, link, title, description, published_at, thumbnail_url, created_at, topic)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (feed_id, guid) DO UPDATE SET
         link = excluded.link,
         title = excluded.title,
         description = excluded.description,
         published_at = excluded.published_at,
         thumbnail_url = excluded.thumbnail_url,
         topic = excluded.topic`,
      [
        feedId,
        it.guid || it.link,
        it.link,
        it.title || '',
        it.description || '',
        it.publishedAt,
        it.thumbnailUrl ?? null,
        created,
        topic,
      ]
    )
  }
  persist()
}

/**
 * Like upsertItems but returns an array of item IDs that were genuinely NEW inserts (not updates).
 * Used by background loop to track pending new items.
 */
export function upsertItemsReturningNew(feedId, items) {
  const d = getDb()
  const created = Date.now()
  const newIds = []
  for (const it of items) {
    const topic = it.topic || 'general'
    const guid = it.guid || it.link
    // Check if item already exists
    const existing = d.exec('SELECT id FROM items WHERE feed_id = ? AND guid = ?', [feedId, guid])
    const alreadyExists = existing.length > 0 && existing[0].values.length > 0

    d.run(
      `INSERT INTO items (feed_id, guid, link, title, description, published_at, thumbnail_url, created_at, topic)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (feed_id, guid) DO UPDATE SET
         link = excluded.link,
         title = excluded.title,
         description = excluded.description,
         published_at = excluded.published_at,
         thumbnail_url = excluded.thumbnail_url,
         topic = excluded.topic`,
      [
        feedId,
        guid,
        it.link,
        it.title || '',
        it.description || '',
        it.publishedAt,
        it.thumbnailUrl ?? null,
        created,
        topic,
      ]
    )

    if (!alreadyExists) {
      const row = d.exec('SELECT last_insert_rowid() as id')
      const id = row[0]?.values?.[0]?.[0]
      if (id) newIds.push(id)
    }
  }
  persist()
  return newIds
}

export function setFeedLastFetched(feedId, lastFetchedAt) {
  getDb().run('UPDATE feeds SET last_fetched_at = ? WHERE id = ?', [lastFetchedAt, feedId])
  persist()
}

/** @param {number} itemId - Item id. @returns {{ link: string }|null} */
export function getItemById(itemId) {
  const d = getDb()
  const stmt = d.prepare('SELECT link FROM items WHERE id = ?')
  stmt.bind([Number(itemId)])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = stmt.getAsObject()
  stmt.free()
  return row
}

/** @param {number} itemId - For embedding text. @returns {{ title: string, description: string }|null} */
export function getItemTitleDescription(itemId) {
  const d = getDb()
  const stmt = d.prepare('SELECT title, description FROM items WHERE id = ?')
  stmt.bind([Number(itemId)])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = stmt.getAsObject()
  stmt.free()
  return { title: row.title || '', description: row.description || '' }
}

/** @param {number} itemId - @returns {number[]|null} Cached embedding or null */
export function getItemEmbedding(itemId) {
  const d = getDb()
  const stmt = d.prepare('SELECT embedding FROM item_embeddings WHERE item_id = ?')
  stmt.bind([Number(itemId)])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = stmt.getAsObject()
  stmt.free()
  try {
    return JSON.parse(row.embedding)
  } catch {
    return null
  }
}

/**
 * Get item IDs that don't have embeddings yet, ordered by most recent first.
 * @param {number} limit
 * @returns {number[]}
 */
export function getItemsWithoutEmbeddings(limit = 50) {
  const d = getDb()
  const result = d.exec(
    `SELECT i.id FROM items i
     LEFT JOIN item_embeddings e ON e.item_id = i.id
     WHERE e.item_id IS NULL
     ORDER BY i.published_at DESC
     LIMIT ?`,
    [limit]
  )
  if (!result.length || !result[0].values) return []
  return result[0].values.map((row) => row[0])
}

/** @param {number} itemId - @param {number[]} embedding */
export function setItemEmbedding(itemId, embedding) {
  getDb().run(
    'INSERT INTO item_embeddings (item_id, embedding) VALUES (?, ?) ON CONFLICT (item_id) DO UPDATE SET embedding = excluded.embedding',
    [Number(itemId), JSON.stringify(embedding)]
  )
  persist()
}

// --- Cluster queries ---

/**
 * Get recent items that have embeddings, for clustering candidates.
 * @param {number} maxAgeMs - Only items newer than this (e.g. 48h)
 * @param {number} limit
 * @returns {{ id: number, embedding: number[] }[]}
 */
export function getRecentItemsWithEmbeddings(maxAgeMs = 48 * 60 * 60 * 1000, limit = 500) {
  const d = getDb()
  const cutoff = Date.now() - maxAgeMs
  const result = d.exec(
    `SELECT i.id, e.embedding FROM items i
     JOIN item_embeddings e ON e.item_id = i.id
     WHERE i.published_at > ?
     ORDER BY i.published_at DESC
     LIMIT ?`,
    [cutoff, limit]
  )
  if (!result.length || !result[0].values) return []
  return result[0].values.map((row) => ({
    id: row[0],
    embedding: JSON.parse(row[1]),
  }))
}

/**
 * Get the cluster ID for an item, if any.
 * @param {number} itemId
 * @returns {number|null}
 */
export function getClusterForItem(itemId) {
  const d = getDb()
  const result = d.exec('SELECT cluster_id FROM cluster_members WHERE item_id = ?', [itemId])
  if (!result.length || !result[0].values.length) return null
  return result[0].values[0][0]
}

/**
 * Create a new cluster with the given items.
 * @param {number} representativeItemId
 * @param {{ itemId: number, similarity: number }[]} members
 * @returns {number} cluster ID
 */
export function createCluster(representativeItemId, members) {
  const d = getDb()
  const now = Date.now()
  d.run(
    'INSERT INTO story_clusters (representative_item_id, created_at, updated_at) VALUES (?, ?, ?)',
    [representativeItemId, now, now]
  )
  const row = d.exec('SELECT last_insert_rowid() as id')
  const clusterId = row[0]?.values?.[0]?.[0]
  for (const m of members) {
    d.run(
      'INSERT OR IGNORE INTO cluster_members (cluster_id, item_id, similarity) VALUES (?, ?, ?)',
      [clusterId, m.itemId, m.similarity]
    )
  }
  persist()
  return clusterId
}

/**
 * Add an item to an existing cluster.
 * @param {number} clusterId
 * @param {number} itemId
 * @param {number} similarity
 */
export function addToCluster(clusterId, itemId, similarity) {
  const d = getDb()
  d.run(
    'INSERT OR IGNORE INTO cluster_members (cluster_id, item_id, similarity) VALUES (?, ?, ?)',
    [clusterId, itemId, similarity]
  )
  d.run('UPDATE story_clusters SET updated_at = ? WHERE id = ?', [Date.now(), clusterId])
  persist()
}

/**
 * Update the representative item of a cluster (e.g. when a newer/better article arrives).
 */
export function updateClusterRepresentative(clusterId, itemId) {
  getDb().run('UPDATE story_clusters SET representative_item_id = ?, updated_at = ? WHERE id = ?', [itemId, Date.now(), clusterId])
  persist()
}

/**
 * Get cluster member count for a given item (if it's a representative).
 * @param {number} itemId
 * @returns {number}
 */
export function getClusterSizeForItem(itemId) {
  const d = getDb()
  const result = d.exec(
    `SELECT COUNT(*) FROM cluster_members cm
     JOIN story_clusters sc ON sc.id = cm.cluster_id
     WHERE sc.representative_item_id = ?`,
    [itemId]
  )
  if (!result.length || !result[0].values.length) return 0
  return result[0].values[0][0]
}

/**
 * Get all items in a cluster (for the cluster detail view).
 * @param {number} clusterId
 * @returns {{ itemId: number, similarity: number, title: string, feedTitle: string, link: string, publishedAt: number, thumbnailUrl: string|null }[]}
 */
export function getClusterMembers(clusterId) {
  const d = getDb()
  const result = d.exec(
    `SELECT cm.item_id, cm.similarity, i.title, f.title AS feedTitle, i.link, i.published_at, i.thumbnail_url
     FROM cluster_members cm
     JOIN items i ON i.id = cm.item_id
     JOIN feeds f ON f.id = i.feed_id
     WHERE cm.cluster_id = ?
     ORDER BY i.published_at DESC`,
    [clusterId]
  )
  if (!result.length || !result[0].values) return []
  const cols = result[0].columns
  const idx = (name) => cols.indexOf(name)
  return result[0].values.map((row) => ({
    itemId: row[idx('item_id')],
    similarity: row[idx('similarity')],
    title: row[idx('title')],
    feedTitle: row[idx('feedTitle')],
    link: row[idx('link')],
    publishedAt: row[idx('published_at')],
    thumbnailUrl: row[idx('thumbnail_url')],
  }))
}

/**
 * Get items that have embeddings but aren't in any cluster yet.
 * @param {number} maxAgeMs
 * @param {number} limit
 * @returns {number[]}
 */
export function getUnclusteredItemIds(maxAgeMs = 48 * 60 * 60 * 1000, limit = 200) {
  const d = getDb()
  const cutoff = Date.now() - maxAgeMs
  const result = d.exec(
    `SELECT i.id FROM items i
     JOIN item_embeddings e ON e.item_id = i.id
     LEFT JOIN cluster_members cm ON cm.item_id = i.id
     WHERE i.published_at > ? AND cm.item_id IS NULL
     ORDER BY i.published_at DESC
     LIMIT ?`,
    [cutoff, limit]
  )
  if (!result.length || !result[0].values) return []
  return result[0].values.map((row) => row[0])
}

/**
 * Get engagement rate per feed: total engagements / total items.
 * Higher = user engages more with this source.
 * @returns {Map<number, number>} feedId -> engagement rate
 */
export function getFeedEngagementRates() {
  const d = getDb()
  // Count items per feed
  const itemCounts = d.exec('SELECT feed_id, COUNT(*) as cnt FROM items GROUP BY feed_id')
  const feedItemCount = new Map()
  if (itemCounts.length && itemCounts[0].values) {
    for (const row of itemCounts[0].values) feedItemCount.set(row[0], row[1])
  }
  // Count engagements per feed
  const engCounts = d.exec(
    `SELECT i.feed_id, COUNT(*) as cnt FROM engagement_events e
     JOIN items i ON i.id = e.item_id
     GROUP BY i.feed_id`
  )
  const rates = new Map()
  if (engCounts.length && engCounts[0].values) {
    for (const row of engCounts[0].values) {
      const feedId = row[0]
      const engCount = row[1]
      const total = feedItemCount.get(feedId) || 1
      rates.set(feedId, engCount / total)
    }
  }
  return rates
}

/**
 * Get cluster size for each item in a list of item IDs.
 * @param {number[]} itemIds
 * @returns {Map<number, number>} itemId -> cluster size
 */
export function getClusterSizesForItems(itemIds) {
  if (!itemIds.length) return new Map()
  const d = getDb()
  const sizes = new Map()
  // For each item, check if it's a cluster representative
  const result = d.exec(
    `SELECT sc.representative_item_id, COUNT(cm.item_id) as cnt
     FROM story_clusters sc
     JOIN cluster_members cm ON cm.cluster_id = sc.id
     GROUP BY sc.representative_item_id`
  )
  if (result.length && result[0].values) {
    for (const row of result[0].values) {
      sizes.set(row[0], row[1])
    }
  }
  return sizes
}

/**
 * Get embeddings for the user's recently engaged items (for computing interest profile).
 * @param {number} limit
 * @returns {number[][]} array of embedding vectors
 */
export function getRecentEngagementEmbeddings(limit = 30) {
  const d = getDb()
  const result = d.exec(
    `SELECT DISTINCT e.item_id, ie.embedding
     FROM engagement_events e
     JOIN item_embeddings ie ON ie.item_id = e.item_id
     WHERE e.event_type IN ('open', 'view', 'more_like')
     ORDER BY e.at DESC
     LIMIT ?`,
    [limit]
  )
  if (!result.length || !result[0].values) return []
  const embeddings = []
  for (const row of result[0].values) {
    try {
      embeddings.push(JSON.parse(row[1]))
    } catch {}
  }
  return embeddings
}

// --- Newsworthiness scores ---

/**
 * Store an LLM newsworthiness score for an item.
 * @param {number} itemId
 * @param {number} score - 1-10
 * @param {string} reason - short LLM explanation
 */
export function setNewsworthinessScore(itemId, score, reason = '') {
  getDb().run(
    'INSERT INTO newsworthiness_scores (item_id, score, reason, scored_at) VALUES (?, ?, ?, ?) ON CONFLICT (item_id) DO UPDATE SET score = excluded.score, reason = excluded.reason, scored_at = excluded.scored_at',
    [itemId, score, reason, Date.now()]
  )
  persist()
}

/**
 * Get newsworthiness scores for a list of item IDs.
 * @param {number[]} itemIds
 * @returns {Map<number, number>} itemId -> score (1-10)
 */
export function getNewsworthinessScores(itemIds) {
  if (!itemIds.length) return new Map()
  const d = getDb()
  const result = d.exec('SELECT item_id, score FROM newsworthiness_scores')
  const scores = new Map()
  if (result.length && result[0].values) {
    for (const row of result[0].values) scores.set(row[0], row[1])
  }
  return scores
}

/**
 * Get recent item IDs that don't have a newsworthiness score yet.
 * @param {number} maxAgeMs
 * @param {number} limit
 * @returns {{ id: number, title: string, description: string }[]}
 */
export function getItemsWithoutNewsworthinessScore(maxAgeMs = 24 * 60 * 60 * 1000, limit = 20) {
  const d = getDb()
  const cutoff = Date.now() - maxAgeMs
  const result = d.exec(
    `SELECT i.id, i.title, i.description FROM items i
     LEFT JOIN newsworthiness_scores ns ON ns.item_id = i.id
     WHERE i.published_at > ? AND ns.item_id IS NULL
     ORDER BY i.published_at DESC
     LIMIT ?`,
    [cutoff, limit]
  )
  if (!result.length || !result[0].values) return []
  return result[0].values.map((row) => ({ id: row[0], title: row[1], description: row[2] }))
}

/** Update thumbnail for an item (e.g. after fetching og:image). */
export function updateItemThumbnail(itemId, thumbnailUrl) {
  getDb().run('UPDATE items SET thumbnail_url = ? WHERE id = ?', [thumbnailUrl, Number(itemId)])
  persist()
}

/**
 * @param {number} page
 * @param {number} limit
 * @param {string} [topic] - 'all' or empty = no filter; 'other' = general + other; else topic name
 */
export function getUnifiedFeed(page, limit, topic) {
  const d = getDb()
  const offset = page * limit
  let topicClause = ''
  if (topic && topic !== 'all') {
    if (topic === 'other') {
      topicClause = " AND (i.topic IN ('general', 'other') OR i.topic IS NULL)"
    } else {
      topicClause = ' AND i.topic = ?'
    }
  }
  const baseQuery = `
    SELECT
      i.id,
      i.feed_id AS feedId,
      f.title AS feedTitle,
      i.guid,
      i.title,
      i.link,
      i.description,
      i.published_at AS publishedAt,
      i.thumbnail_url AS thumbnailUrl,
      r.read_at AS readAt
    FROM items i
    JOIN feeds f ON f.id = i.feed_id
    LEFT JOIN read_state r ON r.item_id = i.id
    WHERE 1=1
    ${topicClause}
    ORDER BY i.published_at DESC
    LIMIT ? OFFSET ?
  `
  const params = topic && topic !== 'all' && topic !== 'other' ? [topic, limit + 1, offset] : [limit + 1, offset]
  const stmt = d.prepare(baseQuery)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()

  const hasMore = rows.length > limit
  const resultRows = hasMore ? rows.slice(0, limit) : rows
  const items = resultRows.map((row) => ({
    id: row.id,
    feedId: row.feedId,
    feedTitle: row.feedTitle,
    guid: row.guid,
    title: row.title,
    link: row.link,
    description: row.description,
    publishedAt: row.publishedAt,
    thumbnailUrl: row.thumbnailUrl,
    readAt: row.readAt,
  }))
  return { items, hasMore }
}

/**
 * Fetch a pool of items for ranking. Used by getRankedFeed.
 * @param {string} topic
 * @param {number} poolSize
 * @param {'unread'|'read'} [readFilter='unread'] - unread: only unread, by published_at; read: only read, by read_at desc
 * @returns {Array<{ id: number, feedId: number, feedTitle: string, title: string, link: string, description: string, publishedAt: number, thumbnailUrl: string|null, readAt: number|null }>}
 */
export function getUnifiedFeedPool(topic, poolSize = 300, readFilter = 'unread') {
  const d = getDb()
  let topicClause = ''
  if (topic && topic !== 'all') {
    if (topic === 'other') {
      topicClause = " AND (i.topic IN ('general', 'other') OR i.topic IS NULL)"
    } else {
      topicClause = ' AND i.topic = ?'
    }
  }
  const baseQuery = `
    SELECT
      i.id,
      i.feed_id AS feedId,
      f.title AS feedTitle,
      i.guid,
      i.title,
      i.link,
      i.description,
      i.published_at AS publishedAt,
      i.thumbnail_url AS thumbnailUrl,
      r.read_at AS readAt
    FROM items i
    JOIN feeds f ON f.id = i.feed_id
    LEFT JOIN read_state r ON r.item_id = i.id
    WHERE 1=1
    ${topicClause}
    ${readFilter === 'read' ? ' AND r.read_at IS NOT NULL' : ' AND r.read_at IS NULL'}
    ${readFilter === 'read' ? ' ORDER BY r.read_at DESC' : ' ORDER BY i.published_at DESC'}
    LIMIT ${Number(poolSize)}
  `
  const params = topic && topic !== 'all' && topic !== 'other' ? [topic] : []
  const stmt = d.prepare(baseQuery)
  if (params.length) stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows.map((row) => ({
    id: row.id,
    feedId: row.feedId,
    feedTitle: row.feedTitle,
    guid: row.guid,
    title: row.title,
    link: row.link,
    description: row.description,
    publishedAt: row.publishedAt,
    thumbnailUrl: row.thumbnailUrl,
    readAt: row.readAt,
  }))
}

export function markRead(itemId) {
  const readAt = Date.now()
  getDb().run(
    'INSERT INTO read_state (item_id, read_at) VALUES (?, ?) ON CONFLICT (item_id) DO UPDATE SET read_at = excluded.read_at',
    [itemId, readAt]
  )
  persist()
}

/**
 * @param {number} itemId
 * @param {string} eventType - 'open' | 'view' | 'more_like' | 'less_like'
 * @param {number} [durationMs]
 */
export function recordEngagement(itemId, eventType, durationMs = null) {
  getDb().run(
    'INSERT INTO engagement_events (item_id, event_type, duration_ms, at) VALUES (?, ?, ?, ?)',
    [itemId, eventType, durationMs, Date.now()]
  )
  persist()
}

/**
 * Get engagement counts per item (opens + views) for scoring. Returns Map<itemId, count>.
 * @param {number} [sinceMs] - only events after this (optional)
 */
export function getEngagementCountsByItem(sinceMs = 0) {
  const d = getDb()
  const result = d.exec(
    `SELECT item_id AS itemId, COUNT(*) AS cnt
     FROM engagement_events
     WHERE event_type IN ('open', 'view', 'more_like') AND at >= ${Number(sinceMs)}
     GROUP BY item_id`
  )
  if (!result.length || !result[0].values) return new Map()
  const m = new Map()
  const cols = result[0].columns
  const idx = (name) => cols.indexOf(name)
  for (const row of result[0].values) {
    m.set(row[idx('itemId')], row[idx('cnt')])
  }
  return m
}

/**
 * Get item IDs with positive engagement (for similarity / user vector). Optionally since timestamp.
 */
export function getPositiveEngagedItemIds(sinceMs = 0, limit = 100) {
  const d = getDb()
  const result = d.exec(
    `SELECT DISTINCT item_id AS itemId FROM engagement_events
     WHERE event_type IN ('open', 'view', 'more_like') AND at >= ${Number(sinceMs)}
     ORDER BY at DESC LIMIT ${Number(limit)}`
  )
  if (!result.length || !result[0].values) return []
  const cols = result[0].columns
  const idx = cols.indexOf('itemId')
  return result[0].values.map((row) => row[idx])
}
