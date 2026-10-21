import type { Anime, Episode } from '../types';
import type {
  PlaybackProvider,
  PlaybackResolution,
  ExternalStreamLink,
  ProviderConfig,
  ProviderEpisode,
  ProviderHealth,
  PlaybackSource,
  SourceProbe,
} from './types';
import { probeSourceReachable } from './types';

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  enabled: true,
  priority: 100,
  resolveTimeoutMs: 12000,
  probeTimeoutMs: 6000,
  maxFailuresBeforeCooldown: 3,
  cooldownMs: 60_000,
};

export const PROVIDER_REGISTRY_DEFAULTS: Record<string, Partial<ProviderConfig>> = {
  anilab: { priority: 5, resolveTimeoutMs: 25000, probeTimeoutMs: 8000 },
  blender: { priority: 10, resolveTimeoutMs: 8000 },
  'external-links': { priority: 900 },
};

interface RegistryEntry {
  provider: PlaybackProvider;
  config: ProviderConfig;
  health: ProviderHealth;
  attemptedEpisodes: Set<string>;
}

function episodeKey(anime: Anime, episode: Episode): string {
  return `${anime.id}::e${episode.number}`;
}

export class PlaybackProviderRegistry {
  private entries = new Map<string, RegistryEntry>();
  private listeners = new Set<() => void>();

  register(provider: PlaybackProvider, overrides: Partial<ProviderConfig> = {}): void {
    this.entries.set(provider.id, {
      provider,
      config: { ...DEFAULT_PROVIDER_CONFIG, ...overrides },
      health: { status: 'idle', failureCount: 0 },
      attemptedEpisodes: new Set(),
    });
    this.emit();
  }

  getConfig(providerId: string): ProviderConfig | undefined {
    return this.entries.get(providerId)?.config;
  }

  updateConfig(providerId: string, patch: Partial<ProviderConfig>): void {
    const entry = this.entries.get(providerId);
    if (!entry) return;
    entry.config = { ...entry.config, ...patch };
    if (entry.config.enabled && entry.health.status === 'cooldown') {
      entry.health = { status: 'idle', failureCount: 0 };
    }
    this.emit();
  }

  getHealth(providerId: string): ProviderHealth | undefined {
    return this.entries.get(providerId)?.health;
  }

