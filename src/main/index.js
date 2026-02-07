import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { initDb, addFeed as dbAddFeed, getFeeds, getUnifiedFeed, markRead as dbMarkRead, upsertItems, setFeedLastFetched } from './db.js'
import { fetchAndParse } from './feed.js'

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

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }
}

app.whenReady().then(async () => {
  const dbPath = path.join(app.getPath('userData'), 'rss-reader.db')
  await initDb(dbPath)

  createWindow()

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
  const feedId = dbAddFeed(url, title)
  if (items.length) {
    upsertItems(feedId, items)
  }
  setFeedLastFetched(feedId, Date.now())
  return { id: feedId, url, title }
})

ipcMain.handle('feed:get', (_event, page = 0, limit = 30) => {
  return getUnifiedFeed(Number(page), Math.min(Number(limit) || 30, 100))
})

ipcMain.handle('feed:markRead', (_event, itemId) => {
  dbMarkRead(Number(itemId))
  return true
})
