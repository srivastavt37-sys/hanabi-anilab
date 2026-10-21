import { useCallback, useEffect, useRef, useState } from 'react';
import type { Anime } from '../types';
import { ANIME_LIST } from '../data/catalogue';
import { fetchExplore, fetchPopular, fetchTrending, type ExploreFilters } from '../providers/anilist';

export type CatalogueSource = 'anilist' | 'demo' | 'loading' | 'error';

interface UseCatalogueResult {
  anime: Anime[];
  source: CatalogueSource;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Loads catalogue pages from AniList with a 30-minute local cache.
 * Falls back to the bundled demo catalogue when the API is unreachable,
 * so the app remains usable offline.
 */
export function useCatalogue(
  loader: (page: number) => Promise<{ anime: Anime[]; hasNextPage: boolean }>,
  deps: unknown[] = [],
): UseCatalogueResult & { loadMore: () => void; hasMore: boolean } {
  const [anime, setAnime] = useState<Anime[]>([]);
  const [source, setSource] = useState<CatalogueSource>('loading');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRef = useRef(1);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    pageRef.current = 1;
    loader(1)
      .then((result) => {
        if (cancelled) return;
        setAnime(result.anime);
        setHasMore(result.hasNextPage);
        setSource('anilist');
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setSource('demo');
        setAnime(ANIME_LIST);
        setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls reloads via deps
  }, [reloadKey, ...deps]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading || source !== 'anilist') return;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    loader(nextPage)
      .then((result) => {
        pageRef.current = nextPage;
        setAnime((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...result.anime.filter((a) => !seen.has(a.id))];
        });
        setHasMore(result.hasNextPage);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  }, [hasMore, loadingMore, loading, source, loader]);

  return {
    anime, source, error, loading,
    reload: () => setReloadKey((k) => k + 1),
    loadMore, hasMore: hasMore && !loadingMore,
  };
}

export function useTrending() {
  return useCatalogue(fetchTrending);
}

export function usePopular() {
  return useCatalogue(fetchPopular);
}

export function useExplore(filters: ExploreFilters) {
  const loader = useCallback((page: number) => fetchExplore({ ...filters, page }), [JSON.stringify(filters)]);
  return useCatalogue(loader, [JSON.stringify(filters)]);
}
