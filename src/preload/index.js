import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  subscriptionsList: () => ipcRenderer.invoke('subscriptions:list'),
  subscriptionsAdd: (url) => ipcRenderer.invoke('subscriptions:add', url),
  subscriptionsRemove: (feedId) => ipcRenderer.invoke('subscriptions:remove', feedId),
  feedGet: (page, limit, topic) => ipcRenderer.invoke('feed:get', page, limit, topic),
  feedMarkRead: (itemId) => ipcRenderer.invoke('feed:markRead', itemId),
  openExternal: (url) => ipcRenderer.invoke('openExternal', url),
})
