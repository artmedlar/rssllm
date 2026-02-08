import { useState, useEffect } from 'react'
import FeedView from './components/FeedView'
import SubscriptionsView from './components/SubscriptionsView'
import { refreshSubscriptions, isOllamaAvailable } from './api'

export default function App() {
  const [activeTab, setActiveTab] = useState('feed') // 'feed' | 'subscriptions'
  const [readFilter, setReadFilter] = useState('unread') // 'unread' | 'read' (when on feed)
  const [refreshKey, setRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [ollamaAvailable, setOllamaAvailable] = useState(false)

  useEffect(() => {
    const check = () => isOllamaAvailable().then(setOllamaAvailable)
    check()
    const t = setInterval(check, 15000)
    return () => clearInterval(t)
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshSubscriptions()
      setRefreshKey((k) => k + 1)
    } finally {
      setRefreshing(false)
    }
  }

  const onFeed = activeTab === 'feed' && readFilter === 'unread'
  const onArchive = activeTab === 'feed' && readFilter === 'read'
  const onSubscriptions = activeTab === 'subscriptions'

  return (
    <div className="app-layout">
      <header className="top-bar" role="navigation">
        <button
          type="button"
          className={onFeed ? 'active' : ''}
          onClick={() => {
            setActiveTab('feed')
            setReadFilter('unread')
          }}
        >
          Feed
        </button>
        <button
          type="button"
          className={onArchive ? 'active' : ''}
          onClick={() => {
            setActiveTab('feed')
            setReadFilter('read')
          }}
        >
          Archive
        </button>
        <button
          type="button"
          className={onSubscriptions ? 'active' : ''}
          onClick={() => setActiveTab('subscriptions')}
        >
          Subscriptions
        </button>
        {activeTab === 'feed' ? (
          <button
            type="button"
            className="top-bar-refresh"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Re-fetch all feeds"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        ) : null}
        {ollamaAvailable ? (
          <span className="top-bar-similarity" title="Ollama running: “More like this” uses similarity">
            Similarity
          </span>
        ) : null}
      </header>
      <main className="tab-panel" role="tabpanel">
        {activeTab === 'feed' ? (
          <FeedView readFilter={readFilter} refreshKey={refreshKey} />
        ) : (
          <SubscriptionsView />
        )}
      </main>
    </div>
  )
}
