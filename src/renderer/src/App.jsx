import { useState, useEffect } from 'react'
import { getSubscriptions, addSubscription, getFeed } from './api'

function App() {
  const [pong, setPong] = useState(null)
  const [subscriptions, setSubscriptions] = useState([])
  const [feed, setFeed] = useState({ items: [], hasMore: false })
  const [addUrl, setAddUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (window.electronAPI?.ping) {
      window.electronAPI.ping().then(setPong)
    }
  }, [])

  useEffect(() => {
    getSubscriptions().then(setSubscriptions)
    getFeed(0, 20).then(setFeed)
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!addUrl.trim()) return
    setError(null)
    setAdding(true)
    try {
      await addSubscription(addUrl.trim())
      setAddUrl('')
      setSubscriptions(await getSubscriptions())
      setFeed(await getFeed(0, 20))
    } catch (err) {
      setError(err?.message || 'Failed to add feed')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 720 }}>
      <h1>RSS Reader</h1>
      <p>Phase 2: Data layer (SQLite + RSS fetch + IPC).</p>
      {pong && <p>IPC: {pong}</p>}

      <section style={{ marginTop: 24 }}>
        <h2>Add feed</h2>
        <form onSubmit={handleAdd}>
          <input
            type="url"
            value={addUrl}
            onChange={(e) => setAddUrl(e.target.value)}
            placeholder="https://example.com/feed.xml"
            style={{ width: 320, padding: 8, marginRight: 8 }}
          />
          <button type="submit" disabled={adding}>
            {adding ? 'Adding…' : 'Add'}
          </button>
        </form>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Subscriptions ({subscriptions.length})</h2>
        <ul>
          {subscriptions.map((s) => (
            <li key={s.id}>{s.title || s.url}</li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Feed ({feed.items.length} items)</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {feed.items.map((item) => (
            <li key={item.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #eee' }}>
              <strong>{item.title || '(no title)'}</strong>
              <br />
              <small>{item.feedTitle} · {item.readAt ? 'Read' : 'Unread'}</small>
              <br />
              <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14 }}>
                {item.link}
              </a>
            </li>
          ))}
        </ul>
        {feed.hasMore && <p>… more (pagination in Phase 3)</p>}
      </section>
    </div>
  )
}

export default App
