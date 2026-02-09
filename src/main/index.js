import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import { initDb, addFeed as dbAddFeed, getFeeds, setFeedLastFetched, markRead as dbMarkRead, upsertItems, removeFeed as dbRemoveFeed, recordEngagement as dbRecordEngagement, getItemById, updateItemThumbnail, getClusterSizeForItem, getClusterMembers, getClusterForItem } from './db.js'
import { getRankedFeed } from './rank.js'
import { fetchAndParse } from './feed.js'
import { classifyTopic } from './classifier.js'
import { fetchOgImage } from './ogImage.js'
import { isAvailable as ollamaIsAvailable, ensureRunning as ollamaEnsureRunning } from './ollama.js'
import { start as startBackgroundLoop, getPendingStatus, applyPending } from './backgroundLoop.js'

const FEED_TOPICS = ['all', 'for_you', 'other', 'news', 'business', 'sports', 'tech', 'entertainment', 'science']

/** When user clicks "More like this", next feed load boosts items similar to this id. Cleared after one use. */
let lastMoreLikeItemId = null

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const isDev = process.env.NODE_ENV !== 'production'

function getIconPath() {
  const buildDir = path.join(__dirname, '../../build')
  const png = path.join(buildDir, 'icon.png')
  return existsSync(png) ? png : null
}

function createWindow() {
  const iconPath = getIconPath()
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    ...(iconPath && { icon: iconPath }),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL || (isDev ? 'http://localhost:5173/' : null)
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }
}

app.whenReady().then(async () => {
  const dbPath = path.join(app.getPath('userData'), 'rss-reader.db')
  await initDb(dbPath)

  const iconPath = getIconPath()
  if (iconPath && process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(iconPath)
  }

  createWindow()

  ollamaEnsureRunning()
  startBackgroundLoop()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// --- IPC ---
ipcMain.handle('ping', () => 'pong')

ipcMain.handle('subscriptions:list', () => getFeeds())

ipcMain.handle('subscriptions:add', async (_event, url) => {
  if (!url || typeof url !== 'string') throw new Error('URL required')
  const { title, items } = await fetchAndParse(url)
  const itemsWithTopic = items.map((it) => ({
    ...it,
    topic: classifyTopic(it.title, it.description),
  }))
  const feedId = dbAddFeed(url, title)
  if (itemsWithTopic.length) {
    upsertItems(feedId, itemsWithTopic)
  }
  setFeedLastFetched(feedId, Date.now())
  return { id: feedId, url, title }
})

ipcMain.handle('feed:get', async (_event, page = 0, limit = 30, topic = 'all', readFilter = 'unread') => {
  const safeTopic = FEED_TOPICS.includes(topic) ? topic : 'all'
  const safeRead = readFilter === 'read' ? 'read' : 'unread'
  const similarTo = safeRead === 'unread' ? lastMoreLikeItemId : null
  if (safeRead === 'unread') lastMoreLikeItemId = null
  return getRankedFeed(Number(page), Math.min(Number(limit) || 30, 100), safeTopic, similarTo, safeRead)
})

ipcMain.handle('feed:markRead', (_event, itemId) => {
  dbMarkRead(Number(itemId))
  return true
})

ipcMain.handle('engagement:record', (_event, eventType, itemId, durationMs) => {
  const allowed = ['open', 'view', 'more_like', 'less_like']
  if (!allowed.includes(eventType)) return false
  if (eventType === 'more_like') lastMoreLikeItemId = Number(itemId)
  dbRecordEngagement(Number(itemId), eventType, durationMs != null ? Number(durationMs) : null)
  return true
})

ipcMain.handle('subscriptions:remove', (_event, feedId) => {
  dbRemoveFeed(Number(feedId))
  return true
})

ipcMain.handle('subscriptions:refresh', async () => {
  // "Refresh" now means: apply pending background items so the UI re-reads from DB.
  // The background loop handles actual feed fetching continuously.
  const result = applyPending()
  return { refreshed: result.applied }
})

ipcMain.handle('background:status', () => getPendingStatus())

/** Per-host queue: max 1 concurrent fetch per hostname to avoid 429 rate limits. */
const hostQueues = new Map()

function enqueueForHost(host, fn) {
  if (!hostQueues.has(host)) hostQueues.set(host, Promise.resolve())
  const chain = hostQueues.get(host).then(fn, fn)
  hostQueues.set(host, chain)
  return chain
}

function getHost(link) {
  try { return new URL(link).hostname } catch { return '_default' }
}

function doThumbnailFetch(itemId, link) {
  const host = getHost(link)
  return enqueueForHost(host, () =>
    fetchOgImage(link).then((thumbnailUrl) => {
      if (thumbnailUrl) updateItemThumbnail(itemId, thumbnailUrl)
      return { itemId, thumbnailUrl }
    }).catch(() => ({ itemId, thumbnailUrl: null }))
  )
}

ipcMain.handle('thumbnail:fetch', (_event, itemId) => {
  const itemIdNum = Number(itemId)
  const item = getItemById(itemIdNum)
  if (!item?.link) return Promise.resolve({ itemId: itemIdNum, thumbnailUrl: null })
  return doThumbnailFetch(itemIdNum, item.link)
})

ipcMain.handle('ollama:available', async () => ollamaIsAvailable())

ipcMain.handle('cluster:size', (_event, itemId) => {
  return getClusterSizeForItem(Number(itemId))
})

ipcMain.handle('cluster:members', (_event, itemId) => {
  const clusterId = getClusterForItem(Number(itemId))
  if (clusterId == null) return []
  return getClusterMembers(clusterId)
})

ipcMain.handle('openExternal', (_event, url) => {
  if (url && typeof url === 'string') shell.openExternal(url)
})
