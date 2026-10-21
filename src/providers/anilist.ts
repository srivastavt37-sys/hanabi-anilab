import type { Anime, AnimeFormat, AnimeStatus, Episode, SeasonName } from '../types';
import { fetchWithTimeout } from './types';

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const CACHE_PREFIX = 'anistream:anilist:v2:';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry<T> {
  at: number;
  data: T;
}

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - entry.at > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function cacheSet<T>(key: string, data: T): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data } satisfies CacheEntry<T>));
  } catch {
    // storage full/unavailable — cache is best-effort
  }
}

interface AniListMedia {
  id: number;
  idMal: number | null;
  title: { romaji: string; english: string | null; native: string | null };
  synonyms: (string | null)[] | null;
  description: string | null;
  status: string;
  format: string | null;
  season: string | null;
  seasonYear: number | null;
  averageScore: number | null;
  popularity: number | null;
  episodes: number | null;
  duration: number | null;
  genres: string[] | null;
  studios: { nodes: { name: string }[] } | null;
  coverImage: { extraLarge: string; large: string; color: string | null };
  bannerImage: string | null;
  externalLinks: { site: string; url: string }[] | null;
  relations?: { edges: { relationType: string; node: { id: number; type: string; coverImage: { large: string }; title: { romaji: string; english: string | null }; format: string | null } }[] } | null;
}

const MEDIA_FIELDS = `
  id idMal
  title { romaji english native }
  synonyms
  description(asHtml: false)
  status format season seasonYear
  averageScore popularity episodes duration
  genres
  studios(isMain: true) { nodes { name } }
  coverImage { extraLarge large color }
  bannerImage
  externalLinks { site url }
`;

async function anilistQuery<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetchWithTimeout(
    ANILIST_ENDPOINT,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    },
    15000,
  );
  if (!res.ok) throw new Error(`AniList request failed (${res.status})`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  if (!json.data) throw new Error('AniList returned an empty response');
  return json.data;
}

function mapStatus(status: string): AnimeStatus {
  if (status === 'RELEASING') return 'airing';
  if (status === 'NOT_YET_RELEASED') return 'upcoming';
  return 'finished';
}

function mapFormat(format: string | null): AnimeFormat {
  const map: Record<string, AnimeFormat> = {
    TV: 'TV', TV_SHORT: 'TV', MOVIE: 'Movie', SPECIAL: 'Special',
    OVA: 'OVA', ONA: 'ONA', MUSIC: 'Special',
  };
  return (format && map[format]) || 'TV';
}

function mapSeason(season: string | null): SeasonName {
  const valid: SeasonName[] = ['Winter', 'Spring', 'Summer', 'Fall'];
  return valid.includes(season as SeasonName) ? (season as SeasonName) : 'Winter';
}

function cleanDescription(html: string | null): string {
  if (!html) return 'No synopsis available for this title yet.';
  return html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').trim();
}

export function mapMedia(m: AniListMedia): Anime {
  return {
    id: `anilist-${m.id}`,
    slug: `${m.id}-${(m.title.romaji || m.title.english || 'anime').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`,
    title: m.title.english || m.title.romaji,
    nativeTitle: m.title.native ?? m.title.romaji,
    synonyms: (m.synonyms ?? []).filter((s): s is string => Boolean(s?.trim())),
    synopsis: cleanDescription(m.description),
    status: mapStatus(m.status),
    format: mapFormat(m.format),
    year: m.seasonYear ?? 0,
    season: mapSeason(m.season),
    rating: m.averageScore ? m.averageScore / 10 : 0,
    popularity: m.popularity ?? 0,
    episodeCount: m.episodes ?? 0,
    poster: m.coverImage.extraLarge || m.coverImage.large,
    cover: m.bannerImage ?? undefined,
    genres: (m.genres ?? []).map((g) => g.toLowerCase().replace(/ /g, '-')),
    studio: m.studios?.nodes[0]?.name ?? 'Unknown studio',
    trending: false,
    featured: false,
    upcoming: m.status === 'NOT_YET_RELEASED',
  };
}

const TRENDING_QUERY = `query ($page: Int) { Page(page: $page, perPage: 24) { pageInfo { hasNextPage currentPage } media(sort: TRENDING_DESC, type: ANIME, isAdult: false) { ${MEDIA_FIELDS} } } }`;
const POPULAR_QUERY = `query ($page: Int) { Page(page: $page, perPage: 24) { pageInfo { hasNextPage currentPage } media(sort: POPULARITY_DESC, type: ANIME, isAdult: false) { ${MEDIA_FIELDS} } } }`;
const SEARCH_QUERY = `query ($search: String, $page: Int, $genre: String, $year: Int, $season: MediaSeason, $format: MediaFormat, $sort: [MediaSort]) { Page(page: $page, perPage: 24) { pageInfo { hasNextPage currentPage } media(search: $search, genre: $genre, seasonYear: $year, season: $season, format: $format, sort: $sort, type: ANIME, isAdult: false) { ${MEDIA_FIELDS} } } }`;
const DETAIL_QUERY = `query ($id: Int) { Media(id: $id, type: ANIME) { ${MEDIA_FIELDS} relations { edges { relationType node { id type coverImage { large } title { romaji english } format } } } } }`;

export interface PagedResult {
  anime: Anime[];
  hasNextPage: boolean;
  page: number;
}

