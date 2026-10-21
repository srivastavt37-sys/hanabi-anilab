import type { LibraryEntry, ListStatus, WatchProgress } from '../types';
import { supabase } from './supabase';
import { loadLibrary, loadProgress, saveLibrary, saveProgress } from './storage';

function toRow(p: WatchProgress) {
  return {
    anime_id: p.animeId,
    episode_id: p.episodeId,
    episode_number: p.episodeNumber,
    position_seconds: p.positionSeconds,
    duration_seconds: p.durationSeconds,
    completed: p.completed,
    anime_title: p.animeTitle ?? null,
    anime_poster: p.animePoster ?? null,
  };
}

function fromRow(r: { anime_id: string; episode_id: string; episode_number: number; position_seconds: number; duration_seconds: number; completed: boolean; updated_at: string; anime_title: string | null; anime_poster: string | null }): WatchProgress {
  return {
    animeId: r.anime_id,
    episodeId: r.episode_id,
    episodeNumber: r.episode_number,
    positionSeconds: Number(r.position_seconds),
    durationSeconds: Number(r.duration_seconds),
    completed: r.completed,
    updatedAt: new Date(r.updated_at).getTime(),
    animeTitle: r.anime_title ?? undefined,
    animePoster: r.anime_poster ?? undefined,
  };
}

export async function pushProgress(p: WatchProgress): Promise<void> {
  if (!supabase) return;
  await supabase.from('watch_progress').upsert(toRow(p), { onConflict: 'user_id,episode_id' });
}

export async function pushLibraryEntry(e: LibraryEntry, title: string, poster: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('library_entries').upsert(
    { anime_id: e.animeId, status: e.status, anime_title: title, anime_poster: poster },
    { onConflict: 'user_id,anime_id' },
  );
}

export async function deleteLibraryEntry(animeId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('library_entries').delete().eq('anime_id', animeId);
}

/** Merge remote rows into local state; newer timestamps win. */
export async function pullAll(): Promise<{ progress: WatchProgress[]; library: LibraryEntry[] } | null> {
  if (!supabase) return null;
  const [{ data: progressRows, error: pErr }, { data: libraryRows, error: lErr }] = await Promise.all([
    supabase.from('watch_progress').select('*').order('updated_at', { ascending: false }).limit(500),
    supabase.from('library_entries').select('*').order('updated_at', { ascending: false }).limit(500),
  ]);
  if (pErr || lErr) return null;

  const remoteProgress = (progressRows ?? []).map(fromRow);
  const remoteLibrary: LibraryEntry[] = (libraryRows ?? []).map((r: { anime_id: string; status: string; updated_at: string; anime_title: string | null; anime_poster: string | null }) => ({
    animeId: r.anime_id,
    status: r.status as ListStatus,
    updatedAt: new Date(r.updated_at).getTime(),
    animeTitleFallback: r.anime_title ?? undefined,
    animePosterFallback: r.anime_poster ?? undefined,
  }));

  const localProgress = loadProgress();
  const localLibrary = loadLibrary();

  const mergedProgress = mergeBy(remoteProgress, localProgress, (x) => x.episodeId);
  const mergedLibrary = mergeBy(remoteLibrary, localLibrary, (x) => x.animeId);

  saveProgress(mergedProgress);
  saveLibrary(mergedLibrary);
  return { progress: mergedProgress, library: mergedLibrary };
}

function mergeBy<T>(remote: T[], local: T[], key: (x: T) => string, ts: (x: T) => number = (x) => (x as unknown as { updatedAt: number }).updatedAt): T[] {
  const map = new Map<string, T>();
  for (const item of [...local, ...remote]) {
    const k = key(item);
    const existing = map.get(k);
    if (!existing || ts(item) >= ts(existing)) map.set(k, item);
  }
  return [...map.values()];
}

/** Push any local-only changes made while offline, then pull the merged state. */
export async function syncNow(): Promise<{ progress: WatchProgress[]; library: LibraryEntry[] } | null> {
  if (!supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;

  // Push local state up (upserts are idempotent).
  const localProgress = loadProgress();
  for (const p of localProgress) {
    await pushProgress(p);
  }
  const localLibrary = loadLibrary();
  for (const e of localLibrary) {
    await pushLibraryEntry(e, e.animeTitleFallback ?? '', e.animePosterFallback ?? '');
  }

  return pullAll();
}
