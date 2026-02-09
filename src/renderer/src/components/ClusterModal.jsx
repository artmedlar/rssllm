import { useState, useEffect } from 'react'
import { getClusterMembersForItem, openExternal } from '../api'

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

export default function ClusterModal({ item, onClose }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!item?.id) return
    setLoading(true)
    getClusterMembersForItem(item.id).then((m) => {
      setMembers(m)
      setLoading(false)
    })
  }, [item?.id])

  if (!item) return null

  return (
    <div
      className="article-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="article-modal cluster-modal" onClick={(e) => e.stopPropagation()}>
        <div className="article-modal-header">
          <h2 className="article-modal-title">
            Full coverage: {item.title || '(no title)'}
          </h2>
          <button type="button" className="btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="article-modal-body">
          {loading ? (
            <p style={{ color: 'var(--color-text-muted)' }}>Loading sources...</p>
          ) : members.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)' }}>No other sources found.</p>
          ) : (
            <ul className="cluster-list">
              {members.map((m) => (
                <li
                  key={m.itemId}
                  className="cluster-item"
                  onClick={() => openExternal(m.link)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="cluster-item-body">
                    <span className="card-source">{m.feedTitle}</span>
                    <span className="cluster-item-title">{m.title}</span>
                    <span className="card-time">{formatTime(m.publishedAt)}</span>
                  </div>
                  {m.thumbnailUrl ? (
                    <img src={m.thumbnailUrl} alt="" className="cluster-item-thumb" />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="article-modal-actions">
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
