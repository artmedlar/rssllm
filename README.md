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

## Project structure

- `src/main/` – Electron main process (window, IPC). No React.
- `src/preload/` – Preload script; exposes `window.electronAPI` via contextBridge.
- `src/renderer/` – React app (entry: `src/renderer/src/main.jsx`).
- `src/shared/` – Shared types and constants (framework-agnostic).
- `index.html` – Renderer entry (Vite).

## Repo

- **GitHub:** [github.com/artmedlar/rssllm](https://github.com/artmedlar/rssllm)
- Remote: `origin` → `https://github.com/artmedlar/rssllm.git`
