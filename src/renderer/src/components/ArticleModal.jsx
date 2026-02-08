import { useEffect, useRef } from 'react'
import { markRead, openExternal, recordEngagement } from '../api'

export default function ArticleModal({ item, onClose }) {
  const openedAtRef = useRef(null)

  useEffect(() => {
    if (item?.id) {
      markRead(item.id)
      recordEngagement('open', item.id)
      openedAtRef.current = Date.now()
    }
  }, [item?.id])

  if (!item) return null

  const handleClose = () => {
    if (openedAtRef.current != null) {
      const durationMs = Date.now() - openedAtRef.current
      recordEngagement('view', item.id, durationMs)
    }
    onClose(item.id)
  }

  const handleOpenOriginal = () => {
    if (openedAtRef.current != null) {
      const durationMs = Date.now() - openedAtRef.current
      recordEngagement('view', item.id, durationMs)
    }
    openExternal(item.link)
    onClose(item.id)
  }

  return (
    <div
      className="article-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="article-modal-title"
    >
      <div className="article-modal" onClick={(e) => e.stopPropagation()}>
        <div className="article-modal-header">
          <h2 id="article-modal-title" className="article-modal-title">
            {item.title || '(no title)'}
          </h2>
          <button type="button" className="btn" onClick={handleClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="article-modal-body">
          {item.description ? (
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{item.description}</p>
          ) : (
            <p style={{ color: 'var(--color-text-muted)' }}>No excerpt.</p>
          )}
        </div>
        <div className="article-modal-actions">
          <button type="button" className="btn btn-primary" onClick={handleOpenOriginal}>
            Open original
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => recordEngagement('more_like', item.id)}
            title="Show more like this"
          >
            More like this
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => recordEngagement('less_like', item.id)}
            title="Show less like this"
          >
            Less like this
          </button>
          <button type="button" className="btn" onClick={handleClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
