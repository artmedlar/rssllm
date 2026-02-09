# OhAI!

A local-first, AI-powered news reader that looks like Google News but puts you in control. OhAI! aggregates RSS feeds, clusters related stories, and uses a local LLM to surface what matters most -- all without sending your data anywhere.

Built with Electron, React, SQLite, and [Ollama](https://ollama.com).

![Stack](https://img.shields.io/badge/Electron-React-blue) ![AI](https://img.shields.io/badge/AI-Ollama-orange) ![DB](https://img.shields.io/badge/DB-SQLite-green)

## Features

- **Google News-style UI** -- Top stories hero card, topic sections (News, Business, Sports, Tech, Entertainment, Science), tabbed navigation
- **Background feed processing** -- Continuous fetching with per-host rate limiting; green "refresh" badge when new items arrive
- **Story clustering** -- Groups related articles from different sources using embedding similarity; "N sources" badge opens full coverage view
- **Smart ranking** -- Six-signal scoring: recency, user engagement, source reputation, cluster size, user affinity, and LLM newsworthiness
- **LLM newsworthiness scoring** -- Local LLM (llama3.2) rates each article's importance on a 1-10 scale
- **"For you" feed** -- Personalized ranking based on your reading history and embedding similarity
- **"More like this"** -- Find similar articles using vector similarity
- **Topic classification** -- Automatic keyword-based categorization of articles
- **Thumbnail extraction** -- Pulls images from RSS `media:thumbnail` fields, falls back to `og:image` scraping with per-host throttling
- **Works offline** -- Everything runs locally; Ollama features degrade gracefully when unavailable

## Installation

### Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Node.js 20+** | [nodejs.org](https://nodejs.org) |
| **Ollama** (optional) | [ollama.com](https://ollama.com) -- enables embeddings, clustering, personalization, and LLM scoring |

### Quick start

```bash
git clone https://github.com/artmedlar/rssllm.git
cd rssllm
npm install
npm run icon    # generate app icons (run once)
npm run dev     # start the app in dev mode
```

### Ollama setup (optional but recommended)

Ollama runs AI models locally on your machine. It powers story clustering, personalized ranking, and newsworthiness scoring in OhAI!. The app works without it, but the experience is much better with it.

**Installing Ollama on macOS:**

1. Download from [ollama.com/download](https://ollama.com/download) (or `brew install ollama`)
2. Open the downloaded app -- it installs the `ollama` command-line tool and runs in the menu bar
3. That's it. OhAI! will detect Ollama automatically and pull the models it needs.

For other platforms, see the [Ollama installation guide](https://github.com/ollama/ollama#install).

**What happens automatically:** When OhAI! starts, it will:
1. Start Ollama if it's not already running
2. Pull the required models: `nomic-embed-text` (~274MB) for embeddings and `llama3.2` (~2GB) for scoring

**Manual setup** (if you prefer):

```bash
ollama serve                    # start the server
ollama pull nomic-embed-text    # embedding model (~274MB)
ollama pull llama3.2            # chat model for scoring (~2GB)
```

**Without Ollama:** The app still works -- you get topic tabs, feed aggregation, thumbnails, and recency/engagement-based ranking. You just won't get story clustering, the "For you" personalized feed, user affinity scoring, or LLM newsworthiness ratings.

### Building for distribution

```bash
npm run build
```

This creates a distributable in the `release/` directory via electron-builder.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Electron with Vite dev server (hot reload) |
| `npm run build` | Build renderer and create distributable (electron-builder) |
| `npm run preview` | Vite preview (renderer only, no Electron) |
| `npm run icon` | Generate `build/icon.icns` and `build/icon.png` from the iconset zip |

## Architecture

### Project structure

```
src/
├── main/               # Electron main process (Node.js)
│   ├── index.js        # Window creation, IPC handlers
│   ├── db.js           # SQLite database (sql.js), all queries
│   ├── feed.js         # RSS fetching and parsing (rss-parser)
│   ├── backgroundLoop.js  # Continuous fetch → embed → cluster → score pipeline
│   ├── classifier.js   # Keyword-based topic classification
│   ├── cluster.js      # Story clustering via embedding cosine similarity
│   ├── rank.js         # Multi-signal ranking engine
│   ├── scorer.js       # LLM newsworthiness scoring (llama3.2)
│   ├── ollama.js       # Ollama API client (embeddings + generation)
│   └── ogImage.js      # og:image thumbnail fallback extraction
├── preload/            # contextBridge for secure IPC
│   └── index.js
├── renderer/           # React frontend
│   └── src/
│       ├── App.jsx     # Top bar, topic tabs, refresh state
│       ├── api.js      # Frontend API (IPC wrappers)
│       └── components/
│           ├── FeedView.jsx         # Home sections + topic feeds
│           ├── StoryCard.jsx        # Article cards (standard + hero)
│           ├── ClusterModal.jsx     # "Full coverage" overlay
│           ├── ArticleModal.jsx     # Article detail view
│           └── SubscriptionsView.jsx # Feed management
└── shared/             # Shared constants
```

### Background pipeline

The background loop runs continuously after app startup:

```
Fetch feeds (6 parallel, per-host rate limited)
    ↓
Compute embeddings (nomic-embed-text, batches of 10)
    ↓
Cluster stories (cosine similarity > 0.82 threshold)
    ↓
LLM newsworthiness scoring (llama3.2, 5 items/cycle)
    ↓
Sleep 2 minutes → repeat
```

### Ranking signals

| Signal | Weight | Description |
|--------|--------|-------------|
| Recency | 1.0 | Inverse decay by hours old |
| Engagement | 0.6 | Log of your interaction count |
| Source reputation | 0.5 | How often you engage with this feed |
| Cluster size | 0.7 | Stories covered by multiple sources |
| User affinity | 1.0 | Cosine similarity to your interest profile |
| LLM newsworthiness | 0.8 | llama3.2 importance rating (1-10 scale) |

### Database

SQLite via sql.js (in-process, WAL mode). Tables: `feeds`, `items`, `read_state`, `engagement_events`, `item_embeddings`, `story_clusters`, `cluster_members`, `newsworthiness_scores`.

## Repo

- **GitHub:** [github.com/artmedlar/rssllm](https://github.com/artmedlar/rssllm)

## Future ideas

- **Full-text search** over read articles for re-finding past stories
- **OPML import/export** for feed portability
- **Feed discovery** -- suggest feeds based on reading interests
- **Custom ranking weights** -- let users tune the signal weights
- **Multi-device sync** via a shared SQLite file or CRDTs
