import { useEffect, useRef, useState } from 'react'
import { fetchThumbnailForItem, getClusterSize } from '../api'

function formatTime(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  const now = Date.now()
  const diff = now - d
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
  return d.toLocaleDateString()
}

/** Extract just the short name from a feed title like "Phys.org - latest science and technology news stories" */
function shortSourceName(feedTitle) {
  if (!feedTitle) return ''
  // Split on common separators and take the first chunk
  const parts = feedTitle.split(/\s[-–—|:»]\s/)
  return parts[0].trim()
}

export default function StoryCard({ item, onClick, onThumbnailLoaded, onClusterClick, variant = 'standard' }) {
  const fetchStarted = useRef(false)
  const [clusterSize, setClusterSize] = useState(0)

  useEffect(() => {
    if (item.thumbnailUrl || !item.link || !item.id || fetchStarted.current) return
    fetchStarted.current = true
    fetchThumbnailForItem(item.id).then((res) => {
      if (res?.thumbnailUrl && onThumbnailLoaded) onThumbnailLoaded(item.id, res.thumbnailUrl)
    })
  }, [item.id, item.link, item.thumbnailUrl, onThumbnailLoaded])

  useEffect(() => {
    if (!item.id) return
    getClusterSize(item.id).then((size) => {
      if (size > 1) setClusterSize(size)
    })
  }, [item.id])

  const handleClick = () => onClick(item)
  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick(item)
    }
  }

  const clusterBadge = clusterSize > 1 ? (
    <button
      className="cluster-badge"
      onClick={(e) => {
        e.stopPropagation()
        onClusterClick?.(item)
      }}
      title={`${clusterSize} sources covering this story`}
      aria-label={`${clusterSize} sources`}
    >
      <svg className="cluster-icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <rect x="3" y="1" width="10" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3"/>
        <rect x="5" y="3" width="10" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3"/>
      </svg>
    </button>
  ) : null

  if (variant === 'hero') {
    return (
      <article className="card-hero" onClick={handleClick} role="button" tabIndex={0} onKeyDown={handleKey}>
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" className="card-hero-img" loading="lazy" />
        ) : (
          <div className="card-hero-img card-hero-img--placeholder" aria-hidden />
        )}
        <div className="card-hero-body">
          <span className="card-source">{shortSourceName(item.feedTitle)}</span>
          <h3 className="card-hero-title">{item.title || '(no title)'}</h3>
          {item.description ? (
            <p className="card-hero-snippet">{item.description}</p>
          ) : null}
          <div className="card-hero-footer">
            <span className="card-time">{formatTime(item.publishedAt)}</span>
            {clusterBadge}
          </div>
        </div>
      </article>
    )
  }

  return (
    <article className="card" onClick={handleClick} role="button" tabIndex={0} onKeyDown={handleKey}>
      <div className="card-body">
        <span className="card-source">{shortSourceName(item.feedTitle)}</span>
        <h3 className="card-title">{item.title || '(no title)'}</h3>
        <div className="card-footer">
          <span className="card-time">{formatTime(item.publishedAt)}</span>
          {clusterBadge}
        </div>
      </div>
      {item.thumbnailUrl ? (
        <img src={item.thumbnailUrl} alt="" className="card-thumb" loading="lazy" />
      ) : null}
    </article>
  )
}
