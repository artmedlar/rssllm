import { useState, useEffect, useRef, useCallback } from 'react'
import { getFeed } from '../api'
import StoryCard from './StoryCard'
import ArticleModal from './ArticleModal'

const PAGE_SIZE = 20

export default function FeedView() {
  const [items, setItems] = useState([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const sentinelRef = useRef(null)

  const loadPage = useCallback(async (pageNum) => {
    setLoading(true)
    try {
      const { items: next, hasMore: more } = await getFeed(pageNum, PAGE_SIZE)
      setItems((prev) => (pageNum === 0 ? next : [...prev, ...next]))
      setHasMore(more)
      setPage(pageNum)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPage(0)
  }, [loadPage])

  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loading) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loading) {
          loadPage(page + 1)
        }
      },
      { rootMargin: '200px', threshold: 0 }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMore, loading, page, loadPage])

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

  return (
    <>
      <div className="feed-list">
        {items.map((item) => (
          <StoryCard
            key={item.id}
            item={item}
            onClick={handleItemRead}
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
            No items yet. Add feeds in Subscriptions.
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
