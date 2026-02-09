import { useState, useEffect } from 'react'
import { getSubscriptions, addSubscription, removeSubscription } from '../api'

function formatLastFetched(ms) {
  if (!ms) return 'Never'
  const d = new Date(ms)
  const now = Date.now()
  const diff = now - d
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
  return d.toLocaleDateString()
}

export default function SubscriptionsView() {
  const [subscriptions, setSubscriptions] = useState([])
  const [addUrl, setAddUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState(null)
  const [error, setError] = useState(null)

  const load = () => getSubscriptions().then(setSubscriptions)

  useEffect(() => {
    load()
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!addUrl.trim()) return
    setError(null)
    setAdding(true)
    try {
      await addSubscription(addUrl.trim())
      setAddUrl('')
      load()
    } catch (err) {
      setError(err?.message || 'Failed to add feed')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (feedId) => {
    setRemovingId(feedId)
    try {
      await removeSubscription(feedId)
      load()
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Subscriptions</h2>
      <form className="add-feed-form" onSubmit={handleAdd}>
        <input
          type="url"
          value={addUrl}
          onChange={(e) => setAddUrl(e.target.value)}
          placeholder="https://example.com/feed.xml"
          aria-label="Feed URL"
        />
        <button type="submit" className="btn btn-primary" disabled={adding}>
          {adding ? 'Adding…' : 'Add feed'}
        </button>
      </form>
      {error ? (
        <p style={{ color: 'crimson', marginBottom: 16 }}>{error}</p>
      ) : null}
      <ul className="subscriptions-list">
        {subscriptions.map((s) => (
          <li key={s.id} className="subscription-item">
            <div className="subscription-item-body">
              <strong className="subscription-item-title">{s.title || '(no title)'}</strong>
              <p className="subscription-item-url" title={s.url}>
                {s.url}
              </p>
              <p className="subscription-item-meta">
                Last fetched: {formatLastFetched(s.lastFetchedAt)}
              </p>
            </div>
            <button
              type="button"
              className="btn subscription-item-remove"
              onClick={() => handleRemove(s.id)}
              disabled={removingId === s.id}
              aria-label={`Remove ${s.title || s.url}`}
            >
              {removingId === s.id ? '…' : 'Remove'}
            </button>
          </li>
        ))}
      </ul>
      {subscriptions.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No subscriptions yet. Add a feed above.</p>
      ) : null}
    </div>
  )
}
