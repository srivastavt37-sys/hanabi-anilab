import { useEffect, useMemo, useState } from 'react';
import { fetchAnimeDetail } from '../providers/anilist';
import { listStreamableEpisodes } from '../providers';
import { ANIME_BY_SLUG, getEpisodesForAnime } from '../data/catalogue';
import type { Anime, Episode } from '../types';
import type { ExternalStreamLink } from '../providers/types';

export interface AnimeDetailData {
  anime: Anime;
  episodes: Episode[];
  externalLinks: ExternalStreamLink[];
  related: Anime[];
}

/**
 * Loads full detail data for a slug. Slugs with a numeric prefix are AniList
 * ids ("12345-title-slug"); anything else is a bundled demo-catalogue entry.
 */
export function useAnimeDetail(slug: string) {
  const anilistId = useMemo(() => {
    const match = slug.match(/^(?:anilist-)?(\d+)/);
    return match ? match[1] : null;
  }, [slug]);

  const [detail, setDetail] = useState<AnimeDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!anilistId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    fetchAnimeDetail(anilistId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setLoading(false);
        // Mirror the streaming source's episode list when it disagrees with the
        // catalogue (e.g. AniList splits a season AniLab publishes as one run).
        return listStreamableEpisodes(d.anime).then((episodes) => {
          if (cancelled || episodes.length === 0) return;
          setDetail((prev) =>
            prev && prev.episodes.length !== episodes.length ? { ...prev, episodes } : prev,
          );
        });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [anilistId, reloadKey]);

  // Demo-catalogue fallback (no numeric prefix): resolve synchronously.
  const demoAnime = useMemo(() => (anilistId ? null : ANIME_BY_SLUG.get(slug) ?? null), [anilistId, slug]);

  useEffect(() => {
    if (!demoAnime) return;
    setDetail({
      anime: demoAnime,
      episodes: getEpisodesForAnime(demoAnime.id),
      externalLinks: [],
      related: [],
    });
  }, [demoAnime]);

  return {
    detail,
    loading: anilistId ? loading : false,
    error,
    isDemoSource: !anilistId,
    reload: () => setReloadKey((k) => k + 1),
  };
}
