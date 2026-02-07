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

export default function StoryCard({ item, onClick }) {
  const isUnread = !item.readAt

  return (
    <article
      className={`story-card ${isUnread ? 'unread' : ''}`}
      onClick={() => onClick(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(item)
        }
      }}
    >
      {item.thumbnailUrl ? (
        <img
          src={item.thumbnailUrl}
          alt=""
          className="story-card-thumb"
          loading="lazy"
        />
      ) : (
        <div className="story-card-thumb" aria-hidden />
      )}
      <div className="story-card-body">
        <h3 className="story-card-title">{item.title || '(no title)'}</h3>
        {item.description ? (
          <p className="story-card-snippet">{item.description}</p>
        ) : null}
        <p className="story-card-meta">
          {item.feedTitle} · {formatTime(item.publishedAt)}
        </p>
      </div>
    </article>
  )
}