function mapPage(result: { Page: { pageInfo: { hasNextPage: boolean; currentPage: number }; media: AniListMedia[] } }): PagedResult {
  return {
    anime: result.Page.media.map(mapMedia),
    hasNextPage: result.Page.pageInfo.hasNextPage,
    page: result.Page.pageInfo.currentPage,
  };
}

export async function fetchTrending(page = 1): Promise<PagedResult> {
  const key = `trending-${page}`;
  const cached = cacheGet<PagedResult>(key);
  if (cached) return cached;
  const data = await anilistQuery<{ Page: { pageInfo: { hasNextPage: boolean; currentPage: number }; media: AniListMedia[] } }>(TRENDING_QUERY, { page });
  const result = mapPage(data);
  cacheSet(key, result);
  return result;
}

export async function fetchPopular(page = 1): Promise<PagedResult> {
  const key = `popular-${page}`;
  const cached = cacheGet<PagedResult>(key);
  if (cached) return cached;
  const data = await anilistQuery<{ Page: { pageInfo: { hasNextPage: boolean; currentPage: number }; media: AniListMedia[] } }>(POPULAR_QUERY, { page });
  const result = mapPage(data);
  cacheSet(key, result);
  return result;
}

export interface ExploreFilters {
  search?: string;
  genre?: string;
  year?: number;
  season?: SeasonName;
  format?: AnimeFormat;
  sort?: 'POPULARITY_DESC' | 'SCORE_DESC' | 'START_DATE_DESC' | 'SEARCH_MATCH';
  page?: number;
}

export async function fetchExplore(filters: ExploreFilters): Promise<PagedResult> {
  const key = `explore-${JSON.stringify(filters)}`;
  const cached = cacheGet<PagedResult>(key);
  if (cached) return cached;

  const variables: Record<string, unknown> = { page: filters.page ?? 1 };
  if (filters.search) variables.search = filters.search;
  if (filters.genre) {
    const genreLabel = filters.genre.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    variables.genre = genreLabel;
  }
  if (filters.year) variables.year = filters.year;
  if (filters.season) variables.season = filters.season.toUpperCase();
  if (filters.format) {
    const fmtMap: Record<string, string> = { TV: 'TV', Movie: 'MOVIE', OVA: 'OVA', ONA: 'ONA', Special: 'SPECIAL' };
    variables.format = fmtMap[filters.format];
  }
  // Relevance first: AniList only ranks by search match when it is asked to.
  // Forcing popularity/score order buries exact title matches (searching
  // "a will eternal" returned "Free! Eternal Summer" and never the real show).
  // SEARCH_MATCH is only a valid sort when a search term is supplied.
  const relevance = Boolean(filters.search) && (!filters.sort || filters.sort === 'SEARCH_MATCH');
  variables.sort = [relevance ? 'SEARCH_MATCH' : filters.sort && filters.sort !== 'SEARCH_MATCH' ? filters.sort : 'POPULARITY_DESC'];

  const data = await anilistQuery<{ Page: { pageInfo: { hasNextPage: boolean; currentPage: number }; media: AniListMedia[] } }>(SEARCH_QUERY, variables);
  const result = mapPage(data);
  cacheSet(key, result);
  return result;
}

interface DetailResult {
  Media: AniListMedia & {
    relations: { edges: { relationType: string; node: { id: number; type: string; coverImage: { large: string }; title: { romaji: string; english: string | null }; format: string | null } }[] } | null;
  };
}

const STREAMING_SITES = new Set(['Crunchyroll', 'Funimation', 'HIDIVE', 'Netflix', 'Hulu', 'Amazon Prime Video', 'Disney Plus', 'Bilibili TV', 'Muse Asia', 'Ani-One Asia', 'iQ.com', 'Netflix Anime', 'Viu.com']);

export async function fetchAnimeDetail(anilistId: string): Promise<{
  anime: Anime;
  episodes: Episode[];
  externalLinks: { label: string; url: string; site: string }[];
  related: Anime[];
}> {
  const numericId = anilistId.replace('anilist-', '');
  const key = `detail-${numericId}`;
  const cached = cacheGet<{ anime: Anime; episodes: Episode[]; externalLinks: { label: string; url: string; site: string }[]; related: Anime[] }>(key);
  if (cached) return cached;

  const data = await anilistQuery<DetailResult>(DETAIL_QUERY, { id: Number(numericId) });
  const m = data.Media;
  const anime = mapMedia(m);

  // AniList provides episode counts but not per-episode synopses; synthesize
  // numbered episode entries from the reported count (or a minimum of 1).
  const count = anime.episodeCount > 0 ? anime.episodeCount : 1;
  const episodes: Episode[] = Array.from({ length: Math.min(count, 200) }, (_, i) => ({
    id: `${anime.id}-s1-e${i + 1}`,
    seasonId: `${anime.id}-season-1`,
    animeId: anime.id,
    number: i + 1,
    title: `Episode ${i + 1}`,
    synopsis: `Episode ${i + 1} of ${anime.title}.`,
    durationMinutes: 0,
  }));

  const externalLinks = (m.externalLinks ?? [])
    .filter((l) => STREAMING_SITES.has(l.site))
    .map((l) => ({ label: l.site, url: l.url, site: l.site }));

  const related = (m.relations?.edges ?? [])
    .filter((e) => e.node.type === 'ANIME' && ['PREQUEL', 'SEQUEL', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE', 'PARENT'].includes(e.relationType))
    .map((e) => mapMedia(e.node as unknown as AniListMedia));

  const result = { anime, episodes, externalLinks, related };
  cacheSet(key, result);
  return result;
}
