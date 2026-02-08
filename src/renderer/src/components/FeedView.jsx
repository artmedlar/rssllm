import { useState, useEffect, useRef, useCallback } from 'react'
import { getFeed } from '../api'
import StoryCard from './StoryCard'
import ArticleModal from './ArticleModal'

const PAGE_SIZE = 20

const TOPIC_TABS = [
  { id: 'all', label: 'All' },
  { id: 'for_you', label: 'For you' },
  { id: 'news', label: 'News' },
  { id: 'business', label: 'Business' },
  { id: 'sports', label: 'Sports' },
  { id: 'tech', label: 'Tech' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'science', label: 'Science' },
  { id: 'other', label: 'Other' },
]

export default function FeedView({ readFilter = 'unread', refreshKey = 0 }) {
  const [selectedTopic, setSelectedTopic] = useState('all')
  const [items, setItems] = useState([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const sentinelRef = useRef(null)

  const loadPage = useCallback(async (pageNum, topic, filter) => {
    setLoading(true)
    try {
      const { items: next, hasMore: more } = await getFeed(pageNum, PAGE_SIZE, topic, filter)
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
    loadPage(0, selectedTopic, readFilter)
  }, [selectedTopic, readFilter, loadPage])

  useEffect(() => {
    if (refreshKey === 0) return
    setItems([])
    setPage(0)
    setHasMore(true)
    loadPage(0, selectedTopic, readFilter)
  }, [refreshKey])

  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loading) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loading) {
          loadPage(page + 1, selectedTopic, readFilter)
        }
      },
      { rootMargin: '200px', threshold: 0 }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMore, loading, page, selectedTopic, readFilter, loadPage])

  const handleItemRead = (item) => {
    setSelectedItem(item)
  }

  const handleCloseArticle = (readItemId) => {
    if (readItemId) {
      if (readFilter === 'unread') {
        setItems((prev) => prev.filter((i) => i.id !== readItemId))
      } else {
        setItems((prev) =>
          prev.map((i) => (i.id === readItemId ? { ...i, readAt: Date.now() } : i))
        )
      }
    }
    setSelectedItem(null)
  }

  const handleThumbnailLoaded = useCallback((id, url) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, thumbnailUrl: url } : i)))
  }, [])

  return (
    <>
      <div className="topic-tabs">
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
            {readFilter === 'read'
              ? (selectedTopic === 'all'
                ? 'Nothing read yet. Open articles from Feed to see them here.'
                : `No read items in ${TOPIC_TABS.find((t) => t.id === selectedTopic)?.label ?? selectedTopic}.`)
              : selectedTopic === 'for_you'
                ? 'Open and read some articles first. For you uses your engagement to recommend similar items (needs Similarity).'
                : (selectedTopic === 'all'
                  ? 'No items yet. Add feeds in Subscriptions.'
                  : `No items in ${TOPIC_TABS.find((t) => t.id === selectedTopic)?.label ?? selectedTopic}.`)}
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