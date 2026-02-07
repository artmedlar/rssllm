import { useState, useEffect } from 'react'
import { getSubscriptions, addSubscription, removeSubscription } from '../api'

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
    <div className="tab-panel">
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
          <li key={s.id}>
            <span title={s.url}>{s.title || s.url}</span>
            <button
              type="button"
              className="btn"
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
