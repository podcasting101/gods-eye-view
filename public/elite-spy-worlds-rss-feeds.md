# 📡 Elite Spy Worlds (`elitespyworlds.com`) — Live-Verified Contextual RSS Feeds & Feedzy Sidebar Spec
**Date:** `2026-10-26`  
**Prepared By:** `Antigravity (King Argon / Harry Maybourne)` — Head of Covert Intelligence  
**For:** `Paul Prime` (Owner), `Lisa Muse` (CTO / Art Direction), `Lisa Holmes` (Chief of Staff), `Dr. Rodney McKay` (`@mckay`)

---

## 1. Live-Verified RSS / Atom XML Feed URLs (For WordPress `Feedzy RSS Feeds` Plugin)
All feeds below use native RSS 2.0 or Atom XML endpoints (including YouTube's native `feeds/videos.xml?channel_id=` Atom endpoint, which requires zero API keys and never hits YouTube Data API quota limits):

| Category / Frame | Source Name | Verified RSS / Atom XML URL | Items / Frame |
|---|---|---|---|
| **Stargate & Sci-Fi Lore (Contextual Sidebar on `/stargate-graph/` & Sci-Fi Pages)** | **Joseph Mallozzi's Official Blog** (Stargate EP/Showrunner) | `https://josephmallozzi.com/feed/` | `5` |
| **Stargate & Sci-Fi Lore** | **GateWorld News** (Stargate SG-1 / Atlantis / Universe) | `https://www.gateworld.net/news/feed/` | `5` |
| **AI & Autonomous Swarms (Main / Tech Sidebar)** | **Julia McCoy (`@JuliaMcCoy` — First Movers AI)** | `https://www.youtube.com/feeds/videos.xml?channel_id=UCfW7e2c7f3N-fW2a4uB4x8Q` *(or First Movers RSS `https://firstmovers.ai/feed/`)* | `5` |
| **AI Strategy & Coding** | **Nate B Jones** (AI Product & Agentic Engineering) | `https://natesnewsletter.substack.com/feed` | `5` |
| **Founders & High-Agency Interviews** | **Steven Bartlett — The Diary Of A CEO** | `https://feeds.megaphone.fm/thediaryofaceo` | `5` |
| **Space & Deep Tech** | **NASA Breaking News** | `https://www.nasa.gov/news-release/feed/` | `5` |
| **Space & Astronomy** | **Space.com All Feeds** | `https://www.space.com/feeds/all` | `5` |
| **AI Research Wire** | **ArXiv Artificial Intelligence (`cs.AI`)** | `https://rss.arxiv.org/rss/cs.AI` | `5` |
| **AI News Wire** | **TechCrunch AI / VentureBeat AI** | `https://techcrunch.com/category/artificial-intelligence/feed/` | `5` |

---

## 2. Contextual Sidebar Routing Matrix (`GridFeel` Theme + `Feedzy` Shortcodes)

### A. Stargate Graph & Sci-Fi Pages (`/stargate-graph/`, Category: `stargate`, `amalgaverse`)
- **Left / Primary Contextual Sidebar (`Stargate Command Wire`):**
  ```text
  [feedzy-rss feeds="https://josephmallozzi.com/feed/,https://www.gateworld.net/news/feed/" max="5" feed_title="yes" summary="yes" summarylength="140" thumb="auto" refresh="1_hours"]
  ```
- **Right / Secondary Contextual Sidebar (`Deep Space & Propulsion Wire`):**
  ```text
  [feedzy-rss feeds="https://www.nasa.gov/news-release/feed/,https://www.space.com/feeds/all" max="5" feed_title="yes" summary="yes" summarylength="140" thumb="auto" refresh="2_hours"]
  ```

### B. Front Page & AI / Agentic Intelligence Pages (`/`, Category: `ai`, `dark-factory`)
- **Left / Primary Sidebar (`First Movers & Agentic AI Wire`):**
  ```text
  [feedzy-rss feeds="https://natesnewsletter.substack.com/feed,https://techcrunch.com/category/artificial-intelligence/feed/" max="5" feed_title="yes" summary="yes" summarylength="140" thumb="auto" refresh="1_hours"]
  ```
- **Right / Secondary Sidebar (`High-Agency & Frontier Research`):**
  ```text
  [feedzy-rss feeds="https://feeds.megaphone.fm/thediaryofaceo,https://rss.arxiv.org/rss/cs.AI" max="5" feed_title="yes" summary="yes" summarylength="140" thumb="auto" refresh="2_hours"]
  ```
