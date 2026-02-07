import { useState, useEffect } from 'react'

function App() {
  const [pong, setPong] = useState(null)

  useEffect(() => {
    if (window.electronAPI?.ping) {
      window.electronAPI.ping().then(setPong)
    }
  }, [])

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>RSS Reader</h1>
      <p>Phase 1 shell: Electron + Vite + React.</p>
      {pong && <p data-testid="pong">IPC ping → {pong}</p>}
    </div>
  )
}

export default App
