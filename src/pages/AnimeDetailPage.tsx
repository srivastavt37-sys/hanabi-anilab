import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import StarIcon from '@mui/icons-material/Star';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { useAnimeDetail } from '../hooks/useAnimeDetail';
import { GENRE_MAP } from '../types';
import { PosterCard } from '../components/PosterCard';
import { EmptyState, PosterRail, RailControls, SectionHeader } from '../components/Rail';
import { useDragRail } from '../hooks/useDragRail';
import { useAppData } from '../context/AppDataContext';
import { DUOTONE, EYEBROW, NUMERAL } from '../theme';
import type { ListStatus } from '../types';

const STATUS_LABEL: Record<string, string> = {
  airing: 'Airing',
  finished: 'Finished',
  upcoming: 'Upcoming',
};

const LIST_OPTIONS: { value: ListStatus; label: string }[] = [
  { value: 'watching', label: 'Watching' },
  { value: 'planned', label: 'Plan to watch' },
  { value: 'completed', label: 'Completed' },
];

const GENRE_LABELS = new Map([
  ['action', 'Action'], ['adventure', 'Adventure'], ['comedy', 'Comedy'], ['drama', 'Drama'],
  ['ecchi', 'Ecchi'], ['fantasy', 'Fantasy'], ['horror', 'Horror'], ['mahou-shoujo', 'Mahou Shoujo'],
  ['mecha', 'Mecha'], ['music', 'Music'], ['mystery', 'Mystery'], ['psychological', 'Psychological'],
  ['romance', 'Romance'], ['sci-fi', 'Sci-Fi'], ['slice-of-life', 'Slice of Life'], ['sports', 'Sports'],
  ['supernatural', 'Supernatural'], ['thriller', 'Thriller'],
]);

function genreLabel(id: string): string {
  return GENRE_MAP.get(id) ?? GENRE_LABELS.get(id) ?? id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function MetaDot() {
  return (
    <Box
      aria-hidden
      component="span"
      sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.35)', mx: 1.25, flexShrink: 0 }}
    />
  );
}

