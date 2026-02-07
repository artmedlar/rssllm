import { useState } from 'react'
import FeedView from './components/FeedView'
import SubscriptionsView from './components/SubscriptionsView'

const TABS = [
  { id: 'feed', label: 'Feed' },
  { id: 'subscriptions', label: 'Subscriptions' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('feed')

  return (
    <div className="app-layout">
      <nav className="tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main className="tab-panel" role="tabpanel">
        {activeTab === 'feed' ? <FeedView /> : <SubscriptionsView />}
      </main>
    </div>
  )
}
