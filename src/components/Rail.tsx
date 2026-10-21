import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { EYEBROW, NUMERAL } from '../theme';
import { useDragRail } from '../hooks/useDragRail';

export function SectionHeader({ title, eyebrow, action, index }: {
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
  index?: string;
}) {
  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 2.5, mb: 2.5,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.75, minWidth: 0 }}>
        {index && (
          <Typography aria-hidden sx={{ ...NUMERAL, fontSize: '0.78rem', color: 'primary.main', flexShrink: 0 }}>
            {index}
          </Typography>
        )}
        <Box sx={{ minWidth: 0 }}>
          {eyebrow && (
            <Typography sx={{ ...EYEBROW, color: 'text.secondary', mb: 0.6 }}>
              {eyebrow}
            </Typography>
          )}
          <Typography variant="h4" component="h2" noWrap>{title}</Typography>
        </Box>
      </Box>
      <Box aria-hidden sx={{ flexGrow: 1, height: '1px', bgcolor: 'divider', mb: 1.1, minWidth: 24 }} />
      {action}
    </Box>
  );
}

const ARROW_SX = {
  width: 30, height: 30, borderRadius: '4px', border: '1px solid', borderColor: 'divider',
  color: 'text.secondary', bgcolor: 'transparent',
  '&:hover': { color: 'primary.main', borderColor: 'primary.main', bgcolor: 'rgba(var(--hanabi-accent-rgb),0.08)' },
  '&.Mui-disabled': { opacity: 0.3, borderColor: 'divider' },
} as const;

export function RailControls({ edges, onNudge, label }: {
  edges: { start: boolean; end: boolean };
  onNudge: (dir: -1 | 1) => void;
  label: string;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 0.75, flexShrink: 0 }}>
      <IconButton aria-label={`Scroll ${label} backwards`} disabled={edges.start} onClick={() => onNudge(-1)} sx={ARROW_SX}>
        <ChevronLeftIcon sx={{ fontSize: 18 }} />
      </IconButton>
      <IconButton aria-label={`Scroll ${label} forwards`} disabled={edges.end} onClick={() => onNudge(1)} sx={ARROW_SX}>
        <ChevronRightIcon sx={{ fontSize: 18 }} />
      </IconButton>
    </Box>
  );
}

export function PosterRail({ title, eyebrow, action, index, size = 'md', children }: {
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
  index?: string;
  size?: 'md' | 'lg';
  children: React.ReactNode;
}) {
  const width = size === 'lg'
    ? { xs: 168, sm: 210, md: 248 }
    : { xs: 140, sm: 162, md: 186 };
  const { ref: railRef, edges, grabbing, handlers, nudge } = useDragRail();

  return (
    <Box component="section" sx={{ mb: { xs: 4, md: 6 } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, mb: 2.5 }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <SectionHeader title={title} eyebrow={eyebrow} action={action} index={index} />
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, mb: 2.5, flexShrink: 0 }}>
          <IconButton aria-label={`Scroll ${title} backwards`} disabled={edges.start} onClick={() => nudge(-1)} sx={ARROW_SX}>
            <ChevronLeftIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <IconButton aria-label={`Scroll ${title} forwards`} disabled={edges.end} onClick={() => nudge(1)} sx={ARROW_SX}>
            <ChevronRightIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </Box>
      <Box
        ref={railRef}
        {...handlers}
        role="group"
        aria-label={title}
        sx={{
          display: 'flex', gap: { xs: 1.5, sm: 2 },
          overflowX: 'auto', overflowY: 'hidden',
          pb: 1.5, mx: { xs: -2, md: 0 }, px: { xs: 2, md: 0 },
          scrollSnapType: grabbing ? 'none' : 'x proximity', scrollBehavior: 'smooth', scrollPaddingLeft: 16,
          overscrollBehaviorX: 'contain',
          cursor: grabbing ? 'grabbing' : 'grab',
          userSelect: grabbing ? 'none' : 'auto',
          '& > *': {
            flex: '0 0 auto',
            width,
            scrollSnapAlign: 'start',
          },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

export function PosterRailSkeleton({ title, count = 6, index }: { title: string; count?: number; index?: string }) {
  return (
    <Box component="section" sx={{ mb: { xs: 4, md: 6 } }} aria-busy="true" aria-label={`Loading ${title}`}>
      <SectionHeader title={title} index={index} />
      <Box sx={{ display: 'flex', gap: { xs: 1.5, sm: 2 }, overflow: 'hidden', mx: { xs: -2, md: 0 }, px: { xs: 2, md: 0 } }}>
        {Array.from({ length: count }, (_, i) => (
          <Skeleton
            key={i}
            variant="rectangular"
            sx={{
              flex: '0 0 auto', width: { xs: 140, sm: 162, md: 186 },
              pt: '150%', height: 'auto', borderRadius: '6px',
            }}
          />
        ))}
      </Box>
    </Box>
  );
}

export function EmptyState({
  title,
  message,
  action,
  icon,
}: {
  title: string;
  message: string;
  action?: { label: string; onClick: () => void };
  icon?: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        position: 'relative', overflow: 'hidden', textAlign: 'center', py: { xs: 5, md: 6 }, px: 3,
        border: '1px solid', borderColor: 'divider', borderRadius: '10px', bgcolor: 'background.paper',
        backgroundImage: 'radial-gradient(620px 220px at 50% 0%, rgba(var(--hanabi-accent-rgb),0.08), transparent 70%)',
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: 'absolute', inset: 0,
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.045) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(420px 190px at 50% 0%, #000 0%, transparent 78%)',
          WebkitMaskImage: 'radial-gradient(420px 190px at 50% 0%, #000 0%, transparent 78%)',
        }}
      />
      <Box sx={{ position: 'relative' }}>
        {icon ?? (
          <Box
            aria-hidden
            sx={{
              width: 44, height: 44, borderRadius: '6px', mx: 'auto', mb: 2,
              display: 'grid', placeItems: 'center',
              border: '1px solid', borderColor: 'primary.main', color: 'primary.main',
              bgcolor: 'rgba(var(--hanabi-accent-rgb),0.08)',
            }}
          >
            <BookmarkBorderIcon sx={{ fontSize: 20 }} />
          </Box>
        )}
        <Typography variant="h5" gutterBottom>{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 440, mx: 'auto', mb: action ? 3 : 0 }}>
          {message}
        </Typography>
        {action && <Button variant="contained" onClick={action.onClick}>{action.label}</Button>}
      </Box>
    </Box>
  );
}
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Box
      role="alert"
      sx={{
        textAlign: 'center', py: 7, px: 3,
        border: '1px solid', borderColor: 'divider', borderRadius: '10px', bgcolor: 'background.paper',
      }}
    >
      <ErrorOutlineIcon color="error" sx={{ mb: 1, fontSize: 30 }} aria-hidden />
      <Typography variant="h6" gutterBottom>Something went wrong</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 440, mx: 'auto', mb: onRetry ? 3 : 0 }}>
        {message}
      </Typography>
      {onRetry && <Button variant="contained" onClick={onRetry}>Try again</Button>}
    </Box>
  );
}
