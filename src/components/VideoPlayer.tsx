import { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import TuneIcon from '@mui/icons-material/Tune';
import ClosedCaptionIcon from '@mui/icons-material/ClosedCaption';
import ClosedCaptionOffIcon from '@mui/icons-material/ClosedCaptionOff';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Hls from 'hls.js';
import type { PlaybackSource } from '../types';
import { NUMERAL, PLAYER_SURFACE } from '../theme';

function formatTime(s: number): string {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

interface Props {
  source: PlaybackSource;
  episodeTitle: string;
  /** Artwork shown behind/around the video so the frame is never an empty void. */
  posterUrl?: string;
  startAt?: number;
  hasNext?: boolean;
  hasPrevious?: boolean;
  onNext?: () => void;
  onPrevious?: () => void;
  onProgress?: (positionSeconds: number, durationSeconds: number) => void;
  /** Called when the source cannot load — parent can switch to the next source. */
  onSourceFailed?: () => void;
}

export function VideoPlayer({
  source, episodeTitle, posterUrl, startAt = 0, hasNext, hasPrevious, onNext, onPrevious, onProgress, onSourceFailed,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const lastSaved = useRef(0);
  const hlsRef = useRef<Hls | null>(null);
  // Latest-callback ref: keeps the media-attach effect free of identity churn.
  const onSourceFailedRef = useRef<(() => void) | undefined>(onSourceFailed);
  onSourceFailedRef.current = onSourceFailed;
  // Guard so one broken source reports failure exactly once.
  const reportedFailure = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const lastVolumeRef = useRef(1);

  const toggleMute = useCallback(() => {
    if (!muted && volume === 0) return;
    if (muted && volume === 0) {
      const restore = lastVolumeRef.current || 1;
      setVolume(restore);
      setMuted(false);
      const el = videoRef.current;
      if (el) { el.volume = restore; el.muted = false; }
      return;
    }
    setMuted((m) => !m);
  }, [muted, volume]);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState<HTMLButtonElement | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [waiting, setWaiting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!videoRef.current?.paused) setControlsVisible(false);
    }, 2800);
  }, []);

  // Remember subtitle preference across episodes and page reloads.
  useEffect(() => {
    const saved = localStorage.getItem('anistream:subs-pref');
    if (saved === 'on' || saved === 'off') setCaptionsOn(saved === 'on');
  }, []);

  const persistSubsPref = useCallback((on: boolean) => {
    localStorage.setItem('anistream:subs-pref', on ? 'on' : 'off');
  }, []);

  // Reset per-source state when the source changes.
  useEffect(() => {
    setError(null);
    setWaiting(false);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    reportedFailure.current = false;
  }, [source.url]);

  // Apply the stored subtitle preference once tracks are available.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !captionsOn) return;
    const track = v.textTracks[0];
    if (track && track.mode === 'disabled') track.mode = 'showing';
  }, [captionsOn, source.url]);

  // Attach media: direct src for mp4, hls.js for HLS with native fallback.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || source.kind === 'embed') return;
    setError(null);
    reportedFailure.current = false;

    const fail = (message: string) => {
      if (reportedFailure.current) return;
      reportedFailure.current = true;
      setError(message);
      onSourceFailedRef.current?.();
    };

    if (source.kind === 'hls') {
      if (v.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari / webOS: native HLS.
        v.src = source.url;
      } else if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.loadSource(source.url);
        hls.attachMedia(v);
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && data.details !== Hls.ErrorDetails.MANIFEST_LOAD_ERROR) {
            hls.startLoad();
            return;
          }
          fail('This video stream could not be loaded.');
        });
      } else {
        fail('Your browser does not support this stream format.');
      }
    } else {
      v.src = source.url;
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      v.removeAttribute('src');
      v.load();
    };
  }, [source.kind, source.url]);

  // Fullscreen state listener (player may be exited via Esc).
  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => setError('Playback could not be started. Try again.'));
    else v.pause();
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => {});
  }, []);

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.min(Math.max(0, v.currentTime + delta), v.duration);
    showControls();
  }, [showControls]);

  const handleLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    if (startAt > 0 && startAt < v.duration - 5) v.currentTime = startAt;
  }, [startAt]);

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setCurrent(v.currentTime);
    const now = Date.now();
    if (now - lastSaved.current > 5000 && onProgress) {
      lastSaved.current = now;
      onProgress(v.currentTime, v.duration || 0);
    }
  }, [onProgress]);

  const handleEnded = useCallback(() => {
    setPlaying(false);
    if (onProgress) onProgress(videoRef.current?.duration ?? 0, videoRef.current?.duration ?? 0);
    if (hasNext) onNext?.();
  }, [hasNext, onNext, onProgress]);

  const toggleCaptions = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const track = v.textTracks[0];
    if (!track) return;
    const next = !captionsOn;
    track.mode = next ? 'showing' : 'hidden';
    setCaptionsOn(next);
    persistSubsPref(next);
  }, [captionsOn, persistSubsPref]);

  // Keyboard controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); togglePlay(); break;
        case 'ArrowRight': e.preventDefault(); seekBy(5); break;
        case 'ArrowLeft': e.preventDefault(); seekBy(-5); break;
        case 'j': seekBy(-10); break;
        case 'l': seekBy(10); break;
        case 'm': toggleMute(); break;
        case 'f': e.preventDefault(); toggleFullscreen(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlay, seekBy, toggleFullscreen, toggleMute]);

  // Element gain derives from volume alone; 0 is silent, mute is a separate toggle.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted || volume === 0;
  }, [volume, muted, source.url]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  const progressPercent = duration > 0 ? (current / duration) * 100 : 0;
  const hasCaptions = (source.subtitleTracks?.length ?? 0) > 0;

  const glassIconSx = {
    width: 30, height: 30, borderRadius: '4px',
    color: 'rgba(255,255,255,0.82)',
    '&:hover': { bgcolor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,1)' },
    '&.Mui-disabled': { color: 'rgba(255,255,255,0.24)' },
  } as const;

  return (
    <Box
      ref={containerRef}
      onMouseMove={showControls}
      onMouseLeave={() => {
        if (!videoRef.current?.paused) setControlsVisible(false);
      }}
      sx={{
        position: 'relative', width: '100%', bgcolor: PLAYER_SURFACE,
        borderRadius: '6px', overflow: 'hidden', aspectRatio: '16 / 9',
        border: '1px solid rgba(255,255,255,0.09)',
        cursor: controlsVisible ? 'default' : 'none',
        '&:fullscreen': { borderRadius: 0, border: 0 },
      }}
    >
      {/* Blurred artwork behind the frame: fills letterbox bars, kills the void. */}
      {posterUrl && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute', inset: 0, backgroundImage: `url("${posterUrl}")`,
            backgroundSize: 'cover', backgroundPosition: 'center',
            filter: 'blur(34px) brightness(0.42) saturate(1.15)', transform: 'scale(1.25)',
            opacity: playing ? 0.5 : 0.85, transition: 'opacity .6s ease',
            pointerEvents: 'none', zIndex: 0,
          }}
        />
      )}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- caption availability depends on source; toggle shown when tracks exist */}
      <video
        ref={videoRef}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', position: 'relative', zIndex: 1 }}
        preload="metadata"
        playsInline
        onClick={togglePlay}
        onPlay={() => { setPlaying(true); showControls(); }}
        onPause={() => { setPlaying(false); setControlsVisible(true); }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={() => {
          if (reportedFailure.current) return;
          reportedFailure.current = true;
          setError('This video source could not be loaded.');
          onSourceFailedRef.current?.();
        }}
      >
        {source.subtitleTracks?.map((t) => (
          <track key={t.lang} kind="subtitles" src={t.url} srcLang={t.lang} label={t.label} />
        ))}
      </video>

      {/* Episode label + buffering, top-left */}
      <Box
        sx={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, p: { xs: 1.5, sm: 2 },
          display: 'flex', alignItems: 'center', gap: 1, pointerEvents: 'none',
          opacity: controlsVisible ? 1 : 0, transition: 'opacity .2s ease',
        }}
      >
        <Typography
          noWrap
          sx={{
            color: 'rgba(255,255,255,0.92)', fontSize: '0.8rem', fontWeight: 600,
            letterSpacing: '0.01em', textShadow: '0 1px 14px rgba(0,0,0,0.75)',
          }}
        >
          {episodeTitle}
        </Typography>
        {waiting && !error && (
          <Box
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.35, borderRadius: '4px',
              bgcolor: 'rgba(12,12,16,0.5)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <CircularProgress size={11} thickness={5} sx={{ color: 'rgba(255,255,255,0.8)' }} />
            <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.62rem', letterSpacing: '0.04em' }}>
              Buffering
            </Typography>
          </Box>
        )}
      </Box>

      {error && (
        <Box role="alert" sx={{ position: 'absolute', inset: 0, zIndex: 3, display: 'grid', placeItems: 'center', p: 2 }}>
          <Box
            sx={{
              textAlign: 'center', maxWidth: 400, p: 3, borderRadius: '6px',
              bgcolor: 'rgba(10,10,13,0.72)', backdropFilter: 'blur(18px) saturate(140%)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#fff' }}>Source failed</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)', mt: 0.5 }}>{error}</Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', display: 'block', mt: 1 }}>
              Switching to the next available source…
            </Typography>
          </Box>
        </Box>
      )}

      {!playing && !error && (
        <Box
          component="button"
          onClick={togglePlay}
          aria-label="Play"
          sx={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 2,
            width: 74, height: 74, borderRadius: '6px', p: 0, cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.25,
            color: 'primary.contrastText', bgcolor: 'primary.main',
            border: '1px solid rgba(255,248,240,0.28)',
            boxShadow: '0 18px 40px -20px rgba(0,0,0,0.95), inset 0 1px 0 0 rgba(255,248,240,0.28)',
            transition: 'background-color .18s ease, transform .18s ease',
            '&:hover': { bgcolor: 'primary.light', transform: 'translate(-50%, -50%) scale(1.03)' },
          }}
        >
          <PlayArrowIcon sx={{ fontSize: 26 }} />
          <Typography sx={{ fontSize: '0.5rem', letterSpacing: '0.22em', fontWeight: 700, lineHeight: 1 }}>
            PLAY
          </Typography>
        </Box>
      )}

      <Box
        sx={{
          position: 'absolute', left: { xs: 8, sm: 12 }, right: { xs: 8, sm: 12 }, bottom: { xs: 8, sm: 12 }, zIndex: 2,
          px: { xs: 1, sm: 1.25 }, py: { xs: 0.5, sm: 0.75 },
          borderRadius: '6px',
          bgcolor: 'rgba(10,9,8,0.74)',
          backdropFilter: 'blur(18px) saturate(140%)',
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow: '0 16px 40px -24px rgba(0,0,0,0.95), inset 0 1px 0 0 rgba(255,248,240,0.06)',
          opacity: controlsVisible ? 1 : 0,
          transform: controlsVisible ? 'translateY(0)' : 'translateY(8px)',
          pointerEvents: controlsVisible ? 'auto' : 'none',
          transition: 'opacity .2s ease, transform .2s ease',
        }}
      >
        <Slider
          size="small"
          value={progressPercent}
          onChange={(_, val) => {
            const v = videoRef.current;
            if (v && Number.isFinite(v.duration)) v.currentTime = ((val as number) / 100) * v.duration;
          }}
          aria-label="Seek"
          sx={{
            display: 'block', py: 0.75, mb: 0.25, color: 'primary.main',
            '& .MuiSlider-rail': { opacity: 1, height: 3, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.24)' },
            '& .MuiSlider-track': { border: 0, height: 3, borderRadius: 1, bgcolor: 'primary.main' },
            '& .MuiSlider-thumb': {
              width: 4, height: 14, borderRadius: '1px', bgcolor: 'primary.main', opacity: 0, boxShadow: 'none',
              transition: 'opacity .15s ease',
              '&::before': { display: 'none' },
              '&:hover, &.Mui-active, &.Mui-focusVisible': { opacity: 1 },
            },
            '&:hover .MuiSlider-thumb': { opacity: 1 },
          }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton size="small" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} sx={glassIconSx}>
            {playing ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
          </IconButton>
          {onPrevious && (
            <IconButton
              size="small"
              onClick={onPrevious}
              disabled={!hasPrevious}
              aria-label="Previous episode"
              sx={glassIconSx}
            >
              <SkipPreviousIcon fontSize="small" />
            </IconButton>
          )}
          {onNext && (
            <IconButton size="small" onClick={onNext} disabled={!hasNext} aria-label="Next episode" sx={glassIconSx}>
              <SkipNextIcon fontSize="small" />
            </IconButton>
          )}
          <IconButton
            size="small"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            sx={glassIconSx}
          >
            {muted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
          </IconButton>
          <Slider
            size="small"
            value={muted ? 0 : volume}
            onChange={(_, val) => {
              const v = Math.round(Number(val) * 100) / 100;
              if (v > 0) lastVolumeRef.current = v;
              setVolume(v);
              setMuted(v === 0);
              const el = videoRef.current;
              if (el) { el.volume = v; el.muted = v === 0; }
            }}
            aria-label="Volume"
            min={0}
            max={1}
            step={0.02}
            sx={{
              width: 74, ml: 0.5, color: '#fff', display: { xs: 'none', sm: 'block' },
              '& .MuiSlider-rail': { opacity: 1, height: 3, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.2)' },
              '& .MuiSlider-track': { border: 0, height: 3, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.9)' },
              '& .MuiSlider-thumb': {
                width: 10, height: 10, bgcolor: '#fff', boxShadow: 'none',
                '&::before': { display: 'none' },
                '&:hover, &.Mui-active, &.Mui-focusVisible': { boxShadow: '0 0 0 4px rgba(255,255,255,0.12)' },
              },
            }}
          />
          <Typography
            sx={{
              color: 'rgba(255,255,255,0.7)', fontSize: '0.66rem', ml: 1.25, fontFamily: NUMERAL.fontFamily,
              letterSpacing: '0.06em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
            }}
          >
            {formatTime(current)} / {formatTime(duration)}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          {hasCaptions && (
            <IconButton
              size="small"
              onClick={toggleCaptions}
              aria-label={captionsOn ? 'Hide subtitles' : 'Show subtitles'}
              aria-pressed={captionsOn}
              sx={glassIconSx}
            >
              {captionsOn ? <ClosedCaptionIcon fontSize="small" /> : <ClosedCaptionOffIcon fontSize="small" />}
            </IconButton>
          )}
          <IconButton
            size="small"
            onClick={(e) => setSettingsMenuOpen(e.currentTarget)}
            aria-label="Playback settings"
            aria-haspopup="menu"
            sx={glassIconSx}
          >
            <TuneIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            sx={glassIconSx}
          >
            {isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
          </IconButton>
        </Box>
      </Box>

      <Menu
        open={Boolean(settingsMenuOpen)}
        anchorEl={settingsMenuOpen}
        onClose={() => setSettingsMenuOpen(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              minWidth: 196, borderRadius: '6px', backgroundImage: 'none',
              bgcolor: 'rgba(20,20,26,0.94)', backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.12)',
            },
          },
        }}
      >
        {hasCaptions && (
          <MenuItem
            onClick={() => { toggleCaptions(); setSettingsMenuOpen(null); }}
            selected={captionsOn}
            sx={{ fontSize: '0.85rem' }}
          >
            Subtitles: {captionsOn ? 'On' : 'Off'}
          </MenuItem>
        )}
        {hasCaptions && <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 0.5 }} />}
        <Typography
          sx={{
            px: 2, pt: 0.5, pb: 0.5, fontSize: '0.58rem', letterSpacing: '0.18em',
            color: 'rgba(255,255,255,0.45)', fontWeight: 600,
          }}
        >
          SPEED
        </Typography>
        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
          <MenuItem
            key={rate}
            selected={rate === playbackRate}
            onClick={() => { setPlaybackRate(rate); setSettingsMenuOpen(null); }}
            sx={{ fontSize: '0.85rem' }}
          >
            {rate === 1 ? 'Normal' : `${rate}×`}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}
