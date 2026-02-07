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

## Connect to GitHub

1. **Create a new repo on GitHub**
   - Go to [github.com/new](https://github.com/new).
   - Repository name: `rss` (or `rss-reader`).
   - Leave it empty (no README, .gitignore, or license).
   - Create repository.

2. **Add the remote and push**
   ```bash
   cd ~/local/rss
   git remote add origin https://github.com/YOUR_USERNAME/rss.git
   git add .
   git commit -m "Phase 1: Electron + Vite + React shell with IPC ping"
   git branch -M main
   git push -u origin main
   ```
   Replace `YOUR_USERNAME` with your GitHub username. Use the repo URL GitHub shows (HTTPS or SSH).

3. **If you use SSH**
   ```bash
   git remote add origin git@github.com:YOUR_USERNAME/rss.git
   ```
