import type { Anime, Episode } from '../types';
import type { PlaybackProvider, PlaybackResolution, ExternalStreamLink, PlaybackSource } from './types';

/**
 * Blender Foundation open movies (CC-BY): the only content Hanabi can legally
 * stream in-app. Multiple independent mirrors + an HLS rendition give real
 * multi-source redundancy and exercise smart switching.
 * See: https://studio.blender.org/films/ and peach.blender.org (licensing).
 */

// Mirrors of CC-licensed Blender open movies. The first two serve H.264 MP4 /
// HLS that browsers decode; the last is a Matroska container that fails at
// the player level, exercising real failure detection and fallback.
const DEMO_EPISODE_SOURCES: PlaybackSource[] = [
  {
    kind: 'mp4',
    url: 'https://archive.org/download/Sintel/sintel-2048-surround_512kb.mp4',
    label: 'Sintel · 512kb (Internet Archive)',
    quality: 'SD',
    surrogate: true,
  },
  {
    kind: 'hls',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    label: 'Adaptive stream (Mux test CDN)',
    quality: 'Auto',
    surrogate: true,
  },
  {
    kind: 'mp4',
    url: 'https://download.blender.org/durian/movies/Sintel.2010.720p.mkv',
    label: 'Sintel · 720p (Blender CDN)',
    quality: '720p',
    surrogate: true,
  },
];

/**
 * Authorized demo playback provider: streams genuinely CC-licensed films
 * (Sintel, Blender Foundation) from public CDNs for the bundled demo
 * catalogue. Always labelled as a surrogate — never presented as the real
 * episode. Real licensed providers implement the same interface.
 */
export const BLENDER_STREAM_PROVIDER: PlaybackProvider = {
  id: 'blender',
  label: 'Hanabi demo stream (CC-licensed)',
  canHandle: (anime) => !anime.id.startsWith('anilist-'),
  async resolve(): Promise<PlaybackResolution> {
    await new Promise((r) => setTimeout(r, 300));
    return { status: 'ok', sources: DEMO_EPISODE_SOURCES };
  },
};

/**
 * Last-resort provider: surfaces official streaming links that AniList
 * reports for an anime. Rendered as optional alternatives — never silently
 * opened or auto-redirected.
 */
export const EXTERNAL_LINK_PROVIDER: PlaybackProvider = {
  id: 'external-links',
  label: 'Official streaming links',
  canHandle: () => true,
  async resolve(_anime: Anime, _episode: Episode, externalLinks: ExternalStreamLink[]): Promise<PlaybackResolution> {
    return {
      status: 'unavailable',
      sources: [],
      error: 'NO_INAPP_SOURCE',
      external: externalLinks,
    };
  },
};
