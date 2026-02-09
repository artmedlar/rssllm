import { useState, useEffect, useRef, useCallback } from 'react'
import { getFeed } from '../api'
import StoryCard from './StoryCard'
import ArticleModal from './ArticleModal'

const SECTION_TOPICS = [
  { id: 'news', label: 'News' },
  { id: 'tech', label: 'Technology' },
  { id: 'science', label: 'Science' },
  { id: 'business', label: 'Business' },
  { id: 'sports', label: 'Sports' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'other', label: 'Other' },
]

const PAGE_SIZE = 20
const SECTION_SIZE = 6

export default function FeedView({ selectedTopic = 'home', readFilter = 'unread', refreshKey = 0, onNavigateTopic }) {
  const [selectedItem, setSelectedItem] = useState(null)

  // For "home" mode: sectioned data
  const [topStories, setTopStories] = useState([])
  const [sections, setSections] = useState([])
  const [homeLoading, setHomeLoading] = useState(false)

  // For single-topic mode: paginated flat list
  const [items, setItems] = useState([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef(null)

  const isHome = selectedTopic === 'home'

  // Deduplicate items: by id, then by normalized title (catches same story from different feeds)
  function dedup(items, seenIds, seenTitles) {
    const out = []
    for (const item of items) {
      if (seenIds.has(item.id)) continue
      const normTitle = (item.title || '').toLowerCase().trim()
      if (normTitle && seenTitles.has(normTitle)) continue
      seenIds.add(item.id)
      if (normTitle) seenTitles.add(normTitle)
      out.push(item)
    }
    return out
  }

  // Load home sections
  const loadHome = useCallback(async (filter) => {
    setHomeLoading(true)
    try {
      const seenIds = new Set()
      const seenTitles = new Set()

      // Fetch top stories (all topics, first page)
      const topResult = await getFeed(0, 5, 'all', filter)
      const topItems = dedup(topResult.items, seenIds, seenTitles)
      setTopStories(topItems)

      // Fetch a few items per topic for sections, deduplicating against top stories and earlier sections
      const sectionData = await Promise.all(
        SECTION_TOPICS.map(async (t) => {
          const result = await getFeed(0, SECTION_SIZE + 4, t.id, filter)
          return { ...t, rawItems: result.items }
        })
      )
      const dedupedSections = sectionData.map((s) => ({
        id: s.id,
        label: s.label,
        items: dedup(s.rawItems, seenIds, seenTitles).slice(0, SECTION_SIZE),
      })).filter((s) => s.items.length > 0)

      setSections(dedupedSections)
    } finally {
      setHomeLoading(false)
    }
  }, [])

  // Load single-topic flat list
  const loadPage = useCallback(async (pageNum, topic, filter) => {
    setLoading(true)
    try {
      const feedTopic = topic === 'for_you' ? 'for_you' : topic
      const { items: next, hasMore: more } = await getFeed(pageNum, PAGE_SIZE, feedTopic, filter)
      setItems((prev) => (pageNum === 0 ? next : [...prev, ...next]))
      setHasMore(more)
      setPage(pageNum)
    } finally {
      setLoading(false)
    }
  }, [])

  // Reset on topic/filter change
  useEffect(() => {
    if (isHome) {
      loadHome(readFilter)
    } else {
      setItems([])
      setPage(0)
      setHasMore(true)
      loadPage(0, selectedTopic, readFilter)
    }
  }, [selectedTopic, readFilter, loadHome, loadPage, isHome])

  // Refresh
  useEffect(() => {
    if (refreshKey === 0) return
    if (isHome) {
      loadHome(readFilter)
    } else {
      setItems([])
      setPage(0)
      setHasMore(true)
      loadPage(0, selectedTopic, readFilter)
    }
  }, [refreshKey])

  // Infinite scroll for flat list
  useEffect(() => {
    if (isHome || !sentinelRef.current || !hasMore || loading) return
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
  }, [isHome, hasMore, loading, page, selectedTopic, readFilter, loadPage])

  const handleItemClick = (item) => setSelectedItem(item)

  const handleCloseArticle = (readItemId) => {
    if (readItemId) {
      if (isHome) {
        // Remove from home sections
        if (readFilter === 'unread') {
          setTopStories((prev) => prev.filter((i) => i.id !== readItemId))
          setSections((prev) =>
            prev.map((s) => ({ ...s, items: s.items.filter((i) => i.id !== readItemId) }))
              .filter((s) => s.items.length > 0)
          )
        }
      } else {
        if (readFilter === 'unread') {
          setItems((prev) => prev.filter((i) => i.id !== readItemId))
        } else {
          setItems((prev) =>
            prev.map((i) => (i.id === readItemId ? { ...i, readAt: Date.now() } : i))
          )
        }
      }
    }
    setSelectedItem(null)
  }

  const handleThumbnailLoaded = useCallback((id, url) => {
    // Update in both home and flat data
    setTopStories((prev) => prev.map((i) => (i.id === id ? { ...i, thumbnailUrl: url } : i)))
    setSections((prev) =>
      prev.map((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === id ? { ...i, thumbnailUrl: url } : i)),
      }))
    )
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, thumbnailUrl: url } : i)))
  }, [])

  // Home view: sectioned layout
  if (isHome) {
    if (homeLoading && topStories.length === 0) {
      return <div className="feed-empty">Loading...</div>
    }
    if (topStories.length === 0 && sections.length === 0) {
      return (
        <div className="feed-empty">
          No items yet. Add feeds in Subscriptions.
        </div>
      )
    }
    return (
      <div className="home-feed">
        {/* Top Stories */}
        {topStories.length > 0 && (
          <section className="feed-section">
            <h2 className="section-heading">Top stories</h2>

            <div className="top-stories-grid">
              {topStories[0] && (
                <StoryCard
                  item={topStories[0]}
                  variant="hero"
                  onClick={handleItemClick}
                  onThumbnailLoaded={handleThumbnailLoaded}
                />
              )}
              <div className="top-stories-sidebar">
                {topStories.slice(1).map((item) => (
                  <StoryCard
                    key={item.id}
                    item={item}
                    onClick={handleItemClick}
                    onThumbnailLoaded={handleThumbnailLoaded}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Topic sections */}
        {sections.map((section) => (
          <section key={section.id} className="feed-section">
            <h2
              className="section-heading section-heading--link"
              onClick={() => onNavigateTopic?.(section.id)}
              role="button"
              tabIndex={0}
            >
              {section.label} <span className="section-arrow">›</span>
            </h2>
            <div className="section-grid">
              {section.items.map((item) => (
                <StoryCard
                  key={item.id}
                  item={item}
                  onClick={handleItemClick}
                  onThumbnailLoaded={handleThumbnailLoaded}
                />
              ))}
            </div>
          </section>
        ))}

        {selectedItem ? (
          <ArticleModal item={selectedItem} onClose={() => handleCloseArticle(selectedItem.id)} />
        ) : null}
      </div>
    )
  }

  // Single topic: flat feed with infinite scroll
  return (
    <div className="topic-feed">
      <div className="feed-list">
        {items.map((item) => (
          <StoryCard
            key={item.id}
            item={item}
            onClick={handleItemClick}
            onThumbnailLoaded={handleThumbnailLoaded}
          />
        ))}
        <div ref={sentinelRef} style={{ height: 1 }} aria-hidden />
        {loading && items.length > 0 ? (
          <p className="feed-status">Loading...</p>
        ) : null}
        {!hasMore && items.length > 0 ? (
          <p className="feed-status">End of feed</p>
        ) : null}
        {items.length === 0 && !loading ? (
          <div className="feed-empty">
            {selectedTopic === 'for_you'
              ? 'Open and read some articles first. For you uses your engagement to find similar items.'
              : `No items in this topic.`}
          </div>
        ) : null}
      </div>
      {selectedItem ? (
        <ArticleModal item={selectedItem} onClose={() => handleCloseArticle(selectedItem.id)} />
      ) : null}
    </div>
  )
}