export function AnimeDetailPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { detail, loading, error, reload, isDemoSource } = useAnimeDetail(slug);
  const { getListStatus, setListStatus, getAnimeProgress } = useAppData();
  const [listAnchor, setListAnchor] = useState<HTMLElement | null>(null);
  const {
    ref: episodesRef, edges: episodeEdges, grabbing: episodesGrabbing,
    handlers: episodeHandlers, nudge: nudgeEpisodes,
  } = useDragRail();

  const anime = detail?.anime;
  const episodes = detail?.episodes ?? [];
  const related = detail?.related ?? [];

  if (loading) {
    return (
      <Box sx={{ mx: { xs: -2, md: -4 }, mt: { xs: -3, md: -4 } }}>
        <Skeleton variant="rectangular" sx={{ height: { xs: 420, md: 540 }, borderRadius: 0 }} />
        <Box sx={{ px: { xs: 2, md: 4 }, py: 4 }}>
          <Skeleton variant="text" width={320} height={52} />
          <Skeleton variant="text" width={220} />
          <Skeleton variant="rectangular" width={280} height={44} sx={{ borderRadius: 0.75, mt: 2 }} />
        </Box>
      </Box>
    );
  }

  if (!anime) {
    return (
      <EmptyState
        title={error ? 'Catalogue unavailable' : 'Anime not found'}
        message={error
          ? `Could not load this title: ${error}. Check your connection and try again.`
          : "This title doesn't exist in the catalogue. It may have been removed."}
        action={{ label: error ? 'Try again' : 'Back to home', onClick: () => (error ? reload() : navigate('/')) }}
      />
    );
  }

  const listStatus = getListStatus(anime.id);
  const progress = getAnimeProgress(anime.id);
  const continueEpisode = progress && !progress.completed ? episodes.find((e) => e.number === progress.episodeNumber) : undefined;
  const artwork = anime.cover ?? anime.poster;

  const handleListAction = (status: ListStatus) => {
    setListStatus(anime.id, listStatus === status ? null : status, { title: anime.title, poster: anime.poster });
    setListAnchor(null);
  };

  const openEpisode = (number: number) => navigate(`/watch/${anime.slug}?ep=${number}`);

  return (
    <Box sx={{ mx: { xs: -2, md: -4 }, mt: { xs: -3, md: -4 } }}>
      {/* Full-bleed hero */}
      <Box
        sx={{
          position: 'relative', minHeight: { xs: 430, md: 560 },
          display: 'flex', alignItems: 'flex-end', overflow: 'hidden',
          bgcolor: '#0C0B0A',
        }}
      >
        <Box
          component="img"
          src={artwork}
          alt=""
          sx={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: { xs: '62% 22%', md: '72% 28%' },
          }}
        />
        <Box
          sx={{
            position: 'absolute', inset: 0,
            background:
              'linear-gradient(90deg, rgba(18,14,14,0.97) 0%, rgba(18,14,14,0.86) 34%, rgba(18,14,14,0.35) 62%, rgba(18,14,14,0.55) 100%)',
          }}
        />
        <Box
          sx={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(18,14,14,0.55) 0%, rgba(18,14,14,0) 30%, rgba(18,14,14,0.9) 100%)',
          }}
        />
        <Box
          aria-hidden
          sx={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(760px 420px at 88% 24%, rgba(var(--hanabi-accent-rgb),0.34), transparent 68%)',
            mixBlendMode: 'screen',
          }}
        />

        <Box sx={{ position: 'relative', width: '100%', px: { xs: 3, md: 6 }, pb: { xs: 4, md: 6 }, pt: { xs: 14, md: 18 } }}>
          <Box sx={{ maxWidth: 700 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 2 }}>
              <Box
                aria-hidden
                sx={{
                  width: 24, height: 24, borderRadius: '4px', flexShrink: 0,
                  background: 'linear-gradient(140deg, rgba(var(--hanabi-accent-rgb),1), rgba(var(--hanabi-accent-rgb),0.72) 60%, rgba(var(--hanabi-accent-rgb),0.42))',
                  display: 'grid', placeItems: 'center',
                  fontSize: '0.7rem', fontWeight: 800, color: '#FFFFFF',
                }}
              >
                {anime.studio.charAt(0).toUpperCase()}
              </Box>
              <Typography sx={{ ...EYEBROW, color: 'rgba(255,255,255,0.92)' }}>
                {anime.studio}
              </Typography>
            </Box>

            <Typography variant="h1" component="h1" sx={{ color: '#FFFFFF', mb: 1.5 }}>
              {anime.title}
            </Typography>

            <Box
              sx={{
                display: 'flex', alignItems: 'center', flexWrap: 'wrap',
                mb: 2, color: 'rgba(255,255,255,0.86)',
              }}
            >
              {[
                anime.year > 0 ? String(anime.year) : null,
                anime.season || null,
                `${episodes.length || anime.episodeCount} episodes`,
              ]
                .filter((part): part is string => Boolean(part))
                .map((part, index) => (
                  <Box component="span" key={part} sx={{ display: 'inline-flex', alignItems: 'center' }}>
                    {index > 0 && <MetaDot />}
                    <Typography component="span" sx={{ ...EYEBROW, color: 'rgba(255,255,255,0.78)' }}>
                      {part}
                    </Typography>
                  </Box>
                ))}
              <Chip
                size="small"
                label={anime.format}
                sx={{
                  ml: 0.5, bgcolor: 'rgba(255,255,255,0.12)', color: '#FFFFFF',
                  border: '1px solid rgba(255,255,255,0.22)', backdropFilter: 'blur(6px)',
                }}
              />
              <Chip
                size="small"
                label={STATUS_LABEL[anime.status]}
                sx={{
                  bgcolor: anime.status === 'airing' ? 'rgba(var(--hanabi-accent-rgb),0.92)' : 'rgba(255,255,255,0.12)',
                  color: anime.status === 'airing' ? 'var(--hanabi-accent-ink)' : '#FFFFFF',
                  border: '1px solid rgba(255,255,255,0.22)', backdropFilter: 'blur(6px)',
                }}
              />
              {anime.rating > 0 && (
                <Chip
                  size="small"
                  icon={<StarIcon sx={{ fontSize: 14, color: 'secondary.main' }} />}
                  label={anime.rating.toFixed(1)}
                  sx={{
                    bgcolor: 'rgba(0,0,0,0.55)', color: '#FFFFFF',
                    border: '1px solid rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)',
                    '& .MuiChip-icon': { color: 'secondary.main', ml: 0.75 },
                  }}
                />
              )}
            </Box>

            <Typography
              sx={{
                color: 'rgba(255,255,255,0.78)', maxWidth: 560, mb: 3, fontSize: '0.92rem', lineHeight: 1.6,
                display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}
            >
              {anime.synopsis}
            </Typography>

            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
              {anime.status !== 'upcoming' && (
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<PlayArrowIcon />}
                  onClick={() => openEpisode(continueEpisode ? continueEpisode.number : 1)}
                  sx={{ bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }}
                >
                  {continueEpisode ? `Resume EP ${continueEpisode.number}` : 'Play EP 1'}
                </Button>
              )}
              <Box sx={{ position: 'relative' }}>
                <Tooltip title={listStatus ? 'In your list' : 'Add to list'}>
                  <IconButton
                    onClick={(e) => (listStatus ? handleListAction(listStatus) : setListAnchor(e.currentTarget))}
                    aria-expanded={Boolean(listAnchor)}
                    aria-haspopup="menu"
                    aria-label="Add to list"
                    sx={{
                      width: 42, height: 42, borderRadius: 0.75, border: '1px solid rgba(255,255,255,0.28)', color: '#FFFFFF',
                      backdropFilter: 'blur(6px)', bgcolor: 'rgba(0,0,0,0.28)',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.14)' },
                    }}
                  >
                    {listStatus ? <CheckIcon fontSize="small" /> : <AddIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
                <Menu
                  anchorEl={listAnchor}
                  open={Boolean(listAnchor)}
                  onClose={() => setListAnchor(null)}
                  aria-label="Choose list"
                  slotProps={{
                    paper: {
                      sx: {
                        mt: 1, minWidth: 200, borderRadius: 1, py: 0.5,
                        bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
                        boxShadow: '0 22px 50px -20px rgba(0,0,0,0.9)',
                      },
                    },
                  }}
                >
                  {LIST_OPTIONS.map((o) => (
                    <Button
                      key={o.value}
                      role="menuitem"
                      onClick={() => handleListAction(o.value)}
                      startIcon={listStatus === o.value ? <CheckIcon /> : <BookmarkIcon sx={{ opacity: 0.6 }} />}
                      sx={{ justifyContent: 'flex-start', px: 2, py: 1, color: 'text.primary', width: '100%' }}
                    >
                      {o.label}
                    </Button>
                  ))}
                </Menu>
              </Box>
            </Stack>

            {anime.genres.length > 0 && (
              <Stack direction="row" spacing={1} sx={{ mt: 2.5, flexWrap: 'wrap' }} useFlexGap>
                {anime.genres.map((g) => (
                  <Chip
                    key={g}
                    component={RouterLink}
                    to={`/explore?genre=${g}`}
                    clickable
                    size="small"
                    label={genreLabel(g)}
                    sx={{
                      bgcolor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)',
                      border: '1px solid rgba(255,255,255,0.16)', backdropFilter: 'blur(6px)',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.18)' },
                    }}
                  />
                ))}
              </Stack>
            )}
          </Box>
        </Box>
      </Box>

      <Box sx={{ px: { xs: 2, md: 4 }, py: { xs: 3, md: 4 } }}>
        {/* Episode frames */}
        {anime.status !== 'upcoming' && episodes.length > 0 && (
          <Box component="section" sx={{ mb: 7 }}>
            <SectionHeader
              title="Episodes"
              eyebrow={`${episodes.length} available`}
              index="01"
              action={<RailControls edges={episodeEdges} onNudge={nudgeEpisodes} label="episodes" />}
            />
            <Box
              ref={episodesRef}
              {...episodeHandlers}
              sx={{
                display: 'flex', gap: 2, overflowX: 'auto', overflowY: 'hidden',
                pb: 1, mx: { xs: -2, md: -4 }, px: { xs: 2, md: 4 },
                scrollSnapType: episodesGrabbing ? 'none' : 'x proximity', scrollBehavior: 'smooth', scrollbarWidth: 'none',
                cursor: episodesGrabbing ? 'grabbing' : 'grab',
                userSelect: episodesGrabbing ? 'none' : 'auto',
                overscrollBehaviorX: 'contain',
                '&::-webkit-scrollbar': { display: 'none' },
              }}
            >
              {episodes.map((e, i) => {
                const inProgress = progress?.episodeNumber === e.number && !progress.completed;
                const watched = (progress?.completed && progress.episodeNumber === e.number) || false;
                return (
                  <Box
                    key={e.id}
                    component={RouterLink}
                    to={`/watch/${anime.slug}?ep=${e.number}`}
                    aria-label={`Watch episode ${e.number}: ${e.title}`}
                    sx={{
                      width: { xs: 172, sm: 200 }, flexShrink: 0, scrollSnapAlign: 'start',
                      textDecoration: 'none', color: 'inherit',
                      '&:hover .ep-img': { filter: 'grayscale(0) contrast(1.02) brightness(1)', transform: 'scale(1.04)' },
                      '&:hover .ep-tint': { opacity: 0.1 },
                      '&:hover .ep-num': { color: 'primary.main' },
                      '&:focus-visible .ep-frame': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                    }}
                  >
                    <Box
                      className="ep-frame"
                      sx={{
                        position: 'relative', aspectRatio: '16 / 9', borderRadius: 1, overflow: 'hidden',
                        bgcolor: '#101010', border: '1px solid rgba(255,255,255,0.08)',
                        transition: 'border-color .3s ease',
                      }}
                    >
                      <Box
                        component="img"
                        className="ep-img"
                        src={artwork}
                        alt=""
                        loading="lazy"
                        sx={{
                          position: 'absolute', inset: 0, width: '100%', height: '100%',
                          objectFit: 'cover', objectPosition: ['50% 26%', '32% 30%', '68% 24%', '50% 38%'][i % 4],
                          filter: DUOTONE,
                          transition: 'filter .45s ease, transform .6s cubic-bezier(0.22,1,0.36,1)',
                        }}
                      />
                      {/* Crimson cast — same world, still readable. */}
                      <Box
                        className="ep-tint"
                        aria-hidden
                        sx={{
                          position: 'absolute', inset: 0, mixBlendMode: 'color', opacity: [0.86, 0.72, 0.79, 0.68][i % 4],
                          background: 'linear-gradient(150deg, rgba(var(--hanabi-accent-rgb),0.85), rgba(var(--hanabi-accent-rgb),0.22))',
                          transition: 'opacity .35s ease',
                        }}
                      />
                      <Box
                        aria-hidden
                        sx={{
                          position: 'absolute', inset: 0,
                          background: 'linear-gradient(180deg, rgba(10,8,8,0.35) 0%, rgba(10,8,8,0) 42%, rgba(10,8,8,0.78) 100%)',
                        }}
                      />
                      {/* Credits numeral — the frame's headline, not a watermark. */}
                      <Typography
                        aria-hidden
                        className="ep-num"
                        sx={{
                          ...NUMERAL, position: 'absolute', left: 12, bottom: 8,
                          fontSize: '1.9rem', lineHeight: 0.9, color: 'rgba(255,255,255,0.94)',
                          textShadow: '0 2px 16px rgba(0,0,0,0.85)',
                          transition: 'color .3s ease',
                        }}
                      >
                        {String(e.number).padStart(2, '0')}
                      </Typography>
                      <Box
                        aria-hidden
                        sx={{ position: 'absolute', top: 10, right: 10, display: 'flex', alignItems: 'center', gap: 0.75 }}
                      >
                        {watched && (
                          <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: 'success.main' }} />
                        )}
                        {inProgress && (
                          <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: 'primary.main' }} />
                        )}
                      </Box>
                      <Box
                        aria-hidden
                        sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, bgcolor: 'rgba(255,255,255,0.16)' }}
                      >
                        <Box
                          sx={{
                            width: inProgress ? '45%' : watched ? '100%' : '0%',
                            height: '100%',
                            bgcolor: watched ? 'success.main' : 'primary.main',
                          }}
                        />
                      </Box>
                    </Box>
                    {(() => {
                      const generic = new RegExp(`^episode\\s*0?${e.number}$`, 'i').test(e.title.trim());
                      const status = watched ? 'Watched' : inProgress ? 'Resume' : null;
                      if (generic && !status) return null;
                      return (
                        <Box sx={{ mt: 1.25, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.5 }}>
                          <Typography noWrap sx={{ fontSize: '0.86rem', fontWeight: 600, minWidth: 0 }}>
                            {generic ? `EP ${String(e.number).padStart(2, '0')}` : e.title}
                          </Typography>
                          {status && (
                            <Typography sx={{ ...EYEBROW, color: watched ? 'success.main' : 'primary.main', flexShrink: 0 }}>
                              {status}
                            </Typography>
                          )}
                        </Box>
                      );
                    })()}
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}

        {/* Official streaming links */}
        {detail && detail.externalLinks.length > 0 && (
          <Box sx={{ mb: 7 }}>
            <SectionHeader title="Official streams" eyebrow="Where to watch legally" index="02" />
            <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }} useFlexGap>
              {detail.externalLinks.map((l) => (
                <Button
                  key={l.url}
                  variant="outlined"
                  size="small"
                  endIcon={<OpenInNewIcon />}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {l.label}
                </Button>
              ))}
            </Stack>
          </Box>
        )}

        {isDemoSource && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 4 }}>
            Offline demo catalogue entry.
          </Typography>
        )}

        {related.length > 0 && (
          <PosterRail title="More like this" eyebrow="Related titles" index="03">
            {related.map((a) => <PosterCard key={a.id} anime={a} />)}
          </PosterRail>
        )}
      </Box>
    </Box>
  );
}