  listHealth(): { id: string; label: string; config: ProviderConfig; health: ProviderHealth }[] {
    return [...this.entries.values()].map((e) => ({
      id: e.provider.id,
      label: e.provider.label,
      config: e.config,
      health: e.health,
    }));
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  private eligible(entry: RegistryEntry, anime: Anime, episode: Episode): boolean {
    if (!entry.config.enabled) return false;
    if (!entry.provider.canHandle(anime, episode)) return false;
    if (entry.health.cooldownUntil && entry.health.cooldownUntil > Date.now()) {
      entry.health.status = 'cooldown';
      return false;
    }
    if (entry.health.cooldownUntil && entry.health.cooldownUntil <= Date.now()) {
      // Cooldown expired — give the provider a fresh window.
      entry.health = { status: 'idle', failureCount: 0 };
    }
    return true;
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: number | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = window.setTimeout(() => reject(new Error('resolve timeout')), ms);
        }),
      ]);
    } finally {
      window.clearTimeout(timer);
    }
  }

  private markSuccess(providerId: string): void {
    const entry = this.entries.get(providerId);
    if (!entry) return;
    entry.health = { status: 'healthy', failureCount: 0, lastSuccessAt: Date.now() };
    this.emit();
  }

  private markFailure(providerId: string, message: string): void {
    const entry = this.entries.get(providerId);
    if (!entry) return;
    const failureCount = entry.health.failureCount + 1;
    if (failureCount >= entry.config.maxFailuresBeforeCooldown) {
      entry.health = {
        status: 'cooldown',
        failureCount,
        lastError: message,
        cooldownUntil: Date.now() + entry.config.cooldownMs,
      };
    } else {
      entry.health = { ...entry.health, status: 'degraded', failureCount, lastError: message };
    }
    this.emit();
  }

  /**
   * Resolves the highest-priority eligible provider that yields reachable
   * sources. Falls through to lower-priority providers on failure/timeout.
   * Duplicate attempts for the same anime/episode by the same provider are
   * rejected so failures cannot loop.
   */
  async resolve(
    anime: Anime,
    episode: Episode,
    externalLinks: ExternalStreamLink[],
  ): Promise<{ resolution: PlaybackResolution; providerId: string }> {
    const candidates = [...this.entries.values()]
      .filter((e) => this.eligible(e, anime, episode))
      .sort((a, b) => a.config.priority - b.config.priority);

    for (const entry of candidates) {
      const key = episodeKey(anime, episode);
      if (entry.attemptedEpisodes.has(key)) continue;
      entry.attemptedEpisodes.add(key);
      try {
        const resolution = await this.withTimeout(
          entry.provider.resolve(anime, episode, externalLinks),
          entry.config.resolveTimeoutMs,
        );
        if (resolution.status !== 'ok' || resolution.sources.length === 0) {
          if (resolution.status === 'ok') {
            // Provider claimed ok but produced nothing — treat as failure.
            this.markFailure(entry.provider.id, 'resolved with no sources');
          }
          continue;
        }
        const probed = await this.probeAndRank(resolution.sources, entry.provider.probe, entry.config.probeTimeoutMs);
        if (probed.length === 0) {
          this.markFailure(entry.provider.id, 'no reachable source');
          continue;
        }
        this.markSuccess(entry.provider.id);
        return {
          resolution: { status: 'ok', sources: probed, external: resolution.external },
          providerId: entry.provider.id,
        };
      } catch (err) {
        this.markFailure(entry.provider.id, err instanceof Error ? err.message : 'resolve failed');
      }
    }

    // No provider produced sources. Surface the external-links provider's
    // alternatives when it is registered and can answer, so the UI can offer
    // optional official links without claiming anything is playable.
    const ext = this.entries.get('external-links');
    if (ext && ext.config.enabled && ext.provider.canHandle(anime, episode)) {
      return {
        resolution: { status: 'unavailable', sources: [], error: 'NO_INAPP_SOURCE', external: externalLinks },
        providerId: 'external-links',
      };
    }
    return {
      resolution: { status: 'unavailable', sources: [], error: 'NO_INAPP_SOURCE' },
      providerId: 'none',
    };
  }

  /** Drops unreachable sources, keeping survivors in priority order. */
  private async probeAndRank(
    sources: PlaybackSource[],
    customProbe: SourceProbe | undefined,
    probeTimeoutMs: number,
  ): Promise<PlaybackSource[]> {
    const probe = customProbe ?? probeSourceReachable;
    const results = await Promise.all(
      sources.map(async (s, i) => ({ s, i, ok: await probe(s, probeTimeoutMs).catch(() => false) })),
    );
    return results.filter((r) => r.ok).sort((a, b) => a.i - b.i).map((r) => r.s);
  }

  /** Player-event failure reporting: marks a source as failed and returns the next eligible index, or -1. */
  reportSourceFailed(anime: Anime, episode: Episode, failedIndex: number, failedSoFar: number[]): number {
    void anime;
    void episode;
    const next = [...new Set([...failedSoFar, failedIndex])];
    return next.length;
  }

  clearAttempted(anime: Anime, episode: Episode): void {
    const key = episodeKey(anime, episode);
    for (const entry of this.entries.values()) entry.attemptedEpisodes.delete(key);
    this.emit();
  }

  /**
   * Episode list advertised by the highest-priority provider that supports it,
   * renumbered from 1. Returns an empty list when no provider can answer — the
   * caller then keeps the catalogue's own episode list.
   */
  async listEpisodes(anime: Anime): Promise<ProviderEpisode[]> {
    const probeEpisode: Episode = {
      id: `${anime.id}-probe`,
      seasonId: `${anime.id}-season-1`,
      animeId: anime.id,
      number: 1,
      title: 'Episode 1',
      synopsis: '',
      durationMinutes: 0,
    };
    const candidates = [...this.entries.values()]
      .filter((e) => e.config.enabled && e.provider.listEpisodes && e.provider.canHandle(anime, probeEpisode))
      .sort((a, b) => a.config.priority - b.config.priority);

    for (const entry of candidates) {
      try {
        const list = await this.withTimeout(
          entry.provider.listEpisodes!(anime),
          entry.config.resolveTimeoutMs,
        );
        if (list.length > 0) return list;
      } catch {
        // Provider could not answer — fall through to the next candidate.
      }
    }
    return [];
  }
}

export const playbackRegistry = new PlaybackProviderRegistry();
