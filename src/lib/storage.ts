import type { LibraryEntry, ListStatus, WatchProgress } from '../types';

const PREFIX = 'anistream:';

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode) — data simply won't persist
  }
}

export const loadProgress = () => loadJSON<WatchProgress[]>('progress', []);
export const saveProgress = (v: WatchProgress[]) => saveJSON('progress', v);

export const loadLibrary = () => loadJSON<LibraryEntry[]>('library', []);
export const saveLibrary = (v: LibraryEntry[]) => saveJSON('library', v);

export const loadThemeMode = (): 'light' | 'dark' | null => {
  const v = localStorage.getItem(PREFIX + 'theme');
  return v === 'light' || v === 'dark' ? v : null;
};
export const saveThemeMode = (v: 'light' | 'dark') => localStorage.setItem(PREFIX + 'theme', v);

export type { ListStatus };
