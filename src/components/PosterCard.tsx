import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { Link as RouterLink } from 'react-router-dom';
import { EYEBROW, NUMERAL } from '../theme';
import type { Anime } from '../types';

const TILE = {
  display: 'grid', placeItems: 'center', borderRadius: '4px',
  border: '1px solid rgba(255,255,255,0.16)',
  bgcolor: 'rgba(12,10,9,0.62)', backdropFilter: 'blur(10px)',
} as const;

export function PosterCard({ anime, progress }: { anime: Anime; progress?: number }) {
  const meta = [anime.format, anime.year > 0 ? String(anime.year) : null, anime.episodeCount > 0 ? `${anime.episodeCount} EP` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Box
      component={RouterLink}
      to={`/anime/${anime.slug}`}
      aria-label={`${anime.title} details`}
      sx={{
        position: 'relative', display: 'block', textDecoration: 'none', color: 'inherit',
        borderRadius: '10px', overflow: 'hidden',
        bgcolor: 'background.paper',
        border: '1px solid', borderColor: 'divider',
        boxShadow: 'inset 0 1px 0 0 rgba(255,248,240,0.05)',
        transition: 'transform .4s cubic-bezier(0.22,1,0.36,1), border-color .25s, box-shadow .4s',
        '&:hover': {
          transform: 'translateY(-6px)',
          borderColor: 'rgba(var(--hanabi-accent-rgb),0.62)',
          boxShadow: '0 26px 44px -30px rgba(0,0,0,0.95), inset 0 1px 0 0 rgba(255,248,240,0.09)',
          '& .poster-img': { transform: 'scale(1.055)', filter: 'saturate(1.06)' },
          '& .poster-cta': { transform: 'translateY(0)', opacity: 1 },
          '& .poster-veil': { opacity: 1 },
        },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 3 },
      }}
    >
      <Box sx={{ position: 'relative', pt: '150%', overflow: 'hidden', bgcolor: 'action.hover' }}>
        <Box
          component="img"
          className="poster-img"
          src={anime.poster}
          alt=""
          loading="lazy"
          sx={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', display: 'block',
            transition: 'transform .6s cubic-bezier(0.22,1,0.36,1), filter .4s ease',
          }}
        />

        {/* Bottom veil, only on hover: keeps the artwork the star at rest. */}
        <Box
          className="poster-veil"
          sx={{
            position: 'absolute', inset: 0, opacity: 0, transition: 'opacity .3s',
            background: 'linear-gradient(180deg, rgba(10,8,7,0) 46%, rgba(10,8,7,0.55) 74%, rgba(10,8,7,0.92) 100%)',
          }}
        />

        <Box sx={{ ...TILE, position: 'absolute', top: 8, left: 8, px: 0.75, height: 22 }}>
          <Typography sx={{ ...EYEBROW, fontSize: '0.56rem', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.92)' }}>
            {anime.format}
          </Typography>
        </Box>

        {anime.rating > 0 && (
          <Box
            sx={{
              ...NUMERAL, position: 'absolute', top: 8, right: 8, minWidth: 34, height: 22,
              display: 'grid', placeItems: 'center', borderRadius: '4px',
              bgcolor: 'primary.main', color: 'primary.contrastText',
              fontSize: '0.62rem', letterSpacing: '0.02em',
            }}
          >
            {anime.rating.toFixed(1)}
          </Box>
        )}

        {anime.status === 'upcoming' && (
          <Box
            sx={{
              position: 'absolute', top: 38, left: 8, px: 0.75, height: 20, display: 'grid', placeItems: 'center',
              borderRadius: '4px', bgcolor: 'rgba(12,10,9,0.72)', border: '1px solid rgba(255,255,255,0.18)',
            }}
          >
            <Typography sx={{ ...EYEBROW, fontSize: '0.52rem', color: 'rgba(255,255,255,0.8)' }}>Soon</Typography>
          </Box>
        )}

        {/* Rectangular play bar — not a floating circle. */}
        <Box
          className="poster-cta"
          sx={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: 34,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
            bgcolor: 'primary.main', color: 'primary.contrastText',
            transform: 'translateY(100%)', opacity: 0,
            transition: 'transform .3s cubic-bezier(0.22,1,0.36,1), opacity .25s ease',
          }}
        >
          <PlayArrowIcon sx={{ fontSize: 15 }} />
          <Typography sx={{ ...EYEBROW, fontSize: '0.58rem', letterSpacing: '0.2em', color: 'inherit' }}>
            Play
          </Typography>
        </Box>

        {progress !== undefined && progress > 0 && (
          <LinearProgress
            variant="determinate"
            value={Math.min(progress, 100)}
            sx={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
              bgcolor: 'rgba(12,10,9,0.7)', '& .MuiLinearProgress-bar': { bgcolor: 'primary.main' },
            }}
          />
        )}
      </Box>

      <Box sx={{ px: 1.25, pt: 1.1, pb: 1.35 }}>
        <Typography
          variant="subtitle2"
          noWrap
          title={anime.title}
          sx={{ display: 'block', mb: 0.5, fontSize: '0.83rem', fontWeight: 600 }}
        >
          {anime.title}
        </Typography>
        <Typography
          noWrap
          display="block"
          sx={{ ...EYEBROW, fontSize: '0.56rem', letterSpacing: '0.13em', color: 'text.secondary' }}
        >
          {meta}
        </Typography>
      </Box>
    </Box>
  );
}

export function PosterCardSkeleton() {
  return (
    <Box sx={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Skeleton variant="rectangular" sx={{ pt: '150%' }} />
      <Box sx={{ px: 1.25, pt: 1.1, pb: 1.35 }}>
        <Skeleton variant="text" width="80%" />
        <Skeleton variant="text" width="55%" />
      </Box>
    </Box>
  );
}
