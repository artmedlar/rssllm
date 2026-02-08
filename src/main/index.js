import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { initDb, addFeed as dbAddFeed, getFeeds, setFeedLastFetched, markRead as dbMarkRead, upsertItems, removeFeed as dbRemoveFeed, recordEngagement as dbRecordEngagement, getItemById, updateItemThumbnail } from './db.js'
import { getRankedFeed } from './rank.js'
import { fetchAndParse } from './feed.js'
import { classifyTopic } from './classifier.js'
import { fetchOgImage } from './ogImage.js'
import { isAvailable as ollamaIsAvailable, ensureRunning as ollamaEnsureRunning } from './ollama.js'

const FEED_TOPICS = ['all', 'other', 'news', 'business', 'sports', 'tech', 'entertainment', 'science']

/** When user clicks "More like this", next feed load boosts items similar to this id. Cleared after one use. */
let lastMoreLikeItemId = null

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const isDev = process.env.NODE_ENV !== 'production'

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
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

  createWindow()

  ollamaEnsureRunning()

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

ipcMain.handle('feed:get', async (_event, page = 0, limit = 30, topic = 'all') => {
  const safeTopic = FEED_TOPICS.includes(topic) ? topic : 'all'
  const similarTo = lastMoreLikeItemId
  lastMoreLikeItemId = null
  return getRankedFeed(Number(page), Math.min(Number(limit) || 30, 100), safeTopic, similarTo)
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
  const feeds = getFeeds()
  for (const feed of feeds) {
    try {
      const { items } = await fetchAndParse(feed.url)
      const itemsWithTopic = items.map((it) => ({
        ...it,
        topic: classifyTopic(it.title, it.description),
      }))
      if (itemsWithTopic.length) upsertItems(feed.id, itemsWithTopic)
      setFeedLastFetched(feed.id, Date.now())
    } catch (_) {
      // skip failed feed, continue with others
    }
  }
  return { refreshed: feeds.length }
})

const THUMBNAIL_CONCURRENCY = 5
let thumbnailActive = 0
const thumbnailQueue = []

function runThumbnailQueue() {
  while (thumbnailQueue.length > 0 && thumbnailActive < THUMBNAIL_CONCURRENCY) {
    thumbnailActive += 1
    const { resolve, itemId } = thumbnailQueue.shift()
    const item = getItemById(itemId)
    if (!item?.link) {
      thumbnailActive -= 1
      resolve({ itemId, thumbnailUrl: null })
      runThumbnailQueue()
      return
    }
    fetchOgImage(item.link).then((thumbnailUrl) => {
      if (thumbnailUrl) updateItemThumbnail(itemId, thumbnailUrl)
      thumbnailActive -= 1
      resolve({ itemId, thumbnailUrl })
      runThumbnailQueue()
    }).catch(() => {
      thumbnailActive -= 1
      resolve({ itemId, thumbnailUrl: null })
      runThumbnailQueue()
    })
  }
}

ipcMain.handle('thumbnail:fetch', (_event, itemId) => {
  const itemIdNum = Number(itemId)
  if (thumbnailActive < THUMBNAIL_CONCURRENCY) {
    thumbnailActive += 1
    const item = getItemById(itemIdNum)
    if (!item?.link) {
      thumbnailActive -= 1
      return Promise.resolve({ itemId: itemIdNum, thumbnailUrl: null })
    }
    return fetchOgImage(item.link).then((thumbnailUrl) => {
      if (thumbnailUrl) updateItemThumbnail(itemIdNum, thumbnailUrl)
      thumbnailActive -= 1
      runThumbnailQueue()
      return { itemId: itemIdNum, thumbnailUrl }
    }).catch(() => {
      thumbnailActive -= 1
      runThumbnailQueue()
      return { itemId: itemIdNum, thumbnailUrl: null }
    })
  }
  return new Promise((resolve) => {
    thumbnailQueue.push({ resolve, itemId: itemIdNum })
  })
})

ipcMain.handle('ollama:available', async () => ollamaIsAvailable())

ipcMain.handle('openExternal', (_event, url) => {
  if (url && typeof url === 'string') shell.openExternal(url)
})
