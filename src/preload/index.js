import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  subscriptionsList: () => ipcRenderer.invoke('subscriptions:list'),
  subscriptionsAdd: (url) => ipcRenderer.invoke('subscriptions:add', url),
  subscriptionsRemove: (feedId) => ipcRenderer.invoke('subscriptions:remove', feedId),
  subscriptionsRefresh: () => ipcRenderer.invoke('subscriptions:refresh'),
  feedGet: (page, limit, topic, readFilter) => ipcRenderer.invoke('feed:get', page, limit, topic, readFilter),
  feedMarkRead: (itemId) => ipcRenderer.invoke('feed:markRead', itemId),
  openExternal: (url) => ipcRenderer.invoke('openExternal', url),
  engagementRecord: (eventType, itemId, durationMs) =>
    ipcRenderer.invoke('engagement:record', eventType, itemId, durationMs),
  thumbnailFetch: (itemId) => ipcRenderer.invoke('thumbnail:fetch', itemId),
  ollamaAvailable: () => ipcRenderer.invoke('ollama:available'),
})
