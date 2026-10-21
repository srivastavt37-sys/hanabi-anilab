import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import StarIcon from '@mui/icons-material/Star';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useTrending, usePopular, useExplore } from '../hooks/useCatalogue';
import { PosterCard } from '../components/PosterCard';
import { FanDeck } from '../components/FanDeck';
import { PosterRail, PosterRailSkeleton, SectionHeader } from '../components/Rail';
import { CatalogueSourceBadge } from '../components/StatusBadges';
import { useAppData } from '../context/AppDataContext';
import { EYEBROW, NUMERAL } from '../theme';
import { GENRE_MAP } from '../types';
import type { Anime } from '../types';

function Hero({ anime, inList, onToggleList, index }: { anime: Anime; inList: boolean; onToggleList: () => void; index: string }) {
  const navigate = useNavigate();
  return (
    <Box
      sx={{
        position: 'relative', overflow: 'hidden', mb: { xs: 6, md: 9 },
        mx: { xs: -2, md: -4 }, mt: { xs: -3, md: -4 },
        minHeight: { xs: 480, md: 'clamp(520px, 66vh, 700px)' }, display: 'flex', alignItems: 'flex-end',
        bgcolor: '#0C0B0A',
      }}
    >
      <Box
        component="img"
        src={anime.cover ?? anime.poster}
        alt=""
        sx={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: { xs: '64% 20%', md: '72% 24%' },
          filter: 'saturate(1.05) contrast(1.04)',
          transform: 'scale(1.02)',
        }}
      />
      {/* Layered scrims: legibility on the left, artwork alive on the right. */}
      <Box
        sx={{
          position: 'absolute', inset: 0,
          background: {
            xs: 'linear-gradient(180deg, rgba(14,11,11,0.5) 0%, rgba(14,11,11,0.62) 42%, rgba(14,11,11,0.97) 100%)',
            md: 'linear-gradient(94deg, rgba(14,11,11,0.98) 4%, rgba(14,11,11,0.9) 30%, rgba(14,11,11,0.34) 62%, rgba(14,11,11,0.5) 100%)',
          },
        }}
      />
      <Box
        sx={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(14,11,11,0.72) 0%, rgba(14,11,11,0) 26%)',
        }}
      />
      {/* The flare — the single crimson bloom per view. */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute', left: { xs: '-12%', md: '2%' }, bottom: { xs: '-26%', md: '-16%' },
          width: { xs: '90%', md: '54%' }, aspectRatio: '1 / 1', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(var(--hanabi-accent-rgb),0.34) 0%, rgba(var(--hanabi-accent-rgb),0.08) 44%, transparent 70%)',
          mixBlendMode: 'screen', pointerEvents: 'none',
        }}
      />
      {/* Index watermark, credits style — the one grid break. */}
      <Box
        aria-hidden
        sx={{
          ...NUMERAL, position: 'absolute', right: { xs: 8, md: 20 }, top: { xs: 8, md: 4 },
          fontSize: 'clamp(90px, 15vw, 220px)', lineHeight: 0.82,
          color: 'transparent', WebkitTextStroke: '1px rgba(255,255,255,0.11)',
          userSelect: 'none', pointerEvents: 'none',
        }}
      >
        {index}
      </Box>

      <Box sx={{ position: 'relative', width: '100%', px: { xs: 3, md: 6 }, pb: { xs: 4, md: 7 }, pt: { xs: 14, md: 15 } }}>
        <Box sx={{ maxWidth: { md: 720 } }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2.5 }}>
            <Box sx={{ width: 28, height: '1.5px', bgcolor: 'rgba(255,255,255,0.9)' }} />
            <Typography sx={{ ...EYEBROW, color: '#FFFFFF' }}>Featured</Typography>
            <Typography sx={{ ...EYEBROW, color: 'rgba(255,255,255,0.42)' }}>/ {index}</Typography>
          </Stack>

          <Typography
            variant="h1"
            component="h1"
            sx={{
              color: '#FFFFFF', mb: 2.5, maxWidth: 620,
              textShadow: '0 24px 60px rgba(0,0,0,0.55)',
            }}
          >
            {anime.title}
          </Typography>

          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2.5, flexWrap: 'wrap' }} useFlexGap>
            {[anime.format, anime.year > 0 ? String(anime.year) : null, anime.season]
              .filter((p): p is string => Boolean(p))
              .map((part, i) => (
                <Box key={part} sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.5 }}>
                  {i > 0 && <Box aria-hidden sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.35)' }} />}
                  <Typography sx={{ ...EYEBROW, color: 'rgba(255,255,255,0.72)' }}>{part}</Typography>
                </Box>
              ))}
            {anime.rating > 0 && (
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, ml: 0.5 }}>
                <StarIcon sx={{ fontSize: 14, color: '#FFFFFF' }} />
                <Typography sx={{ ...NUMERAL, fontSize: '0.8rem', color: '#FFFFFF' }}>
                  {anime.rating.toFixed(1)}
                </Typography>
              </Box>
            )}
          </Stack>

          <Typography
            variant="body2"
            sx={{
              color: 'rgba(255,255,255,0.72)', mb: 4, maxWidth: 480, fontSize: '0.95rem', lineHeight: 1.7,
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {anime.synopsis}
          </Typography>

          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', alignItems: 'center' }} useFlexGap>
            <Button
              variant="contained"
              size="large"
              startIcon={<PlayArrowIcon />}
              onClick={() => navigate(`/watch/${anime.slug}`)}
              sx={{ px: 3.5 }}
            >
              Watch now
            </Button>
            <Button
              variant="outlined"
              size="large"
              startIcon={inList ? <CheckIcon /> : <AddIcon />}
              onClick={onToggleList}
              sx={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.3)', '&:hover': { borderColor: '#FFFFFF', bgcolor: 'rgba(255,255,255,0.08)' } }}
            >
              {inList ? 'In library' : 'Add to list'}
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}

export function HomePage() {
  const trending = useTrending();
  const popular = usePopular();
  const seasonal = useExplore({ sort: 'START_DATE_DESC' });
  const { getAnimeProgress, getListStatus, setListStatus } = useAppData();

  const combinedError = trending.error ?? popular.error;
  const loading = trending.loading || popular.loading;

  const featured = useMemo(
    () => trending.anime.find((a) => a.cover) ?? trending.anime[0],
    [trending.anime],
  );

  const continueWatching = useMemo(() => {
    return trending.anime.filter((a) => {
      const p = getAnimeProgress(a.id);
      return p && !p.completed && p.positionSeconds > 5;
    }).slice(0, 12);
  }, [trending.anime, getAnimeProgress]);

  const sourceBadge = <CatalogueSourceBadge source={trending.source} />;

  return (
    <Box>
      {loading ? (
        <Box sx={{ mb: { xs: 4, md: 6 } }}>
          <Box
            sx={{
              position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'flex-end',
              mx: { xs: -2, md: -4 }, mt: { xs: -3, md: -4 }, mb: { xs: 5, md: 5 },
              minHeight: { xs: 480, md: 'clamp(500px, 62vh, 660px)' }, bgcolor: '#0C0B0A',
            }}
          >
            <Skeleton variant="rectangular" sx={{ position: 'absolute', inset: 0, borderRadius: 0, transform: 'none' }} />
            <Box sx={{ position: 'relative', width: '100%', px: { xs: 3, md: 6 }, pb: { xs: 4, md: 7 } }}>
              <Skeleton variant="text" width={104} height={14} sx={{ mb: 2.5 }} />
              <Skeleton variant="text" width="62%" height={58} sx={{ mb: 0.5 }} />
              <Skeleton variant="text" width="44%" height={58} sx={{ mb: 2.5 }} />
              <Skeleton variant="text" width={310} height={14} sx={{ mb: 0.75 }} />
              <Skeleton variant="text" width={250} height={14} sx={{ mb: 3 }} />
              <Stack direction="row" spacing={1.5}>
                <Skeleton variant="rounded" width={150} height={46} sx={{ borderRadius: '6px' }} />
                <Skeleton variant="rounded" width={138} height={46} sx={{ borderRadius: '6px' }} />
              </Stack>
            </Box>
          </Box>
          <PosterRailSkeleton title="Trending now" index="04" />
        </Box>      ) : (
        <>
          {featured && (
            <Hero
              anime={featured}
              index="01"
              inList={getListStatus(featured.id) === 'watching' || getListStatus(featured.id) === 'planned'}
              onToggleList={() => {
                const cur = getListStatus(featured.id);
                setListStatus(featured.id, cur ? null : 'watching', { title: featured.title, poster: featured.poster });
              }}
            />
          )}

          <FanDeck anime={trending.anime} index="02" />

          {continueWatching.length > 0 && (
            <PosterRail title="Continue watching" eyebrow="Pick up where you left off" index="03">
              {continueWatching.map((a) => {
                const p = getAnimeProgress(a.id);
                return (
                  <PosterCard
                    key={a.id}
                    anime={a}
                    progress={p && p.durationSeconds > 0 ? (p.positionSeconds / p.durationSeconds) * 100 : undefined}
                  />
                );
              })}
            </PosterRail>
          )}

          <PosterRail title="Trending now" eyebrow="Hot this week" index="04" size="lg" action={sourceBadge}>
            {trending.anime.map((a) => <PosterCard key={a.id} anime={a} />)}
          </PosterRail>

          {seasonal.anime.length > 0 && (
            <PosterRail title="Recently started" eyebrow="Fresh episodes" index="06">
              {seasonal.anime.slice(0, 12).map((a) => <PosterCard key={a.id} anime={a} />)}
            </PosterRail>
          )}

          <PosterRail
            title="Popular all time"
            eyebrow="All-time hall of fame"
            index="06"
            action={
              combinedError ? undefined : (
                <Button component={RouterLink} to="/explore" size="small" sx={{ fontWeight: 700 }}>
                  Browse all
                </Button>
              )
            }
          >
            {popular.anime.slice(0, 12).map((a) => <PosterCard key={a.id} anime={a} />)}
          </PosterRail>

          <Box component="section" sx={{ mb: 2 }}>
            <SectionHeader title="Browse by genre" eyebrow="Discover" index="07" />
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {['action', 'adventure', 'comedy', 'drama', 'fantasy', 'romance', 'sci-fi', 'slice-of-life', 'sports', 'supernatural'].map((g) => (
                <Chip
                  key={g}
                  component={RouterLink}
                  to={`/explore?genre=${g}`}
                  clickable
                  label={GENRE_MAP.get(g) ?? g}
                  variant="outlined"
                  sx={{
                    borderColor: 'divider', px: 1, py: 0.3, borderRadius: 999,
                    transition: 'all .2s',
                    '&:hover': { borderColor: 'primary.main', color: 'primary.main', bgcolor: 'rgba(var(--hanabi-accent-rgb),0.08)' },
                  }}
                />
              ))}
            </Stack>
          </Box>
        </>
      )}
    </Box>
  );
}
