# Backend handoff: API for phone, PC, and TV clients

The backend is deployed API-only. No web UI is served in production; the old
web UI source remains in the repo for reference only.

## Backend status

- Production API: `https://hanabi-anilab.onrender.com`
- API docs: `https://hanabi-anilab.onrender.com/docs`
- Health: `https://hanabi-anilab.onrender.com/api/health`
- 18 backend tests pass: `python -m pytest tests -q`.
- Docker image builds and runs on Render; the image contains only the API
  (`server.py`, `requirements.txt`, `skip_times.json`), not the frontend.
- Backend files are mirrored into the OneDrive copy.
- Repo: `https://github.com/srivastavt37-sys/hanabi-anilab`
- Supabase Auth Site URL is set to the Render URL; localhost origins are kept
  for development.
- Render free plan may cold-start after inactivity.

## Base URL

- Production: `https://hanabi-anilab.onrender.com`
- Local gateway: `http://127.0.0.1:3000`
- Tunnel: `https://national-ampland-income-companion.trycloudflare.com`
- CORS is open; `X-Image-Source` is exposed.
- `/` returns 404 by design. Clients must call `/api/*`.

## Client integration

Phone, PC, and TV clients should call the API directly. The production image
does not serve `dist/` or any SPA assets.

For local web development, the gateway can still serve a Vite build from
`dist/` if one exists. The old web UI is not part of the production deployment;
when Sol finishes it, it can be hosted separately.

## 1. Per-episode thumbnails

```http
GET /api/episode-image?anilistId=<id>&episode=<n>&width=<160-960>
```

- `anilistId`: AniList media id, not an AniLab id.
- `episode`: 1-based episode number.
- `width`: optional, default 480. It controls the generated fallback; real
  stills are served at source resolution.
- Returns `image/jpeg`, `image/png`, or `image/svg+xml`.
- Resolution order: AniList `streamingEpisodes`, Kitsu thumbnails, ani.zip
  episode stills and Kitsu mappings, then a generated SVG card.
- Real stills are cached for 24 hours; generated cards expire after 60 seconds.
- `X-Image-Source` is `anilist`, `kitsu`, `anizip`, or `generated`.
- Prefer `episodes[].thumbnail` when present. If it fails, use this endpoint.
- Add `v=2` to image URLs to bypass previously cached placeholders.

### React wiring

```tsx
const apiBase = import.meta.env.DEV ? 'http://127.0.0.1:3000' : '';

const episodeImageUrl = (anilistId: number, episode: number, width = 320) =>
  `${apiBase}/api/episode-image?anilistId=${anilistId}&episode=${episode}&width=${width}&v=2`;
```

Use it on the episode card:

```tsx
<img
  src={episodeImageUrl(anime.id, e.number)}
  alt=""
  loading="lazy"
/>
```

Keep the existing overlay, duotone filter, number, and hover behavior if
desired. The generated image already includes its own episode number, so the UI
may want to drop the extra numeral for `generated` images; that is a design
choice.

### Verify

Open these directly:

- `http://127.0.0.1:3000/api/episode-image?anilistId=185874&episode=1&width=480`
- `http://127.0.0.1:3000/api/episode-image?anilistId=185874&episode=2&width=480`
- `http://127.0.0.1:3000/api/episode-image?anilistId=16498&episode=1&width=480`
- `http://127.0.0.1:3000/api/episode-image?anilistId=195539&episode=1&width=480`

`185874` is Bleach TYBW, `16498` is Attack on Titan, and `195539` is Cyberpunk:
Edgerunners 2. Cyberpunk's ten episodes have distinct ani.zip/TVDB scene stills,
including episode 2, even while the AniList API is unavailable.

## 2. Episode titles

```http
GET /api/episode-titles?anilistId=<id>
```

- Returns `titles` keyed by episode number and a `sources` array.
- AniList `streamingEpisodes` titles are preferred when they contain a real
  title; Kitsu episode titles fill missing entries.
- Placeholder titles such as `Episode 1` are omitted, so clients should keep a
  numbered fallback.
