import { useEffect } from 'react'
import { markRead, openExternal } from '../api'

export default function ArticleModal({ item, onClose }) {
  useEffect(() => {
    if (item?.id) markRead(item.id)
  }, [item?.id])

  if (!item) return null

  const handleOpenOriginal = () => {
    openExternal(item.link)
    onClose()
  }

  return (
    <div
      className="article-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="article-modal-title"
    >
      <div className="article-modal" onClick={(e) => e.stopPropagation()}>
        <div className="article-modal-header">
          <h2 id="article-modal-title" className="article-modal-title">
            {item.title || '(no title)'}
          </h2>
          <button type="button" className="btn" onClick={onClose} aria-label="Close">
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
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
