# Backend handoff: skip intro/outro + per-episode thumbnails

Backend is live. No UI files were changed by the backend agent.

## Backend status

- 10 backend tests pass: `python -m pytest tests -q`.
- Backend files are mirrored into the OneDrive copy.
- Production deploy still needs a GitHub repository and Render; Docker was not
  available locally to pre-build the image.

## Base URL

- Gateway: `http://127.0.0.1:3000`
- Tunnel: `https://national-ampland-income-companion.trycloudflare.com`
- CORS is open; `X-Image-Source` is exposed.

## Why the current page still shows one poster

The page at `http://localhost:3000` is the Downloads build. Its episode cards
still use the anime's single `artwork` image:

- `src/pages/AnimeDetailPage.tsx` around line 370: `src={artwork}`
- `src/pages/WatchPage.tsx` around line 405: `src={artwork}`

The backend cannot change the cards until the UI points each card at the new
endpoint. After editing either file, run:

```powershell
npm run build
```

The gateway serves `dist/` per request, so no gateway restart is needed.

The OneDrive UI at `:5178` is a separate copy. It needs the same change and,
because it has no Vite proxy, should use `http://127.0.0.1:3000` as the API base
in development.

## 1. Per-episode thumbnails

```http
GET /api/episode-image?anilistId=<id>&episode=<n>&width=<160-960>
```

- `anilistId`: AniList media id, not an AniLab id.
- `episode`: 1-based episode number.
- `width`: optional, default 480. It controls the generated fallback; real
  stills are served at source resolution.
- Returns `image/jpeg`, `image/png`, or `image/svg+xml`.
- Resolution order: AniList `streamingEpisodes`, then Kitsu thumbnails, then a
  generated SVG card using the cover with a per-episode crop and number.
- Cached for 24 hours.
- `X-Image-Source` is `anilist`, `kitsu`, or `generated`.

### React wiring

```tsx
const apiBase = import.meta.env.DEV ? 'http://127.0.0.1:3000' : '';

const episodeImageUrl = (anilistId: number, episode: number, width = 320) =>
  `${apiBase}/api/episode-image?anilistId=${anilistId}&episode=${episode}&width=${width}`;
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

`185874` is Bleach TYBW: generated cards. `16498` is Attack on Titan: real
AniList still. `195539` episode 1 is a Kitsu still; episode 2 is generated.

## 2. Skip intro/outro

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
