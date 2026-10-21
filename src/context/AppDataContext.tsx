import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { LibraryEntry, ListStatus, WatchProgress } from '../types';
import { loadLibrary, loadProgress, saveLibrary, saveProgress } from '../lib/storage';
import { deleteLibraryEntry, pullAll, pushLibraryEntry, pushProgress, syncNow } from '../lib/sync';
import { useAuth } from './AuthContext';
import { ANIME_BY_SLUG, ANIME_LIST } from '../data/catalogue';

interface AppData {
  progress: WatchProgress[];
  library: LibraryEntry[];
  getProgressFor: (episodeId: string) => WatchProgress | undefined;
  getAnimeProgress: (animeId: string) => WatchProgress | undefined;
  saveWatchProgress: (p: { animeId: string; episodeId: string; episodeNumber: number; positionSeconds: number; durationSeconds: number; animeTitle?: string; animePoster?: string }) => void;
  getListStatus: (animeId: string) => ListStatus | null;
  setListStatus: (animeId: string, status: ListStatus | null, meta?: { title?: string; poster?: string }) => void;
  getLibraryEntry: (animeId: string) => LibraryEntry | undefined;
  syncing: boolean;
  lastSyncedAt: number | null;
}

const AppDataContext = createContext<AppData | null>(null);

function lookupAnime(animeId: string): { title: string; poster: string } | null {
  const byId = ANIME_LIST.find((a) => a.id === animeId);
  if (byId) return { title: byId.title, poster: byId.poster };
  const numeric = animeId.replace('anilist-', '');
  const bySlug = ANIME_BY_SLUG.get(`${numeric}-`) ?? [...ANIME_BY_SLUG.values()].find((a) => a.slug.startsWith(`${numeric}-`));
  if (bySlug) return { title: bySlug.title, poster: bySlug.poster };
  return null;
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [progress, setProgress] = useState<WatchProgress[]>(() => loadProgress());
  const [library, setLibrary] = useState<LibraryEntry[]>(() => loadLibrary());
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  useEffect(() => saveProgress(progress), [progress]);
  useEffect(() => saveLibrary(library), [library]);

  // On sign-in (or page load while signed in), merge cloud state.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setSyncing(true);
    syncNow().then((merged) => {
      if (cancelled) return;
      if (merged) {
        setProgress(merged.progress);
        setLibrary(merged.library);
      }
      setLastSyncedAt(Date.now());
      setSyncing(false);
    });
    return () => { cancelled = true; };
  }, [user]);

  // Periodic background sync while signed in.
  useEffect(() => {
    if (!user) return;
    const interval = window.setInterval(() => {
      pullAll().then((merged) => {
        if (merged) {
          setProgress(merged.progress);
          setLibrary(merged.library);
          setLastSyncedAt(Date.now());
        }
      });
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [user]);

  const saveWatchProgress = useCallback<AppData['saveWatchProgress']>((p) => {
    setProgress((prev) => {
      const completed = p.durationSeconds > 0 && p.positionSeconds / p.durationSeconds >= 0.92;
      const next: WatchProgress = {
        animeId: p.animeId,
        episodeId: p.episodeId,
        episodeNumber: p.episodeNumber,
        positionSeconds: p.positionSeconds,
        durationSeconds: p.durationSeconds,
        updatedAt: Date.now(),
        completed,
        animeTitle: p.animeTitle ?? lookupAnime(p.animeId)?.title,
        animePoster: p.animePoster ?? lookupAnime(p.animeId)?.poster,
      };
      void pushProgress(next); // fire-and-forget cloud write
      return [...prev.filter((x) => x.episodeId !== p.episodeId), next];
    });
  }, []);

  const setListStatus = useCallback<AppData['setListStatus']>((animeId, status, meta) => {
    setLibrary((prev) => {
      const without = prev.filter((e) => e.animeId !== animeId);
      if (!status) {
        void deleteLibraryEntry(animeId);
        return without;
      }
      const info = meta?.title ? { title: meta.title, poster: meta.poster ?? '' } : lookupAnime(animeId);
      const next: LibraryEntry = {
        animeId,
        status,
        updatedAt: Date.now(),
        animeTitleFallback: info?.title,
        animePosterFallback: info?.poster,
      };
      void pushLibraryEntry(next, info?.title ?? '', info?.poster ?? '');
      return [...without, next];
    });
  }, []);

  const value = useMemo<AppData>(() => ({
    progress,
    library,
    getProgressFor: (episodeId) => progress.find((p) => p.episodeId === episodeId),
    getAnimeProgress: (animeId) => {
      const items = progress.filter((p) => p.animeId === animeId);
      return items.length ? items.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b)) : undefined;
    },
    saveWatchProgress,
    getListStatus: (animeId) => library.find((e) => e.animeId === animeId)?.status ?? null,
    setListStatus,
    getLibraryEntry: (animeId) => library.find((e) => e.animeId === animeId),
    syncing,
    lastSyncedAt,
  }), [progress, library, saveWatchProgress, setListStatus, syncing, lastSyncedAt]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
