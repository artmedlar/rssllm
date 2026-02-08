import { useState, useEffect, useRef, useCallback } from 'react'
import { getFeed, refreshSubscriptions } from '../api'
import StoryCard from './StoryCard'
import ArticleModal from './ArticleModal'

const PAGE_SIZE = 20

const TOPIC_TABS = [
  { id: 'all', label: 'All' },
  { id: 'news', label: 'News' },
  { id: 'business', label: 'Business' },
  { id: 'sports', label: 'Sports' },
  { id: 'tech', label: 'Tech' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'science', label: 'Science' },
  { id: 'other', label: 'Other' },
]

export default function FeedView() {
  const [selectedTopic, setSelectedTopic] = useState('all')
  const [items, setItems] = useState([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const sentinelRef = useRef(null)

  const loadPage = useCallback(async (pageNum, topic) => {
    setLoading(true)
    try {
      const { items: next, hasMore: more } = await getFeed(pageNum, PAGE_SIZE, topic)
      setItems((prev) => (pageNum === 0 ? next : [...prev, ...next]))
      setHasMore(more)
      setPage(pageNum)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setItems([])
    setPage(0)
    setHasMore(true)
    loadPage(0, selectedTopic)
  }, [selectedTopic, loadPage])

  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loading) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loading) {
          loadPage(page + 1, selectedTopic)
        }
      },
      { rootMargin: '200px', threshold: 0 }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMore, loading, page, selectedTopic, loadPage])

  const handleItemRead = (item) => {
    setSelectedItem(item)
  }

  const handleCloseArticle = (readItemId) => {
    if (readItemId) {
      setItems((prev) =>
        prev.map((i) => (i.id === readItemId ? { ...i, readAt: Date.now() } : i))
      )
    }
    setSelectedItem(null)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshSubscriptions()
      setItems([])
      setPage(0)
      setHasMore(true)
      loadPage(0, selectedTopic)
    } finally {
      setRefreshing(false)
    }
  }

  const handleThumbnailLoaded = useCallback((id, url) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, thumbnailUrl: url } : i)))
  }, [])

  return (
    <>
      <div className="topic-tabs">
        <button
          type="button"
          className="btn topic-tab-refresh"
          onClick={handleRefresh}
          disabled={refreshing}
          title="Re-fetch all feeds for new items"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        {TOPIC_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={selectedTopic === tab.id ? 'active' : ''}
            onClick={() => setSelectedTopic(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="feed-list">
        {items.map((item) => (
          <StoryCard
            key={item.id}
            item={item}
            onClick={handleItemRead}
            onThumbnailLoaded={handleThumbnailLoaded}
          />
        ))}
        <div ref={sentinelRef} style={{ height: 1 }} aria-hidden />
        {loading && items.length > 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 16 }}>
            Loading…
          </p>
        ) : null}
        {!hasMore && items.length > 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 16 }}>
            End of feed
          </p>
        ) : null}
        {items.length === 0 && !loading ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 24 }}>
            {selectedTopic === 'all'
              ? 'No items yet. Add feeds in Subscriptions.'
              : `No items in ${TOPIC_TABS.find((t) => t.id === selectedTopic)?.label ?? selectedTopic}.`}
          </p>
        ) : null}
      </div>
      {selectedItem ? (
        <ArticleModal
          item={selectedItem}
          onClose={() => handleCloseArticle(selectedItem.id)}
        />
      ) : null}
    </>
  )
}