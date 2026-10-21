export type AnimeStatus = 'airing' | 'finished' | 'upcoming';
export type AnimeFormat = 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special';
export type SeasonName = 'Winter' | 'Spring' | 'Summer' | 'Fall';
export type ListStatus = 'watching' | 'planned' | 'completed';

export interface Genre {
  id: string;
  name: string;
}

export interface Season {
  id: string;
  animeId: string;
  number: number;
  title: string;
}

export interface Episode {
  id: string;
  seasonId: string;
  animeId: string;
  number: number;
  title: string;
  synopsis: string;
  durationMinutes: number;
  thumbnail?: string;
}

export interface Anime {
  id: string;
  slug: string;
  title: string;
  nativeTitle: string;
  /** Alternative titles from the catalogue (AniList synonyms) — used for provider matching. */
  synonyms?: string[];
  synopsis: string;
  status: AnimeStatus;
  format: AnimeFormat;
  year: number;
  season: SeasonName;
  rating: number; // 0-10
  popularity: number;
  episodeCount: number;
  poster: string;
  cover?: string;
  genres: string[];
  studio: string;
  trending?: boolean;
  featured?: boolean;
  upcoming?: boolean;
  demoPlayable?: boolean;
}

export interface WatchProgress {
  animeId: string;
  episodeId: string;
  episodeNumber: number;
  positionSeconds: number;
  durationSeconds: number;
  updatedAt: number;
  completed: boolean;
  animeTitle?: string;
  animePoster?: string;
}

export interface LibraryEntry {
  animeId: string;
  status: ListStatus;
  updatedAt: number;
  animeTitleFallback?: string;
  animePosterFallback?: string;
}

export interface PlaybackSource {
  kind: 'hls' | 'mp4' | 'embed';
  url: string;
  label: string;
  quality?: string;
  /** True when the source is a stand-in (demo clip / trailer), not a real episode stream. */
  surrogate?: boolean;
  subtitleTracks?: { lang: string; label: string; url: string }[];
}

export const GENRES: Genre[] = [
  { id: 'action', name: 'Action' },
  { id: 'adventure', name: 'Adventure' },
  { id: 'comedy', name: 'Comedy' },
  { id: 'drama', name: 'Drama' },
  { id: 'fantasy', name: 'Fantasy' },
  { id: 'mecha', name: 'Mecha' },
  { id: 'mystery', name: 'Mystery' },
  { id: 'romance', name: 'Romance' },
  { id: 'sci-fi', name: 'Sci-Fi' },
  { id: 'slice-of-life', name: 'Slice of Life' },
  { id: 'sports', name: 'Sports' },
  { id: 'supernatural', name: 'Supernatural' },
];

export const GENRE_MAP = new Map(GENRES.map((g) => [g.id, g.name]));
