import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useNavigate } from 'react-router-dom';
import { EYEBROW, NUMERAL } from '../theme';
import type { Anime } from '../types';

/**
 * Layered spotlight deck.
 *
 * One title is "in hand" — large, in colour, with its CTA. Neighbours sit
 * behind it, dimmed and slighted rotated, so the row reads as a deck of
 * prints rather than a grid of thumbnails. Drag sideways (or use ← →) to
 * deal the next card; clicking the front card opens its detail page.
 */
export function FanDeck({ anime, index = '01' }: { anime: Anime[]; index?: string }) {
  const navigate = useNavigate();
  const items = anime.slice(0, 5);
  const [active, setActive] = useState(0);
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);

  if (items.length === 0) return null;

  const clamp = (n: number) => Math.max(0, Math.min(items.length - 1, n));
  const step = (dir: -1 | 1) => setActive((a) => clamp(a + dir));

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    start.current = e.clientX;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return;
    setDrag(Math.max(-140, Math.min(140, e.clientX - start.current)));
  };

  const finish = (e: React.PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return;
    const dx = e.clientX - start.current;
    start.current = null;
    setDrag(0);
    if (dx <= -48) step(1);
    else if (dx >= 48) step(-1);
  };

  return (
    <Box component="section" sx={{ mb: { xs: 5, md: 7 } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, mb: 1 }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
            <Typography aria-hidden sx={{ ...NUMERAL, fontSize: '0.78rem', color: 'primary.main' }}>
              {index}
            </Typography>
            <Typography sx={{ ...EYEBROW, color: 'text.secondary' }}>Spotlight deck</Typography>
          </Box>
          <Typography variant="h4" component="h2" sx={{ mt: 0.6 }}>In hand this week</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, flexShrink: 0 }}>
          <IconButton
            aria-label="Previous spotlight"
            disabled={active === 0}
            onClick={() => step(-1)}
            sx={{
              width: 30, height: 30, borderRadius: '4px', border: '1px solid', borderColor: 'divider',
              '&:hover': { color: 'primary.main', borderColor: 'primary.main' },
              '&.Mui-disabled': { opacity: 0.3 },
            }}
          >
            <ChevronLeftIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <IconButton
            aria-label="Next spotlight"
            disabled={active === items.length - 1}
            onClick={() => step(1)}
            sx={{
              width: 30, height: 30, borderRadius: '4px', border: '1px solid', borderColor: 'divider',
              '&:hover': { color: 'primary.main', borderColor: 'primary.main' },
              '&.Mui-disabled': { opacity: 0.3 },
            }}
          >
            <ChevronRightIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </Box>

      <Box
        role="group"
        aria-roledescription="carousel"
        aria-label="Spotlight titles"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onPointerLeave={finish}
        sx={{
          position: 'relative', height: { xs: 344, sm: 372, md: 396 },
          display: 'grid', placeItems: 'center', overflow: 'hidden',
          touchAction: 'pan-y', cursor: drag === 0 ? 'grab' : 'grabbing',
          maskImage: 'linear-gradient(90deg, transparent 0, #000 6%, #000 94%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(90deg, transparent 0, #000 6%, #000 94%, transparent 100%)',
          outline: 'none', '&:focus-visible': { boxShadow: 'inset 0 0 0 2px', boxShadowColor: 'primary.main' },
          '&::before': {
            content: '""', position: 'absolute', inset: 'auto 0 -40% 0', height: '80%',
            background: 'radial-gradient(closest-side, rgba(var(--hanabi-accent-rgb),0.16), transparent 72%)',
            pointerEvents: 'none',
          },
        }}
      >
        {items.map((a, i) => {
          const o = i - active;
          if (Math.abs(o) > 2) return null;
          const isActive = o === 0;
          return (
            <Box
              key={a.id}
              component={isActive ? 'button' : 'div'}
              onClick={() => {
                if (Math.abs(drag) > 8) return;
                if (isActive) navigate(`/anime/${a.slug}`);
                else setActive(i);
              }}
              aria-label={isActive ? `Open ${a.title}` : `Focus ${a.title}`}
              aria-hidden={!isActive}
              sx={{
                position: 'absolute', left: '50%', top: '50%',
                width: 'clamp(176px, 21vw, 250px)', aspectRatio: '3 / 4',
                p: 0, border: 0, textAlign: 'left', font: 'inherit', color: 'inherit',
                borderRadius: '10px', overflow: 'hidden', cursor: isActive ? 'pointer' : 'pointer',
                bgcolor: '#0C0B0A',
                transform: `translate(calc(-50% + ${o * 74}% + ${drag * 0.22}px), calc(-50% + ${Math.abs(o) * 12}px)) rotate(${o * 5}deg) scale(${1 - Math.abs(o) * 0.075})`,
                zIndex: 10 - Math.abs(o),
                opacity: Math.abs(o) > 1 ? 0.4 : isActive ? 1 : 0.72,
                transition: 'transform .55s cubic-bezier(0.22,1,0.36,1), opacity .4s ease, filter .4s ease, box-shadow .4s ease',
                filter: isActive ? 'none' : 'saturate(0.55) brightness(0.72)',
                boxShadow: isActive
                  ? '0 34px 70px -34px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,248,240,0.14)'
                  : '0 24px 48px -28px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,248,240,0.07)',
                '&:hover': isActive ? { transform: `translate(calc(-50% + ${drag * 0.22}px), -50%) scale(1.012)` } : undefined,
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 4 },
              }}
            >
              <Box
                component="img"
                src={a.cover ?? a.poster}
                alt=""
                draggable={false}
                sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
              />
              <Box
                sx={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(180deg, rgba(8,7,6,0.24) 0%, rgba(8,7,6,0) 34%, rgba(8,7,6,0.82) 76%, rgba(8,7,6,0.97) 100%)',
                }}
              />

              <Box
                sx={{
                  position: 'absolute', top: 10, left: 10, px: 0.85, height: 22, display: 'grid', placeItems: 'center',
                  borderRadius: '4px', bgcolor: 'rgba(12,10,9,0.6)', backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255,255,255,0.2)',
                }}
              >
                <Typography sx={{ ...EYEBROW, fontSize: '0.52rem', letterSpacing: '0.16em', color: 'rgba(255,255,255,0.92)' }}>
                  {a.status === 'airing' ? 'Simulcast' : a.format}
                </Typography>
              </Box>
              {a.rating > 0 && (
                <Box
                  sx={{
                    ...NUMERAL, position: 'absolute', top: 10, right: 10, minWidth: 36, height: 22,
                    display: 'grid', placeItems: 'center', borderRadius: '4px',
                    bgcolor: 'primary.main', color: 'primary.contrastText', fontSize: '0.62rem',
                  }}
                >
                  {a.rating.toFixed(1)}
                </Box>
              )}

              <Box sx={{ position: 'absolute', left: 12, right: 12, bottom: 12 }}>
                <Typography sx={{ ...EYEBROW, fontSize: '0.5rem', color: 'rgba(255,255,255,0.6)', mb: 0.6 }}>
                  {a.studio || 'Studio'} · {a.year}
                </Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '0.98rem', lineHeight: 1.15, letterSpacing: '-0.01em', color: '#FFFFFF' }} noWrap>
                  {a.title}
                </Typography>
                {isActive && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1, color: '#FFFFFF' }}>
                    <Typography sx={{ ...EYEBROW, fontSize: '0.54rem', color: 'inherit' }}>Open episode guide</Typography>
                    <ArrowForwardIcon sx={{ fontSize: 13 }} />
                  </Box>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.75, mt: 0.5 }} aria-hidden>
        {items.map((a, i) => (
          <Box
            key={a.id}
            sx={{
              width: i === active ? 26 : 8, height: 2,
              bgcolor: i === active ? 'primary.main' : 'divider',
              transition: 'width .3s ease, background-color .3s ease',
            }}
          />
        ))}
      </Box>
    </Box>
  );
}
