import type { Anime, Episode } from '../types';
import type {
  PlaybackProvider,
  PlaybackResolution,
  PlaybackSource,
  ProviderEpisode,
} from './types';
import { fetchWithTimeout } from './types';

/**
 * AniLab2 provider.
 *
 * AniList remains the catalogue/metadata source. This provider bridges an
 * AniList title to the matching AniLab2 entry, resolves the requested episode
 * number to an AniDB server, extracts the HLS master playlist, and hands the
 * player a same-origin proxy URL so CORS/Referer restrictions never reach the
 * browser.
 */

const API_BASE = '/api/anilab';
const CACHE_PREFIX = 'hanabi:anilab:';
const SEARCH_TTL_MS = 30 * 60 * 1000;
const LIST_TTL_MS = 60 * 60 * 1000;
const STREAM_TTL_MS = 10 * 60 * 1000;

interface CacheEntry<T> {
  at: number;
  data: T;
}

function cacheGet<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - entry.at > ttlMs) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function cacheSet<T>(key: string, data: T): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data } satisfies CacheEntry<T>));
  } catch {
    // Cache is best-effort; private mode or a full quota must not break playback.
  }
}

function cacheClear(prefix: string): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX + prefix)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore
  }
}

async function apiJson<T>(path: string, timeoutMs = 10000): Promise<T> {
  const res = await fetchWithTimeout(`${API_BASE}${path}`, { headers: { Accept: 'application/json' } }, timeoutMs);
  if (!res.ok) {
    let detail = `AniLab request failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body?.detail) detail = body.detail;
    } catch {
      // non-JSON error body
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Title matching
// ---------------------------------------------------------------------------

const TITLE_NOISE = new Set([
  'the', 'a', 'an', 'and', 'of', 'to', 'in', 'on', 'no', 'wa', 'ga', 'ni',
  'season', 'part', 'cour', 'movie', 'tv', 'ova', 'ona', 'special',
]);

export function normalizeTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // "2nd Season" and "Season 2" must compare equal across catalogues.
    .replace(/\b(\d+)(?:st|nd|rd|th)\b/g, '$1')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titleTokens(value: string): Set<string> {
  return new Set(normalizeTitle(value).split(' ').filter((t) => t && !TITLE_NOISE.has(t)));
}

export function titleScore(candidate: string, target: string): number {
  const a = normalizeTitle(candidate);
  const b = normalizeTitle(target);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  ta.forEach((t) => { if (tb.has(t)) overlap += 1; });
  const jaccard = overlap / (ta.size + tb.size - overlap);
  const coverage = overlap / Math.min(ta.size, tb.size);
  return jaccard * 0.45 + coverage * 0.55;
}

/**
 * Every title we know for a show. AniList often omits an English title (e.g.
 * Chinese donghua), while the streaming catalogue indexes the English synonym —
 * so provider matching must search all of them, not just the display title.
 */
export function titleVariants(anime: Pick<Anime, 'title' | 'nativeTitle' | 'synonyms'>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of [anime.title, anime.nativeTitle, ...(anime.synonyms ?? [])]) {
    if (!value?.trim()) continue;
    const key = normalizeTitle(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Response shapes (defensive: upstream occasionally adds/renames fields)
// ---------------------------------------------------------------------------

interface RawPost {
  id?: string | number;
  title?: string;
  name?: string;
  poster?: string;
}

interface RawEpisode {
  id?: string | number;
  number?: string | number;
  name?: string;
  title?: string;
}

interface RawServer {
  id?: string | number;
  name?: string;
  title?: string;
}

function asArray<T>(payload: unknown, ...keys: string[]): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as T[];
  }
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

function postTitle(post: RawPost): string {
  return post.title ?? post.name ?? '';
}

async function getPost(id: string): Promise<RawPost | null> {
  const key = `post:${id}`;
  const cached = cacheGet<RawPost>(key, LIST_TTL_MS);
  if (cached) return cached;
  try {
    const post = await apiJson<RawPost>(`/post?id=${encodeURIComponent(id)}`);
    cacheSet(key, post);
    return post;
  } catch {
    return null;
  }
}

/**
 * Search results from AniLab2 only carry `{ id, poster, age }`; titles live on
 * the post endpoint. Enrich the first few candidates concurrently so matching
 * stays fast while avoiding a post lookup per result.
 */
async function enrichCandidates(posts: RawPost[], limit = 6): Promise<RawPost[]> {
  const head = posts.slice(0, limit);
  const enriched = await Promise.all(
    head.map(async (post) => {
      if (postTitle(post) || post.id === undefined) return post;
      const detail = await getPost(String(post.id));
      return detail ? { ...post, ...detail } : post;
    }),
  );
  return [...enriched, ...posts.slice(limit)];
}

function episodeNumber(ep: RawEpisode, fallback: number): number {
  const parsed = Number.parseInt(String(ep.number ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function searchAniLab(variants: string[]): Promise<RawPost[]> {
  const queries = [...new Set(variants.filter((q) => Boolean(q?.trim())))].slice(0, 4);
  const seen = new Map<string, RawPost>();
  const bestSoFar = () => {
    let best = 0;
    for (const post of seen.values()) {
      for (const target of queries) best = Math.max(best, titleScore(postTitle(post), target));
    }
    return best;
  };
  for (const query of queries) {
    const key = `search:${normalizeTitle(query)}`;
    const cached = cacheGet<RawPost[]>(key, SEARCH_TTL_MS);
    const posts = cached ?? asArray<RawPost>(
      await apiJson(`/search?keyword=${encodeURIComponent(query)}`),
      'posts', 'list', 'data', 'results',
    );
    if (!cached) cacheSet(key, posts);
    posts.forEach((post) => {
      const id = post.id !== undefined ? String(post.id) : '';
      if (id && !seen.has(id)) seen.set(id, post);
    });
    if (bestSoFar() >= 0.9) break;
  }
  return enrichCandidates([...seen.values()]);
}

function choosePost(posts: RawPost[], targets: string[]): RawPost | null {
  let best: { post: RawPost; score: number } | null = null;
  for (const post of posts) {
    const candidate = postTitle(post);
    const score = Math.max(0, ...targets.map((target) => titleScore(candidate, target)));
    if (!best || score > best.score) best = { post, score };
  }
  return best && best.score >= 0.5 ? best.post : null;
}

async function getEpisodes(anilabId: string): Promise<RawEpisode[]> {
  const key = `episodes:${anilabId}`;
  const cached = cacheGet<RawEpisode[]>(key, LIST_TTL_MS);
  if (cached) return cached;
  const list = asArray<RawEpisode>(
    await apiJson(`/episodes?id=${encodeURIComponent(anilabId)}`),
    'list', 'episodes', 'data',
  );
  cacheSet(key, list);
  return list;
}

async function getServers(episodeId: string): Promise<RawServer[]> {
  const key = `servers:${episodeId}`;
  const cached = cacheGet<RawServer[]>(key, LIST_TTL_MS);
  if (cached) return cached;
  const list = asArray<RawServer>(
    await apiJson(`/servers?id=${encodeURIComponent(episodeId)}`),
    'list', 'servers', 'data',
  );
  cacheSet(key, list);
  return list;
}

function rankServers(servers: RawServer[]): RawServer[] {
  const name = (s: RawServer) => (s.name ?? s.title ?? '').toLowerCase();
  const score = (s: RawServer) => {
    const n = name(s);
    if (/hindi|tamil|telugu/.test(n)) return 0;
    if (/sub/.test(n)) return 5;
    if (/dub/.test(n)) return 4;
    if (/hd/.test(n)) return 3;
    return 2;
  };
  const seen = new Set<string>();
  return servers
    .filter((s) => s.id !== undefined && s.id !== null && String(s.id) !== '')
    .filter((s) => {
      const id = String(s.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => score(b) - score(a));
}

async function resolveStream(server: RawServer): Promise<PlaybackSource | null> {
  const serverId = String(server.id);
  const key = `stream:${serverId}`;
  const cached = cacheGet<{ url: string }>(key, STREAM_TTL_MS);

  let streamUrl = cached?.url;
  if (!streamUrl) {
    const payload = await apiJson<{ url?: string; streamUrl?: string }>(
      `/stream?id=${encodeURIComponent(serverId)}`,
      12000,
    );
    streamUrl = payload.url ?? payload.streamUrl;
    if (!streamUrl) return null;
    cacheSet(key, { url: streamUrl });
  }

  const proxied = `${API_BASE}/hls_proxy?url=${encodeURIComponent(streamUrl)}`;
  const serverName = server.name ?? server.title ?? 'Server';
  return {
    kind: 'hls',
    url: proxied,
    label: `${serverName} · AniLab`,
    quality: /hd/i.test(serverName) ? 'HD' : 'Auto',
    surrogate: false,
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/** Manifest probe without Range: some CDNs truncate ranged playlist requests. */
async function probeAniLabSource(source: PlaybackSource, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(source.url, {
      headers: { Accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, */*' },
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    return !contentType || contentType.includes('mpegurl') || contentType.includes('octet-stream');
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

export const ANILAB_PROVIDER: PlaybackProvider = {
  id: 'anilab',
  label: 'AniLab2 streaming',

  canHandle: (anime) => anime.id.startsWith('anilist-'),
  probe: probeAniLabSource,

  async resolve(anime: Anime, episode: Episode): Promise<PlaybackResolution> {
    try {
      const targets = titleVariants(anime);
      const posts = await searchAniLab(targets);
      const post = choosePost(posts, targets);
      if (!post?.id) {
        return { status: 'unavailable', sources: [], error: 'ANILAB_NO_MATCH' };
      }

      const anilabId = String(post.id);
      const episodes = await getEpisodes(anilabId);
      if (episodes.length === 0) {
        return { status: 'unavailable', sources: [], error: 'ANILAB_NO_EPISODES' };
      }

      const target =
        episodes.find((e) => episodeNumber(e, -1) === episode.number) ??
        episodes[Math.min(Math.max(episode.number - 1, 0), episodes.length - 1)] ??
        episodes[0];
      if (!target?.id) {
        return { status: 'unavailable', sources: [], error: 'ANILAB_NO_EPISODE_MATCH' };
      }

      const episodeId = String(target.id);
      const servers = rankServers(await getServers(episodeId));
      if (servers.length === 0) {
        return { status: 'unavailable', sources: [], error: 'ANILAB_NO_SERVERS' };
      }

      // Resolve the first few servers concurrently; keep the ranked order.
      const attempts = await Promise.allSettled(
        servers.slice(0, 4).map((server) => resolveStream(server)),
      );
      const sources = attempts
        .map((result) => (result.status === 'fulfilled' ? result.value : null))
        .filter((source): source is PlaybackSource => source !== null);

      if (sources.length === 0) {
        return { status: 'unavailable', sources: [], error: 'ANILAB_NO_STREAM' };
      }
      return { status: 'ok', sources };
    } catch (err) {
      return {
        status: 'unavailable',
        sources: [],
        error: err instanceof Error ? err.message : 'ANILAB_ERROR',
      };
    }
  },

  /**
   * The source's own episode list. AniLab numbers a whole season continuously
   * (e.g. "2nd Season" = 53–106), while AniList splits it into 20+16-episode
   * entries — so the guide lists the provider's episodes renumbered from 1.
   */
  async listEpisodes(anime: Anime): Promise<ProviderEpisode[]> {
    try {
      const targets = titleVariants(anime);
      const post = choosePost(await searchAniLab(targets), targets);
      if (!post?.id) return [];
      const episodes = await getEpisodes(String(post.id));
      return episodes.map((entry, i) => ({
        number: i + 1,
        sourceNumber: episodeNumber(entry, i + 1),
      }));
    } catch {
      return [];
    }
  },
};

/** Clears cached AniLab lookups (useful when a title mapping changes upstream). */
export function clearAniLabCache(): void {
  cacheClear('');
}
