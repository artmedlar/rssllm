# RSS Reader

Electron + Vite + React RSS reader with infinite-scroll feed, subscriptions, and LLM-based personalization (Ollama). See the project plan in the repo or in Cursor.

## Prerequisites

- **Node.js** 20+ (you have v22.13.1)
- **Git**
- **Ollama** (optional until Phase 4): [ollama.com](https://ollama.com)

## Getting started

```bash
cd ~/local/rss
npm install
npm run dev
```

## Scripts

- `npm run dev` – Start Electron with Vite dev server (hot reload).
- `npm run build` – Build renderer and create distributable (electron-builder).
- `npm run preview` – Vite preview (renderer only, no Electron).
- `npm run icon` – Unpack `rss_reader_lens_transparent_iconset.zip` into `build/`, create `build/icon.icns` (macOS) and `build/icon.png` (run once after adding the zip, or to refresh icons).

## Project structure

- `src/main/` – Electron main process (window, IPC). No React.
- `src/preload/` – Preload script; exposes `window.electronAPI` via contextBridge.
- `src/renderer/` – React app (entry: `src/renderer/src/main.jsx`).
- `src/shared/` – Shared types and constants (framework-agnostic).
- `index.html` – Renderer entry (Vite).

## Repo

- **GitHub:** [github.com/artmedlar/rssllm](https://github.com/artmedlar/rssllm)
- Remote: `origin` → `https://github.com/artmedlar/rssllm.git`

## Future ideas

- **Text index of read items** – Store searchable text (title + description or full content) for read articles so users can quickly re-find something they’ve seen in the past (e.g. full-text search over “Already read”).