- Cached for 6 hours.

Example:

```json
{
  "anilistId": 195539,
  "titles": {
    "1": "Last Chance for a Slow Dance",
    "2": "Give Me Another Day"
  },
  "sources": ["kitsu"]
}
```

## 3. Skip intro/outro

```http
GET /api/skip-times?anilistId=<id>&episode=<n>&duration=<seconds>
```

- `duration` is optional but recommended. Pass the player's duration in seconds
  so AniSkip can pick the right submission and the gateway can score it.
- Valid ids always return HTTP 200. When no timestamps exist, the body has
  `available: false` and a `reason`; do not block playback.
- `sources` can contain `aniskip` and `local`.

Example:

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

### React wiring

```tsx
type SkipSegment = { start: number; end: number };

type SkipTimes = {
  available: boolean;
  intro: SkipSegment | null;
  outro: SkipSegment | null;
};
```

Fetch when the anime, episode, or known duration changes:

```tsx
const query = new URLSearchParams({
  anilistId: String(animeId),
  episode: String(episodeNumber),
});
if (duration > 0) query.set('duration', String(Math.round(duration)));

const response = await fetch(`${apiBase}/api/skip-times?${query}`);
const data: SkipTimes = await response.json();
```

Show the action only while playback is inside the interval:

```tsx
const inside = (segment: SkipSegment | null) =>
  Boolean(segment && currentTime >= segment.start && currentTime < segment.end);

const activeSegment = inside(data.intro)
  ? data.intro
  : inside(data.outro)
    ? data.outro
    : null;

const label = inside(data.intro) ? 'Skip Intro' : 'Skip Outro';

const skip = () => {
  if (activeSegment) seek(activeSegment.end);
};
```

Do not show a disabled button when `available` is false. Hide it entirely.

## 4. Anime detail fallback

```http
GET /api/anime-detail?anilistId=<id>
```

Use this only when the primary AniList GraphQL request fails. It allows the UI
to keep rendering a detail page while the public AniList API is disabled.

- Maps the AniList id via `https://api.ani.zip/mappings?anilist_id=`.
- Fills metadata from Kitsu (`anime/{id}?include=categories,productions`).
- Returns `anime`, `episodes`, `externalLinks`, `related`, `trailerUrl`, and
  `sources` (`anizip`, `kitsu`).
- Invalid ids return 400; a failed upstream returns 503.
- Cached for 6 hours.

Example:

```json
{
  "anime": {
    "id": "anilist-195539",
    "title": "Cyberpunk: Edgerunners 2",
    "status": "finished",
    "format": "ONA",
    "year": 2026,
    "episodeCount": 10,
    "genres": ["action", "crime", "drama", "sci-fi"],
    "sources": ["anizip", "kitsu"]
  },
  "episodes": [
    { "number": 1, "title": "Last Chance for a Slow Dance" }
  ],
  "externalLinks": [],
  "related": [],
  "trailerUrl": "https://www.youtube.com/watch?v=..."
}
```

### React wiring

```tsx
try {
  return await fetchAniListGraphQL(...);
} catch {
  const response = await fetch(`${apiBase}/api/anime-detail?anilistId=${id}`);
  if (!response.ok) throw new Error('metadata fallback failed');
  return response.json();
}
```

## Local overrides

`skip_times.json` is hot-reloaded. Keys are AniList ids or `mal:<id>`; arrays are
`[start, end]` seconds. It is copied into the Docker image.

```json
{
  "185874": {
    "1": {
      "intro": [12.0, 102.0],
      "outro": [1390.0, 1425.0]
    }
  }
}
```

Set `HANABI_SKIP_TIMES_FILE` to relocate the file. Local segments override
AniSkip and only need the missing side.

## Notes

- The backend was verified with AoT `16498`, Cyberpunk `195539`, and Bleach
  `185874`.
- Invalid episode numbers return 400. Unknown AniList ids fall back to a
  generated card rather than failing the image request.
- The image endpoint is cached; do not add a cache-busting query unless the
  cover changes.
