import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import LinearProgress from '@mui/material/LinearProgress';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import OndemandVideoIcon from '@mui/icons-material/OndemandVideo';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import HistoryIcon from '@mui/icons-material/History';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { getEpisodesForAnime } from '../data/catalogue';
import { EmptyState } from '../components/Rail';
import { useAppData } from '../context/AppDataContext';
import { EYEBROW, NUMERAL } from '../theme';
import type { LibraryEntry, ListStatus, WatchProgress } from '../types';

function formatWhen(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function ProgressRow({ p }: { p: WatchProgress }) {
  const navigate = useNavigate();
  const fallback = p.animeTitle ? { title: p.animeTitle, poster: p.animePoster ?? '' } : null;
  if (!fallback) return null;
  const pct = p.durationSeconds > 0 ? Math.min(100, (p.positionSeconds / p.durationSeconds) * 100) : 0;
  const ep = getEpisodesForAnime(p.animeId).find((e) => e.number === p.episodeNumber);
  const mins = Math.floor(p.positionSeconds / 60);
  return (
    <Box
      component="button"
      onClick={() => navigate(`/watch/${p.animeId}?ep=${p.episodeNumber}`)}
      sx={{
        display: 'grid', gridTemplateColumns: { xs: '104px minmax(0,1fr)', sm: '148px minmax(0,1fr) auto' },
        gap: { xs: 1.5, sm: 2 }, alignItems: 'center', width: '100%', textAlign: 'left',
        p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: '8px', cursor: 'pointer',
        bgcolor: 'background.paper', color: 'text.primary',
        transition: 'border-color .2s ease, background-color .2s ease, transform .2s ease',
        '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover', transform: 'translateY(-1px)' },
        '&:hover .lib-thumb': { transform: 'scale(1.06)' },
        '&:hover .lib-play': { opacity: 1, transform: 'translateY(0)' },
        '&:hover .lib-title': { color: 'primary.main' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      <Box
        sx={{
          position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: '6px',
          overflow: 'hidden', bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider',
        }}
      >
        <Box
          className="lib-thumb"
          component="img"
          src={fallback.poster}
          alt=""
          loading="lazy"
          sx={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            transition: 'transform .55s cubic-bezier(0.22,1,0.36,1)',
          }}
        />
        <Box
          aria-hidden
          sx={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(0,0,0,0) 42%, rgba(0,0,0,0.66) 100%)',
          }}
        />
        <Box
          className="lib-play"
          aria-hidden
          sx={{
            position: 'absolute', right: 7, bottom: 7, width: 26, height: 26, borderRadius: '4px',
            bgcolor: 'primary.main', color: 'primary.contrastText', display: 'grid', placeItems: 'center',
            opacity: 0, transform: 'translateY(4px)', transition: 'opacity .2s ease, transform .2s ease',
          }}
        >
          <PlayArrowIcon sx={{ fontSize: 16 }} />
        </Box>
        <Box aria-hidden sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, bgcolor: 'rgba(255,255,255,0.16)' }}>
          <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: p.completed ? 'success.main' : 'primary.main' }} />
        </Box>
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Typography className="lib-title" noWrap sx={{ fontWeight: 600, fontSize: { xs: '0.85rem', sm: '0.92rem' }, transition: 'color .2s ease' }}>
          {fallback.title}
        </Typography>
        <Typography noWrap sx={{ ...EYEBROW, color: 'text.secondary', mt: 0.7, fontSize: '0.55rem' }}>
          EP {p.episodeNumber}{ep ? ` · ${ep.title}` : ''}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
          <Typography sx={{ ...NUMERAL, fontSize: '0.7rem', color: p.completed ? 'success.main' : 'primary.main' }}>
            {p.completed ? 'FINISHED' : `${Math.round(pct)}%`}
          </Typography>
          <Box aria-hidden sx={{ width: 2, height: 2, bgcolor: 'divider' }} />
          <Typography sx={{ ...EYEBROW, fontSize: '0.55rem', color: 'text.secondary' }}>
            {mins} min in
          </Typography>
        </Stack>
      </Box>

      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ display: { xs: 'none', sm: 'flex' }, pr: 0.5 }}>
        <Typography sx={{ ...EYEBROW, fontSize: '0.55rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
          {formatWhen(p.updatedAt)}
        </Typography>
        <ArrowForwardIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
      </Stack>
    </Box>
  );
}
const TABS = [
  { value: 'watching', label: 'Watching', icon: OndemandVideoIcon },
  { value: 'planned', label: 'Plan to watch', icon: BookmarkBorderIcon },
  { value: 'completed', label: 'Completed', icon: TaskAltIcon },
  { value: 'history', label: 'History', icon: HistoryIcon },
] as const;

type TabValue = (typeof TABS)[number]['value'];

