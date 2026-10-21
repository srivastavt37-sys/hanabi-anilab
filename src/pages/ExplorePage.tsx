import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import { useSearchParams } from 'react-router-dom';
import { useExplore } from '../hooks/useCatalogue';
import { GENRES, GENRE_MAP } from '../types';
import { PosterCard, PosterCardSkeleton } from '../components/PosterCard';
import { EmptyState, ErrorState } from '../components/Rail';
import { CatalogueSourceBadge } from '../components/StatusBadges';
import type { AnimeStatus, AnimeFormat, SeasonName } from '../types';

const SORTS = [
  { value: 'SEARCH_MATCH', label: 'Relevance' },
  { value: 'POPULARITY_DESC', label: 'Popularity' },
  { value: 'SCORE_DESC', label: 'Rating' },
  { value: 'START_DATE_DESC', label: 'Release date' },
] as const;

type SortValue = (typeof SORTS)[number]['value'];

export function ExplorePage() {
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const genre = params.get('genre') ?? '';
  const year = params.get('year') ?? '';
  const season = params.get('season') ?? '';
  const format = params.get('format') ?? '';
  const status = params.get('status') ?? '';
  const sortParam = params.get('sort') as SortValue | null;
  // While searching, AniList relevance is the default order (and the label says so).
  const sort = sortParam ?? (q ? 'SEARCH_MATCH' : 'POPULARITY_DESC');

  const updateParam = useCallback((key: string, value: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  }, [setParams]);

  const results = useExplore({
    search: q || undefined,
    genre: genre || undefined,
    year: year ? Number(year) : undefined,
    season: (season || undefined) as SeasonName | undefined,
    format: (format || undefined) as AnimeFormat | undefined,
    // Only send a sort when the user picked one: search must keep AniList's
    // relevance ordering, otherwise exact title matches get buried.
    sort: sortParam ?? undefined,
  });

  // Client-side status filter (AniList search doesn't take status directly here).
  const filtered = useMemo(() => {
    if (!status) return results.anime;
    return results.anime.filter((a) => a.status === status);
  }, [results.anime, status]);

  const [visible, setVisible] = useState(24);
  useEffect(() => setVisible(24), [q, genre, year, season, format, status, sort]);
  const shown = filtered.slice(0, visible);
  const hasMoreLocal = visible < filtered.length;

  // Infinite scroll: local window first, then remote pages.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      if (hasMoreLocal) setVisible((v) => v + 24);
      else results.loadMore();
    }, { rootMargin: '300px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMoreLocal, results]);

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 27 }, (_, i) => now + 1 - i);
  }, []);

  const activeFilters = [
    genre && { label: GENRE_MAP.get(genre) ?? genre, key: 'genre' },
    year && { label: year, key: 'year' },
    season && { label: season, key: 'season' },
    format && { label: format, key: 'format' },
    status && { label: status, key: 'status' },
  ].filter(Boolean) as { label: string; key: string }[];

  const selectSx = { minWidth: 130 } as const;

  const offline = results.source === 'demo';
  const isFiltered = activeFilters.length > 0 || q.length > 0;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            aria-hidden
            sx={{ width: 4, height: 30, borderRadius: 4, background: 'linear-gradient(180deg, rgba(var(--hanabi-accent-rgb),1), rgba(var(--hanabi-accent-rgb),0.4))' }}
          />
          <Box>
            <Typography sx={{ fontSize: '0.6rem', letterSpacing: '0.3em', color: 'text.secondary', mb: 0.35, fontWeight: 600 }}>
              CATALOGUE
            </Typography>
            <Typography variant="h4">{q ? `“${q}”` : 'Explore'}</Typography>
          </Box>
        </Box>
        <CatalogueSourceBadge source={results.source} />
      </Box>

      <Paper
        component="section"
        aria-label="Filters"
        sx={{
          mb: 4, p: { xs: 2, md: 2.5 }, borderRadius: 3,
          bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
        }}
      >
        <TextField
          value={q}
          onChange={(e) => updateParam('q', e.target.value)}
          placeholder="Search by title…"
          fullWidth
          size="small"
          sx={{
            mb: 2, maxWidth: 520,
            '& .MuiOutlinedInput-root': {
              bgcolor: 'action.hover', borderRadius: 999,
              '& fieldset': { borderColor: 'divider' },
            },
          }}
        />
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={selectSx}>
            <InputLabel id="genre-label">Genre</InputLabel>
            <Select labelId="genre-label" label="Genre" value={genre} onChange={(e: SelectChangeEvent) => updateParam('genre', e.target.value)}>
              <MenuItem value="">All</MenuItem>
              {GENRES.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={selectSx}>
            <InputLabel id="year-label">Year</InputLabel>
            <Select labelId="year-label" label="Year" value={year} onChange={(e: SelectChangeEvent) => updateParam('year', e.target.value)}>
              <MenuItem value="">All</MenuItem>
              {years.map((y) => <MenuItem key={y} value={String(y)}>{y}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={selectSx}>
            <InputLabel id="season-label">Season</InputLabel>
            <Select labelId="season-label" label="Season" value={season} onChange={(e: SelectChangeEvent) => updateParam('season', e.target.value)}>
              <MenuItem value="">All</MenuItem>
              {['Winter', 'Spring', 'Summer', 'Fall'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={selectSx}>
            <InputLabel id="format-label">Format</InputLabel>
            <Select labelId="format-label" label="Format" value={format} onChange={(e: SelectChangeEvent) => updateParam('format', e.target.value)}>
              <MenuItem value="">All</MenuItem>
              {(['TV', 'Movie', 'OVA', 'ONA', 'Special'] as AnimeFormat[]).map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={selectSx}>
            <InputLabel id="status-label">Status</InputLabel>
            <Select labelId="status-label" label="Status" value={status} onChange={(e: SelectChangeEvent) => updateParam('status', e.target.value)}>
              <MenuItem value="">All</MenuItem>
              {(['airing', 'finished', 'upcoming'] as AnimeStatus[]).map((s) => (
                <MenuItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={selectSx}>
            <InputLabel id="sort-label">Sort by</InputLabel>
            <Select labelId="sort-label" label="Sort by" value={sort} onChange={(e: SelectChangeEvent) => updateParam('sort', e.target.value)}>
              {SORTS.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>

        {activeFilters.length > 0 && (
          <Box sx={{ mt: 2.5, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            {activeFilters.map((f) => (
              <Chip
                key={f.key}
                label={f.label}
                size="small"
                onDelete={() => updateParam(f.key, '')}
                sx={{ bgcolor: 'action.selected', border: '1px solid', borderColor: 'divider' }}
              />
            ))}
            <Button size="small" onClick={() => setParams({}, { replace: true })}>Clear all</Button>
          </Box>
        )}
      </Paper>

      {results.loading && shown.length === 0 ? (
        <Box
          sx={{
            display: 'grid', gap: { xs: 1.5, sm: 2 },
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)', lg: 'repeat(5, 1fr)' },
          }}
          aria-busy="true"
        >
          {Array.from({ length: 10 }, (_, i) => <PosterCardSkeleton key={i} />)}
        </Box>
      ) : results.error && shown.length === 0 && !offline ? (
        <ErrorState message={`Could not reach the catalogue: ${results.error}`} onRetry={results.reload} />
      ) : shown.length > 0 ? (
        <>
          <Typography
            sx={{ fontSize: '0.7rem', letterSpacing: '0.14em', color: 'text.secondary', mb: 2.5, fontWeight: 600 }}
          >
            {offline ? 'SHOWING THE BUNDLED DEMO CATALOGUE' : `${filtered.length}+ RESULTS`}
            {q ? ` FOR “${q}”` : ''}
          </Typography>
          <Box
            sx={{
              display: 'grid', gap: { xs: 1.5, sm: 2 },
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)', lg: 'repeat(5, 1fr)' },
            }}
          >
            {shown.map((a) => <PosterCard key={a.id} anime={a} />)}
          </Box>
          {results.loading && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 3 }} aria-live="polite">
              Loading more…
            </Typography>
          )}
          <div ref={sentinelRef} aria-hidden />
        </>
      ) : (
        <EmptyState
          icon={<SearchOffIcon color="disabled" sx={{ fontSize: 44, mb: 1 }} />}
          title="No results found"
          message={q
            ? `Nothing matches “${q}”. Try a different title or clear some filters.`
            : 'No anime match the selected filters. Try clearing a few.'}
          action={{ label: 'Clear filters', onClick: () => setParams({}, { replace: true }) }}
        />
      )}
      {isFiltered && results.source === 'anilist' && null}
    </Box>
  );
}
