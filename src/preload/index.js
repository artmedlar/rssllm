import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  subscriptionsList: () => ipcRenderer.invoke('subscriptions:list'),
  subscriptionsAdd: (url) => ipcRenderer.invoke('subscriptions:add', url),
  feedGet: (page, limit) => ipcRenderer.invoke('feed:get', page, limit),
  feedMarkRead: (itemId) => ipcRenderer.invoke('feed:markRead', itemId),
})
