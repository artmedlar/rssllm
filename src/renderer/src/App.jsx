import { useState, useEffect } from 'react'
import FeedView from './components/FeedView'
import SubscriptionsView from './components/SubscriptionsView'
import { refreshSubscriptions, isOllamaAvailable, getBackgroundStatus } from './api'

const TOPIC_TABS = [
  { id: 'home', label: 'Home' },
  { id: 'for_you', label: 'For you' },
  { id: 'news', label: 'News' },
  { id: 'business', label: 'Business' },
  { id: 'tech', label: 'Tech' },
  { id: 'science', label: 'Science' },
  { id: 'sports', label: 'Sports' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'other', label: 'Other' },
]

export default function App() {
  const [selectedTopic, setSelectedTopic] = useState('home')
  const [showSubscriptions, setShowSubscriptions] = useState(false)
  const [readFilter, setReadFilter] = useState('unread')
  const [refreshKey, setRefreshKey] = useState(0)
  const [ollamaAvailable, setOllamaAvailable] = useState(false)
  const [pendingStatus, setPendingStatus] = useState({ newItemCount: 0, hasChanges: false, cycleInProgress: false })

  useEffect(() => {
    const check = () => isOllamaAvailable().then(setOllamaAvailable)
    check()
    const t = setInterval(check, 15000)
    return () => clearInterval(t)
  }, [])

  // Poll background status every 5 seconds
  useEffect(() => {
    const poll = () => getBackgroundStatus().then(setPendingStatus)
    poll()
    const t = setInterval(poll, 5000)
    return () => clearInterval(t)
  }, [])

  const handleRefresh = async () => {
    if (!pendingStatus.hasChanges) return // no-op if nothing pending
    await refreshSubscriptions()
    setRefreshKey((k) => k + 1)
    setPendingStatus((s) => ({ ...s, newItemCount: 0, hasChanges: false }))
  }

  const handleTopicClick = (topicId) => {
    setSelectedTopic(topicId)
    setShowSubscriptions(false)
  }

  const refreshState = pendingStatus.hasChanges
    ? 'ready'            // green: new items available
    : pendingStatus.cycleInProgress
      ? 'working'        // subtle: background is fetching
      : 'idle'           // normal: nothing happening

  return (
    <div className="app-layout">
      <header className="top-bar" role="navigation">
        <div className="top-bar-brand" onClick={() => handleTopicClick('home')} role="button" tabIndex={0}>
          OhAI!
        </div>
        <nav className="top-bar-tabs">
          {TOPIC_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={!showSubscriptions && selectedTopic === tab.id ? 'active' : ''}
              onClick={() => handleTopicClick(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="top-bar-actions">
          <button
            type="button"
            className={readFilter === 'read' && !showSubscriptions ? 'active' : ''}
            onClick={() => {
              setReadFilter(readFilter === 'read' ? 'unread' : 'read')
              setShowSubscriptions(false)
            }}
            title="Toggle archive (read items)"
          >
            Archive
          </button>
          <button
            type="button"
            className={showSubscriptions ? 'active' : ''}
            onClick={() => setShowSubscriptions(!showSubscriptions)}
          >
            Subscriptions
          </button>
          <button
            type="button"
            className={`top-bar-refresh ${refreshState === 'ready' ? 'refresh-ready' : ''}`}
            onClick={handleRefresh}
            disabled={refreshState === 'idle'}
            title={
              refreshState === 'ready'
                ? `${pendingStatus.newItemCount} new item${pendingStatus.newItemCount !== 1 ? 's' : ''} available`
                : refreshState === 'working'
                  ? 'Checking feeds...'
                  : 'Up to date'
            }
          >
            ↻
          </button>
          {ollamaAvailable ? (
            <span
              className={`top-bar-ai ${pendingStatus.cycleInProgress ? 'ai-active' : ''}`}
              title={pendingStatus.cycleInProgress ? 'AI processing...' : 'AI enabled'}
            >
              AI
            </span>
          ) : null}
        </div>
      </header>
      <main className="main-content">
        {showSubscriptions ? (
          <SubscriptionsView />
        ) : (
          <FeedView
            selectedTopic={selectedTopic}
            readFilter={readFilter}
            refreshKey={refreshKey}
            onNavigateTopic={handleTopicClick}
          />
        )}
      </main>
    </div>
  )
}