function LibraryCard({ entry, progress }: { entry: LibraryEntry; progress?: number }) {
  if (!entry.animeTitleFallback) return null;
  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: (t) => t.transitions.create(['transform', 'border-color', 'box-shadow'], { duration: 200 }),
        '&:hover': {
          transform: 'translateY(-4px)', borderColor: 'primary.main',
          boxShadow: '0 22px 42px -26px rgba(var(--hanabi-accent-rgb),0.65)',
        },
        '&:hover .lib-poster': { transform: 'scale(1.05)' },
        '&:hover .lib-name': { color: 'primary.main' },
      }}
    >
      <CardActionArea
        component={RouterLink}
        to={`/anime/${entry.animeId}`}
        sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', height: '100%' }}
        aria-label={`${entry.animeTitleFallback} details`}
      >
        <Box sx={{ position: 'relative', pt: '150%', overflow: 'hidden', bgcolor: 'action.hover' }}>
          <Box
            className="lib-poster"
            component="img"
            src={entry.animePosterFallback}
            alt=""
            loading="lazy"
            sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform .55s cubic-bezier(0.22,1,0.36,1)' }}
          />
          {progress !== undefined && progress > 0 && (
            <LinearProgress
              variant="determinate"
              value={Math.min(progress, 100)}
              sx={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: 4,
                bgcolor: 'rgba(9,9,9,0.5)', '& .MuiLinearProgress-bar': { bgcolor: 'primary.main' },
              }}
            />
          )}
        </Box>
        <Box sx={{ p: 1.5, flexGrow: 1 }}>
          <Typography className="lib-name" variant="subtitle2" noWrap title={entry.animeTitleFallback} sx={{ transition: 'color .2s ease' }}>{entry.animeTitleFallback}</Typography>
        </Box>
      </CardActionArea>
    </Card>
  );
}

export function LibraryPage() {
  const [tab, setTab] = useState<TabValue>('watching');
  const { library, progress } = useAppData();

  const byStatus = useMemo(() => {
    const map: Record<ListStatus, LibraryEntry[]> = { watching: [], planned: [], completed: [] };
    for (const entry of library) map[entry.status].push(entry);
    return map;
  }, [library]);

  const history = useMemo(
    () => [...progress].sort((a, b) => b.updatedAt - a.updatedAt),
    [progress],
  );

  const gridSx = {
    display: 'grid', gap: { xs: 1.5, sm: 2 },
    gridTemplateColumns: {
      xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)', lg: 'repeat(6, 1fr)',
    },
  } as const;

  const currentEntries = tab === 'history' ? [] : byStatus[tab as ListStatus];

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3.5 }}>
        <Box
          aria-hidden
          sx={{ width: 3, height: 26, borderRadius: '1px', background: 'linear-gradient(180deg, rgba(var(--hanabi-accent-rgb),1), rgba(var(--hanabi-accent-rgb),0.4))' }}
        />
        <Box>
          <Typography sx={{ fontSize: '0.6rem', letterSpacing: '0.3em', color: 'text.secondary', mb: 0.35, fontWeight: 600 }}>
            YOUR COLLECTION
          </Typography>
          <Typography variant="h4">My library</Typography>
        </Box>
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v: TabValue) => setTab(v)}
        sx={{
          mb: 3, borderBottom: '1px solid', borderColor: 'divider',
          '& .MuiTab-root': { fontWeight: 600, transition: 'color .18s ease' },
          '& .MuiTab-root:hover': { color: 'primary.main' },
        }}
      >
        {TABS.map((t) => (
          <Tab
            key={t.value}
            value={t.value}
            icon={<t.icon fontSize="small" />}
            iconPosition="start"
            label={t.value === 'history' ? `History (${history.length})` : `${t.label} (${byStatus[t.value as ListStatus].length})`}
          />
        ))}
      </Tabs>

      {tab === 'history' ? (
        history.length > 0 ? (
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            {history.map((p) => <ProgressRow key={p.episodeId} p={p} />)}
          </Box>
        ) : (
          <EmptyState
            title="Nothing watched yet"
            message="Episodes you start will show up here with your progress."
            action={{ label: 'Browse the catalogue', onClick: () => setTab('watching') }}
          />
        )
      ) : currentEntries.length > 0 ? (
        <Box sx={gridSx}>
          {currentEntries.map((entry) => {
            const p = history.find((x) => x.animeId === entry.animeId);
            return (
              <LibraryCard
                key={entry.animeId}
                entry={entry}
                progress={p && p.durationSeconds > 0 ? (p.positionSeconds / p.durationSeconds) * 100 : undefined}
              />
            );
          })}
        </Box>
      ) : (
        <EmptyState
          title={`Your ${TABS.find((t) => t.value === tab)?.label.toLowerCase()} list is empty`}
          message="Add titles from any anime page to keep track of what you want to watch."
          action={{ label: 'Explore anime', onClick: () => setTab('watching') }}
        />
      )}
    </Box>
  );
}
