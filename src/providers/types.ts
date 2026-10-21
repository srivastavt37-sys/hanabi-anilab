import type { Anime, Episode } from '../types';

export interface ExternalStreamLink {
  label: string;
  url: string;
  site?: string;
}

export interface AnimeDetail {
  anime: Anime;
  episodes: Episode[];
  externalLinks: ExternalStreamLink[];
}

export type PlaybackSourceKind = 'hls' | 'mp4' | 'embed';

export interface PlaybackSource {
  kind: PlaybackSourceKind;
  url: string;
  label: string;
  quality?: string;
  /** True when the source is a stand-in (demo clip / trailer), not a real episode stream. */
  surrogate?: boolean;
  subtitleTracks?: { lang: string; label: string; url: string }[];
}

export interface PlaybackResolution {
  status: 'ok' | 'unavailable';
  /** Ranked list of playable sources. The player tries them in order and can switch. */
  sources: PlaybackSource[];
  /** Honest explanation when no source is playable. */
  error?: string;
  /** Optional legitimate external alternatives, offered — never auto-opened. */
  external?: ExternalStreamLink[];
}

export interface ProviderConfig {
  /** Disabled providers are skipped entirely without breaking the registry. */
  enabled: boolean;
  /** Lower numbers are tried first. */
  priority: number;
  /** Max time for a provider's resolve() before it counts as a timeout failure. */
  resolveTimeoutMs: number;
  /** Max time for a per-source reachability probe. */
  probeTimeoutMs: number;
  /** Consecutive resolve failures before the provider enters cooldown. */
  maxFailuresBeforeCooldown: number;
  /** How long a cooled-down provider is skipped. */
  cooldownMs: number;
}

export interface ProviderHealth {
  status: 'idle' | 'healthy' | 'degraded' | 'down' | 'cooldown';
  failureCount: number;
  lastError?: string;
  lastSuccessAt?: number;
  cooldownUntil?: number;
}

/**
 * Cheap reachability/compatibility check for one source. Must not download
 * the video — a partial request that fails or returns a wrong content type
 * is enough to demote a source. Returning true does NOT guarantee playback;
 * the player's own events remain the source of truth.
 */
export type SourceProbe = (source: PlaybackSource, timeoutMs: number) => Promise<boolean>;

export interface ProviderEpisode {
  /** 1-based position in the provider's own ordering — what the UI lists. */
  number: number;
  title?: string;
  /** The provider's own episode number when it differs (global series numbering). */
  sourceNumber?: number;
}

export interface PlaybackProvider {
  id: string;
  label: string;
  /** Whether this provider can attempt playback for the given anime/episode. */
  canHandle(anime: Anime, episode: Episode): boolean;
  resolve(
    anime: Anime,
    episode: Episode,
    externalLinks: ExternalStreamLink[],
  ): Promise<PlaybackResolution>;
  /** Optional reachability check; falls back to the default probe when absent. */
  probe?: SourceProbe;
  /**
   * Optional: the episodes this provider can actually stream for a title.
   * Catalogues (AniList) split seasons into separate entries and their counts
   * often disagree with the streaming source, so the guide mirrors this list
   * when a provider can answer.
   */
  listEpisodes?(anime: Anime): Promise<ProviderEpisode[]>;
}

export function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => window.clearTimeout(timer));
}

/** Default probe: 2-byte ranged fetch, content-type sanity check. Never a full download. */
export async function probeSourceReachable(source: PlaybackSource, timeoutMs: number): Promise<boolean> {
  if (source.kind === 'embed') return true;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(source.url, {
      headers: { Range: 'bytes=0-1' },
      signal: controller.signal,
    });
    if (!res.ok && res.status !== 206) return false;
    const ct = (res.headers.get('content-type') ?? '').toLowerCase();
    if (!ct) return true;
    if (source.kind === 'hls' && !/mpegurl/.test(ct)) return false;
    if (source.kind === 'mp4' && !/video|mp4|octet-stream|matroska/.test(ct)) return false;
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}
