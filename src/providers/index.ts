import type { Anime, Episode } from '../types';
import type { PlaybackResolution, ExternalStreamLink, ProviderConfig } from './types';
import { PROVIDER_REGISTRY_DEFAULTS } from './registry';
import { playbackRegistry } from './registry';
import { BLENDER_STREAM_PROVIDER, EXTERNAL_LINK_PROVIDER } from './sources';
import { ANILAB_PROVIDER } from './anilab';

/**
 * Adapter module registry: add a provider by importing its adapter and
 * listing it here. Per-provider configuration lives in REGISTRY_CONFIG;
 * anything absent gets registry defaults.
 */
const ADAPTERS = [ANILAB_PROVIDER, BLENDER_STREAM_PROVIDER, EXTERNAL_LINK_PROVIDER];

const REGISTRY_CONFIG: Record<string, Partial<ProviderConfig>> = {
  ...PROVIDER_REGISTRY_DEFAULTS,
};

let initialized = false;

function ensureInitialized(): void {
  if (initialized) return;
  for (const adapter of ADAPTERS) {
    playbackRegistry.register(adapter, REGISTRY_CONFIG[adapter.id]);
  }
  initialized = true;
}

export async function resolvePlayback(
  anime: Anime,
  episode: Episode,
  externalLinks: ExternalStreamLink[],
): Promise<{ resolution: PlaybackResolution; providerId: string }> {
  ensureInitialized();
  return playbackRegistry.resolve(anime, episode, externalLinks);
}

/** Upper bound on episode rows we render, so a 1000+ episode run stays usable. */
const MAX_EPISODES = 200;

/**
 * Episode list for a title, taken from the streaming source when one can
 * answer, so the guide mirrors what is actually playable rather than the
 * catalogue's (often differently split) episode count. Falls back to an empty
 * list, letting callers keep the catalogue's own episodes.
 */
export async function listStreamableEpisodes(anime: Anime): Promise<Episode[]> {
  ensureInitialized();
  const entries = await playbackRegistry.listEpisodes(anime);
  return entries.slice(0, MAX_EPISODES).map((entry, index) => {
    const number = index + 1;
    const sourceNote =
      entry.sourceNumber && entry.sourceNumber !== number
        ? ` Source episode ${entry.sourceNumber}.`
        : '';
    return {
      id: `${anime.id}-s1-e${number}`,
      seasonId: `${anime.id}-season-1`,
      animeId: anime.id,
      number,
      title: entry.title ?? `Episode ${number}`,
      synopsis: `Episode ${number} of ${anime.title}.${sourceNote}`,
      durationMinutes: 0,
    };
  });
}

export { playbackRegistry };
