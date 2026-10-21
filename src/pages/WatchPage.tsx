import { useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { resolvePlayback } from '../providers';
import { playbackRegistry } from '../providers/registry';
import { useAnimeDetail } from '../hooks/useAnimeDetail';
import { EmptyState } from '../components/Rail';
import { VideoPlayer } from '../components/VideoPlayer';
import { useAppData } from '../context/AppDataContext';
import { DUOTONE, EYEBROW, NUMERAL } from '../theme';
import type { PlaybackResolution } from '../providers/types';

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const HEALTH_LABEL: Record<string, string> = {
  idle: 'Ready',
  healthy: 'Healthy',
  degraded: 'Degraded',
  down: 'Down',
  cooldown: 'Cooling down',
};

const HEALTH_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  idle: 'default',
  healthy: 'success',
  degraded: 'warning',
  down: 'error',
  cooldown: 'error',
};

export function WatchPage() {
  const { slug = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { detail, loading, error, reload, isDemoSource } = useAnimeDetail(slug);
  const { getProgressFor, saveWatchProgress } = useAppData();

  const anime = detail?.anime;
  const artwork = anime?.cover ?? anime?.poster ?? '';
  const episodes = useMemo(() => detail?.episodes ?? [], [detail]);

  const episodeNumber = episodes.length ? Math.max(1, Math.min(Number(params.get('ep') ?? '1') || 1, episodes.length)) : 1;
  const episode = episodes.find((e) => e.number === episodeNumber);

  const [resolution, setResolution] = useState<PlaybackResolution | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [failedSources, setFailedSources] = useState<number[]>([]);
  const [userSourceIndex, setUserSourceIndex] = useState<number | null>(null);
  const [sourceMenuAnchor, setSourceMenuAnchor] = useState<HTMLElement | null>(null);
  // Latest playback position, preserved when switching sources.
  const livePositionRef = useRef(0);
  // The episode list can be replaced after mount (the streaming source may know
  // more episodes than the catalogue), which rebuilds the episode objects.
  // Resolution is keyed to the episode identity so that refresh does not trigger
  // a second resolve — the registry rejects duplicate attempts for the same
  // episode and would fall through to the trailer provider.
  const resolvedKeyRef = useRef<string | null>(null);
  /** Incremented per started resolution so stale responses cannot overwrite fresh ones. */
  const resolveSeqRef = useRef(0);

  const savedProgress = episode ? getProgressFor(episode.id) : undefined;
  const resumePosition = savedProgress?.completed ? 0 : savedProgress?.positionSeconds ?? 0;

  useEffect(() => {
    if (!anime || !episode) return;
    const key = `${anime.id}::e${episode.number}`;
    if (resolvedKeyRef.current === key) return;
    resolvedKeyRef.current = key;
    // Staleness is tracked by generation rather than effect cleanup: replacing
    // the episode list must not discard an in-flight resolution for the same
    // episode (that would leave the player empty).
    const seq = ++resolveSeqRef.current;
    setResolving(true);
    setResolution(null);
    setFailedSources([]);
    setUserSourceIndex(null);
    resolvePlayback(anime, episode, detail?.externalLinks ?? [])
      .then(({ resolution: r, providerId: pid }) => {
        if (resolveSeqRef.current !== seq) return;
        setResolution(r);
        setProviderId(pid);
        setResolving(false);
      })
      .catch(() => {
        if (resolveSeqRef.current !== seq) return;
        setResolution({ status: 'unavailable', sources: [], error: 'NO_INAPP_SOURCE' });
        setResolving(false);
      });
  }, [anime, episode, detail?.externalLinks]);

  const sources = resolution?.status === 'ok' ? resolution.sources : [];
  // Smart switching: manual pick wins; otherwise first not-yet-failed source.
  const effectiveIndex = useMemo(() => {
    if (userSourceIndex !== null && !failedSources.includes(userSourceIndex)) return userSourceIndex;
    for (let i = 0; i < sources.length; i++) {
      if (!failedSources.includes(i)) return i;
    }
    return -1;
  }, [sources, failedSources, userSourceIndex]);
  const activeSource = effectiveIndex >= 0 ? sources[effectiveIndex] : null;
  const allSourcesFailed = sources.length > 0 && effectiveIndex === -1;

  const handleSourceFailed = () => {
    if (effectiveIndex < 0) return;
    setFailedSources((prev) => [...new Set([...prev, effectiveIndex])]);
  };

  const handleProgress = (positionSeconds: number, durationSeconds: number) => {
    livePositionRef.current = positionSeconds;
    if (!episode || !anime) return;
    saveWatchProgress({
      animeId: anime.id,
      episodeId: episode.id,
      episodeNumber: episode.number,
      positionSeconds,
      durationSeconds,
      animeTitle: anime.title,
      animePoster: anime.poster,
    });
  };

  const goToEpisode = (n: number) => {
    if (n >= 1 && n <= episodes.length) setParams({ ep: String(n) });
  };

  if (!anime && !loading) {
    return (
      <EmptyState
        title={error ? 'Catalogue unavailable' : 'Anime not found'}
        message={error ? `Could not load this title: ${error}` : "This title doesn't exist in the catalogue."}
        action={{ label: error ? 'Try again' : 'Back to home', onClick: () => (error ? reload() : navigate('/')) }}
      />
    );
  }

  if (loading || !anime || !episode) {
    return (
      <Box>
        <Skeleton variant="text" width={180} sx={{ mb: 2 }} />
        <Box sx={{ display: 'flex', flexDirection: { lg: 'row', xs: 'column' }, gap: 3 }}>
          <Skeleton variant="rectangular" sx={{ flexGrow: 1, aspectRatio: '16 / 9', borderRadius: 0.75, bgcolor: '#1a1a1a' }} />
          <Skeleton variant="rectangular" sx={{ width: { lg: 300, xs: '100%' }, height: 400, borderRadius: 0.75 }} />
        </Box>
      </Box>
    );
  }

  const unavailable = resolution?.status === 'unavailable' ? resolution : null;
  const providerHealth = providerId ? playbackRegistry.getHealth(providerId) : undefined;

  return (
    <Box>
      <Button
        component={RouterLink}
        to={`/anime/${anime.slug}`}
        startIcon={<ArrowBackIcon />}
        sx={{ mb: 2, color: 'text.secondary', fontWeight: 600 }}
      >
        Back to details
      </Button>

      <Box sx={{ display: 'flex', flexDirection: { lg: 'row', xs: 'column' }, gap: 3 }}>
        {/* Player column */}
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          {resolving && (
            <Skeleton variant="rectangular" sx={{ borderRadius: 0.75, aspectRatio: '16 / 9', bgcolor: 'action.hover' }} />
          )}

          {!resolving && unavailable && (
            <Box
              role="alert"
              sx={{
                aspectRatio: '16 / 9', borderRadius: 0.75, bgcolor: '#0C0B0A',
                border: '1px solid', borderColor: 'divider', p: 4,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5,
                textAlign: 'center',
              }}
            >
              <Typography variant="h6" sx={{ color: '#fff' }}>No playable source found</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', maxWidth: 460 }}>
                No in-app source is available for this episode right now. Hanabi only plays sources it is permitted
                to stream — no substitute or unauthorized source is attempted.
              </Typography>
              {unavailable.external && unavailable.external.length > 0 && (
                <>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    Optional alternative — watch on an official platform:
                  </Typography>
                  <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', justifyContent: 'center' }} useFlexGap>
                    {unavailable.external.map((l) => (
                      <Button
                        key={l.url}
                        variant="outlined"
                        size="small"
                        endIcon={<OpenInNewIcon />}
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}
                      >
                        {l.label}
                      </Button>
                    ))}
                  </Stack>
                </>
              )}
            </Box>
          )}

          {!resolving && allSourcesFailed && (
            <Box
              role="alert"
              sx={{
                aspectRatio: '16 / 9', borderRadius: 0.75, bgcolor: '#0C0B0A',
                border: '1px solid', borderColor: 'divider', p: 4,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5,
                textAlign: 'center',
              }}
            >
              <Typography variant="h6" sx={{ color: '#fff' }}>All sources failed</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', maxWidth: 460 }}>
                Every available source for this episode could not be loaded. They may be temporarily offline —
                try again shortly.
              </Typography>
              <Button
                variant="contained"
                onClick={() => { setFailedSources([]); setUserSourceIndex(null); }}
              >
                Retry all sources
              </Button>
            </Box>
          )}

          {!resolving && activeSource && (
            <>
              <VideoPlayer
                key={`${episode.id}-${effectiveIndex}`}
                source={activeSource}
                episodeTitle={`EP ${episode.number} · ${episode.title}`}
                posterUrl={artwork}
                startAt={effectiveIndex === 0 ? resumePosition : livePositionRef.current}
                hasNext={episodeNumber < episodes.length}
                hasPrevious={episodeNumber > 1}
                onNext={episodeNumber < episodes.length ? () => goToEpisode(episodeNumber + 1) : undefined}
                onPrevious={episodeNumber > 1 ? () => goToEpisode(episodeNumber - 1) : undefined}
                onProgress={handleProgress}
                onSourceFailed={handleSourceFailed}
              />
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }} useFlexGap>
                <Typography variant="caption" color="text.secondary">Source:</Typography>
                {sources.length > 1 ? (
                  <Button
                    size="small"
                    variant="outlined"
                    endIcon={<ArrowDropDownIcon />}
                    onClick={(e) => setSourceMenuAnchor(e.currentTarget)}
                    aria-label="Select playback source"
                  >
                    {activeSource.label}
                  </Button>
                ) : (
                  <Chip size="small" label={activeSource.label} variant="outlined" />
                )}
                {failedSources.length > 0 && (
                  <Tooltip title={`${failedSources.length} of ${sources.length} sources failed and were skipped`}>
                    <Chip size="small" label={`${failedSources.length} failed`} color="warning" variant="outlined" />
                  </Tooltip>
                )}
                {providerHealth && (
                  <Tooltip title={`Provider: ${providerId ?? ''} · ${HEALTH_LABEL[providerHealth.status] ?? providerHealth.status}`}>
                    <Chip
                      size="small"
                      label={HEALTH_LABEL[providerHealth.status] ?? providerHealth.status}
                      color={HEALTH_COLOR[providerHealth.status] ?? 'default'}
                      variant="outlined"
                    />
                  </Tooltip>
                )}
              </Stack>
              <Menu
                open={Boolean(sourceMenuAnchor)}
                anchorEl={sourceMenuAnchor}
                onClose={() => setSourceMenuAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              >
                {sources.map((s, i) => (
                  <MenuItem
                    key={s.url}
                    disabled={failedSources.includes(i)}
                    selected={i === effectiveIndex}
                    onClick={() => { setUserSourceIndex(i); setSourceMenuAnchor(null); }}
                  >
                    {s.label}
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}

          {episode && (
            <Box sx={{ mt: 2.5 }}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap' }} useFlexGap>
                <Typography variant="h5" component="h1">
                  EP {episode.number} · {episode.title}
                </Typography>
                {activeSource?.surrogate && (
                  <Chip size="small" label="Surrogate playback" sx={{ bgcolor: 'action.selected' }} />
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 720 }}>
                {episode.synopsis}
              </Typography>
              {savedProgress && !savedProgress.completed && savedProgress.positionSeconds > 5 && (
                <Alert severity="info" sx={{ mt: 2 }} icon={false}>
                  Resumed at {formatTime(resumePosition)} — playback continues where you left off.
                </Alert>
              )}
              <Stack direction="row" spacing={1.5} sx={{ mt: 2.5 }}>
                <Button variant="outlined" disabled={episodeNumber <= 1} onClick={() => goToEpisode(episodeNumber - 1)}>
                  Previous
                </Button>
                <Button
                  variant="contained"
                  disabled={episodeNumber >= episodes.length}
                  endIcon={<NavigateNextIcon />}
                  onClick={() => goToEpisode(episodeNumber + 1)}
                >
                  Next episode
                </Button>
              </Stack>
            </Box>
          )}
        </Box>

        {/* Episode playlist */}
        <Box
          sx={{
            width: { lg: 320, xs: '100%' }, flexShrink: 0,
            border: '1px solid', borderColor: 'divider', borderRadius: 1,
            bgcolor: 'background.paper', alignSelf: 'flex-start',
            maxHeight: { lg: 640 }, overflowY: 'auto',
          }}
          aria-label="Episode selector"
        >
          <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 1 }}>
            <Typography sx={{ ...EYEBROW, color: 'text.secondary' }}>
              Episode guide
            </Typography>
            <Typography sx={{ ...NUMERAL, fontSize: '0.8rem', color: 'text.primary', mt: 0.25 }}>
              {episodes.length} <Box component="span" sx={{ color: 'text.secondary' }}>frames</Box>
            </Typography>
          </Box>
          <Stack divider={<Divider flexItem />} sx={{ px: 0.75, py: 0.5 }}>
            {episodes.map((e) => {
              const p = getProgressFor(e.id);
              const isCurrent = e.number === episodeNumber;
              const percent = p && p.durationSeconds > 0
                ? Math.min(100, (p.positionSeconds / p.durationSeconds) * 100)
                : 0;
              return (
                <Button
                  key={e.id}
                  onClick={() => goToEpisode(e.number)}
                  aria-current={isCurrent ? 'true' : undefined}
                  sx={{
                    justifyContent: 'flex-start', textAlign: 'left', py: 1, px: 1.25, gap: 1.5,
                    borderRadius: 0.75, color: 'text.primary', textTransform: 'none',
                    borderLeft: '3px solid',
                    borderLeftColor: isCurrent ? 'primary.main' : 'transparent',
                    bgcolor: isCurrent ? 'rgba(var(--hanabi-accent-rgb),0.1)' : 'transparent',
                    '&:hover': { bgcolor: isCurrent ? 'rgba(var(--hanabi-accent-rgb),0.16)' : 'action.hover' },
                    '&:hover .ep-mini': { filter: 'grayscale(0) contrast(1.02) brightness(1)' },
                    '&:hover .ep-mini-tint': { opacity: 0.18 },
                  }}
                >
                  <Box
                    sx={{
                      position: 'relative', width: 76, flexShrink: 0, aspectRatio: '16 / 9',
                      borderRadius: 0.75, overflow: 'hidden', bgcolor: 'action.hover',
                    }}
                  >
                    <Box
                      component="img"
                      className="ep-mini"
                      src={artwork}
                      alt=""
                      loading="lazy"
                      sx={{
                        position: 'absolute', inset: 0, width: '100%', height: '100%',
                        objectFit: 'cover', filter: DUOTONE,
                        transition: 'filter .4s ease',
                      }}
                    />
                    <Box
                      className="ep-mini-tint"
                      aria-hidden
                      sx={{
                        position: 'absolute', inset: 0, mixBlendMode: 'color',
                        background: 'linear-gradient(150deg, rgba(var(--hanabi-accent-rgb),0.85), rgba(var(--hanabi-accent-rgb),0.22))',
                        transition: 'opacity .35s ease',
                      }}
                    />
                    <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.28)' }} />
                    {isCurrent && (
                      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(0,0,0,0.55)' }}>
                        <PlayArrowIcon sx={{ color: '#fff', fontSize: 20 }} />
                      </Box>
                    )}
                    <Typography
                      aria-hidden
                      sx={{
                        ...NUMERAL, position: 'absolute', right: 4, bottom: 0, color: 'rgba(255,255,255,0.5)',
                        fontSize: '1.15rem', lineHeight: 1.25,
                      }}
                    >
                      {String(e.number).padStart(2, '0')}
                    </Typography>
                  </Box>
                  <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography
                      variant="subtitle2"
                      noWrap
                      sx={{ color: isCurrent ? 'primary.main' : 'text.primary', fontWeight: isCurrent ? 700 : 500 }}
                    >
                      {e.title}
                    </Typography>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }}>
                      <Typography sx={{ ...EYEBROW, color: 'text.secondary' }} noWrap>
                        EP {String(e.number).padStart(2, '0')}
                      </Typography>
                      {(p?.completed || p) && (
                        <Typography
                          sx={{ ...EYEBROW, color: p?.completed ? 'success.main' : 'primary.main' }}
                          noWrap
                        >
                          {p?.completed ? 'Watched' : 'In progress'}
                        </Typography>
                      )}
                    </Stack>
                    {percent > 0 && !p?.completed && (
                      <Box sx={{ mt: 0.75, height: 3, borderRadius: 3, bgcolor: 'action.disabledBackground', overflow: 'hidden' }}>
                        <Box sx={{ width: `${percent}%`, height: '100%', bgcolor: 'primary.main' }} />
                      </Box>
                    )}
                  </Box>
                </Button>
              );
            })}
          </Stack>
        </Box>
      </Box>
      {isDemoSource && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          Offline demo catalogue entry.
        </Typography>
      )}
    </Box>
  );
}
