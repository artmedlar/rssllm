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
    d.run(
      `INSERT INTO items (feed_id, guid, link, title, description, published_at, thumbnail_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (feed_id, guid) DO UPDATE SET
         link = excluded.link,
         title = excluded.title,
         description = excluded.description,
         published_at = excluded.published_at,
         thumbnail_url = excluded.thumbnail_url`,
      [
        feedId,
        it.guid || it.link,
        it.link,
        it.title || '',
        it.description || '',
        it.publishedAt,
        it.thumbnailUrl ?? null,
        created,
      ]
    )
  }
  persist()
}

export function setFeedLastFetched(feedId, lastFetchedAt) {
  getDb().run('UPDATE feeds SET last_fetched_at = ? WHERE id = ?', [lastFetchedAt, feedId])
  persist()
}

export function getUnifiedFeed(page, limit) {
  const d = getDb()
  const offset = page * limit
  const result = d.exec(`
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
    ORDER BY i.published_at DESC
    LIMIT ${limit + 1} OFFSET ${offset}
  `)
  if (!result.length || !result[0].values) return { items: [], hasMore: false }
  const cols = result[0].columns
  const idx = (name) => cols.indexOf(name)
  const rows = result[0].values
  const hasMore = rows.length > limit
  const items = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({
    id: row[idx('id')],
    feedId: row[idx('feedId')],
    feedTitle: row[idx('feedTitle')],
    guid: row[idx('guid')],
    title: row[idx('title')],
    link: row[idx('link')],
    description: row[idx('description')],
    publishedAt: row[idx('publishedAt')],
    thumbnailUrl: row[idx('thumbnailUrl')],
    readAt: row[idx('readAt')],
  }))
  return { items, hasMore }
}

export function markRead(itemId) {
  const readAt = Date.now()
  getDb().run(
    'INSERT INTO read_state (item_id, read_at) VALUES (?, ?) ON CONFLICT (item_id) DO UPDATE SET read_at = excluded.read_at',
    [itemId, readAt]
  )
  persist()
}
