# Hanabi · AniLab2 streaming

A premium anime catalogue and streaming app. Metadata comes from **AniList**
(GraphQL); playable episode streams are resolved through the **AniLab2** API via
a small FastAPI gateway that also relays HLS so browser CORS/Referer rules never
break playback.

This project is an integration of [GengaToon](https://github.com/solo12345689/GengaToon)
(AniLab2 API + HLS proxy) into the React/TypeScript AniList catalogue app.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, MUI, hls.js |
| Backend | Python 3.12, FastAPI, Uvicorn, requests (+ optional curl-cffi) |
| Catalogue | AniList GraphQL |
| Streams | AniLab2 / AniDB, proxied by the FastAPI gateway |

## How playback works

1. AniList supplies titles, posters and episode counts (`src/providers/anilist.ts`).
2. `src/providers/anilab.ts` matches the title against AniLab2 search results
   (search only returns ids, so candidates are enriched through `/api/post`).
3. The requested episode number is mapped to an AniDB episode, then to a server
   (SUB preferred, then DUB/HD).
4. `server.py` extracts the `.m3u8` master from the embed page and rewrites every
   URI inside the manifest to `/api/anilab/hls_proxy?url=…`, so `hls.js` plays it
   same-origin.
5. If AniLab has no match, the provider chain falls back to the official trailer
   and finally to official external streaming links.

## Local development

### 1. Backend (FastAPI gateway)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python server.py            # http://127.0.0.1:3000
```

### 2. Frontend (Vite)

```powershell
npm install
npm run dev                 # http://localhost:5173, /api is proxied to :3000
```

Useful scripts:

```powershell
npm run build    # type-check + production build into dist/
npm run lint
```

Backend tests:

```powershell
pip install -r requirements-dev.txt
python -m pytest tests -q
```

## API surface

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Liveness probe (used by Render/Docker health check) |
| `GET /api/anilab/search?keyword=` | AniLab2 search |
| `GET /api/anilab/post?id=` | Anime metadata (title, genres, seasons) |
| `GET /api/anilab/episodes?id=` | Episode list for an AniLab id |
| `GET /api/anilab/servers?id=` | Servers (SUB/DUB/HD) for an episode |
| `GET /api/anilab/stream?id=` | Extract the `.m3u8` master for a server |
| `GET /api/anilab/hls_proxy?url=` | HLS manifest/segment relay with URI rewriting |
| `GET /api/anilab/home`, `/categories`, `/category` | Catalogue helpers |
| `GET /api/skip-times?anilistId=&episode=&duration=` | Intro/outro timestamps (AniSkip + local overrides) |
| `GET /api/episode-image?anilistId=&episode=&width=` | Per-episode thumbnail (real still or generated fallback) |
| `GET /api/watch?m3u8=` | Standalone debug player page |

Metadata responses are cached briefly in memory; stream lookups are cached for
5 minutes. The proxy refuses to fetch private/loopback hosts (SSRF guard).

### Skip intro/outro

The gateway maps AniList ids to MyAnimeList ids, then asks AniSkip for community
timestamps. `duration` is optional but recommended: pass the player's duration in
seconds so AniSkip can pick the matching submission and the gateway can clamp and
score the result.

```http
GET /api/skip-times?anilistId=16498&episode=1&duration=1440
```

```json
{
  "available": true,
  "anilistId": 16498,
  "malId": 16498,
  "episode": 1,
  "intro": { "start": 128.406, "end": 218.406 },
  "outro": { "start": 1342.795, "end": 1430.616 },
  "episodeLength": 1441.941,
  "confidence": "high",
  "sources": ["aniskip"]
}
```

The endpoint always returns 200 for valid ids; when no data exists it returns
`available: false` with a `reason` (`not_found`, `no_mal_id`, or
`upstream_unavailable`) so playback is never blocked. `confidence` drops to
`medium`/`low` when the supplied duration differs from the submission length.
Clients should show a Skip Intro/Outro action while playback is inside the
corresponding interval.

New or obscure titles can be curated in `skip_times.json` (hot-reloaded; set
`HANABI_SKIP_TIMES_FILE` to relocate it). Keys are AniList ids or `mal:<id>`;
arrays are `[start, end]` seconds. Local segments override AniSkip and only need
to provide the missing side:

```json
{
  "<anilist-id>": {
    "1": {
      "intro": [8.0, 98.0],
      "outro": [1310.0, 1420.0]
    }
  },
  "mal:<mal-id>": {
    "2": { "intro": { "start": 10.0, "end": 100.0 } }
  }
}
```

### Per-episode thumbnails

`GET /api/episode-image?anilistId=195539&episode=2&width=480`

Returns an episode still from AniList's streaming data first, then Kitsu, and
falls back to a generated SVG card built from the cover art with a per-episode
crop and episode number. Every episode resolves to a different image. Use the
URL directly as the episode card image; point it at the gateway origin when the
UI runs on a separate dev server. `width` (160–960, default 480) controls the
generated fallback; real stills are served at source resolution.
`X-Image-Source` reports `anilist`, `kitsu`, or `generated`. Responses are
cached for 24 hours.

## Deploying to Render

The repo ships a multi-stage `Dockerfile` (build Vite → serve with Uvicorn) and a
`render.yaml` blueprint.

- **Runtime:** Docker
- **Health check path:** `/api/health`
- **Port:** `PORT` env var (defaults to `10000`)

Build and run locally:

```powershell
docker build -t hanabi-anilab .
docker run -p 10000:10000 -e PORT=10000 hanabi-anilab
```

Then open http://localhost:10000 — the SPA and the API are served from the same
origin, so no CORS configuration is required.

## Project layout

```
server.py                     FastAPI gateway: AniLab2 proxy + HLS relay + SPA host
requirements.txt              Python dependencies
Dockerfile / render.yaml      Deployment
src/providers/anilab.ts       AniLab2 playback provider (title match → stream)
src/providers/anilist.ts      AniList catalogue/metadata
src/providers/registry.ts     Provider registry (priority, health, fallbacks)
src/pages/WatchPage.tsx       Player + episode selector
src/components/VideoPlayer.tsx hls.js video player
```
