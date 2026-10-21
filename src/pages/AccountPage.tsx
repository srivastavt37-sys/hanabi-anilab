import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { useThemeMode } from '../context/ThemeModeContext';
import { isCloudEnabled } from '../lib/supabase';
import { ANIME_LIST } from '../data/catalogue';
import { GENRE_LABELS_BY_ID } from '../data/genreLabels';
import { PosterCard } from '../components/PosterCard';
import { EYEBROW, NUMERAL } from '../theme';

function AccountHeading() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3.5 }}>
      <Box
        aria-hidden
        sx={{ width: 3, height: 26, borderRadius: '1px', background: 'linear-gradient(180deg, rgba(var(--hanabi-accent-rgb),1), rgba(var(--hanabi-accent-rgb),0.4))' }}
      />
      <Box>
        <Typography sx={{ fontSize: '0.6rem', letterSpacing: '0.3em', color: 'text.secondary', mb: 0.35, fontWeight: 600 }}>
          YOUR PROFILE
        </Typography>
        <Typography variant="h4">Account</Typography>
      </Box>
    </Box>
  );
}

function Panel({ title, action, children, sx }: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  sx?: Record<string, unknown>;
}) {
  return (
    <Box
      sx={{
        p: 2, border: '1px solid', borderColor: 'divider', borderRadius: '8px',
        bgcolor: 'background.paper', ...sx,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography sx={{ ...EYEBROW, color: 'text.secondary' }}>{title}</Typography>
        {action}
      </Box>
      {children}
    </Box>
  );
}

function formatWhen(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function SignInForm({ cloudEnabled }: { cloudEnabled: boolean }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) return setError('Enter a valid email address.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (mode === 'signup' && name.trim().length < 2) return setError('Enter your name.');
    setError(null);
    setBusy(true);
    const result = mode === 'signup' ? await signUp(email, password, name.trim()) : await signIn(email, password);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if ('needsConfirmation' in result && result.needsConfirmation) {
      setNotice('Account created. You can sign in now.');
      setMode('signin');
    }
  };

  return (
    <Box component="form" onSubmit={submit} sx={{ maxWidth: 380 }}>
      <Typography variant="h5" sx={{ mb: 0.5 }}>
        {mode === 'signin' ? 'Welcome back' : 'Create your account'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {mode === 'signin'
          ? 'Sign in to sync your library and watch progress.'
          : 'Keep your watchlist and progress across devices.'}
      </Typography>

      {mode === 'signup' && (
        <TextField
          label="Display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth size="small" sx={{ mb: 2 }}
        />
      )}
      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        fullWidth size="small" sx={{ mb: 2 }}
        autoComplete="email"
      />
      <TextField
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        fullWidth size="small" sx={{ mb: 2 }}
        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}
      {!cloudEnabled && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Cloud sync is not configured in this environment — data stays on this device.
        </Alert>
      )}

      <Button type="submit" variant="contained" fullWidth size="large" disabled={busy} sx={{ mb: 2 }}>
        {busy ? <CircularProgress size={22} color="inherit" /> : mode === 'signin' ? 'Sign in' : 'Create account'}
      </Button>
      <Button
        fullWidth
        onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setNotice(null); }}
        sx={{ color: 'text.secondary' }}
      >
        {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
      </Button>
    </Box>
  );
}

export function AccountPage() {
  const { mode, toggle } = useThemeMode();
  const { user, signOut } = useAuth();
  const { library, progress, syncing, lastSyncedAt } = useAppData();
  const navigate = useNavigate();

  const signedIn = Boolean(user);
  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Viewer';

  const stats = useMemo(() => {
    const minutes = Math.round(progress.reduce((acc, p) => acc + p.positionSeconds, 0) / 60);
    const finished = progress.filter((p) => p.completed).length;
    const inProgress = new Set(progress.filter((p) => !p.completed).map((p) => p.animeId)).size;
    return [
      { label: 'Titles in library', value: library.length },
      { label: 'Titles in progress', value: inProgress },
      { label: 'Episodes finished', value: finished },
      { label: 'Minutes watched', value: minutes },
    ];
  }, [library.length, progress]);

  const topGenres = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of library) {
      const anime = ANIME_LIST.find((a) => a.id === entry.animeId || a.slug === entry.animeId);
      for (const g of anime?.genres ?? []) counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [library]);

  const recent = useMemo(
    () => [...progress].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6),
    [progress],
  );

  const genreMax = topGenres[0]?.[1] ?? 1;

  if (!signedIn) {
    return (
      <Box sx={{ maxWidth: 1040 }}>
        <AccountHeading />
        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'minmax(0,460px) minmax(0,1fr)' }, alignItems: 'start' }}>
          <Box
            sx={{
              p: { xs: 2.5, sm: 3.5 }, borderRadius: '8px',
              bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
              background: 'radial-gradient(420px 180px at 100% 0%, rgba(var(--hanabi-accent-rgb),0.07), transparent 70%)',
            }}
          >
            <SignInForm cloudEnabled={isCloudEnabled} />
          </Box>

          <Box
            sx={{
              p: { xs: 2.5, sm: 3.5 }, borderRadius: '8px',
              bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
            }}
          >
            <Typography sx={{ ...EYEBROW, color: 'primary.main', mb: 1.5 }}>With an account</Typography>
            <Typography variant="h5" sx={{ mb: 2.5, lineHeight: 1.25 }}>
              One sign-in, every device in step.
            </Typography>
            <Stack spacing={1.25}>
              {[
                { title: 'Library that follows you', body: 'Watching, planned and finished titles sync to your account.' },
                { title: 'Progress, not just history', body: 'Resume any episode mid-scene on whichever screen you are on.' },
                { title: 'Continue watching, everywhere', body: 'Your queue is rebuilt the moment you sign in on a new device.' },
              ].map((f) => (
                <Box
                  key={f.title}
                  sx={{
                    display: 'flex', gap: 1.5, alignItems: 'flex-start', p: 1.5,
                    border: '1px solid', borderColor: 'divider', borderRadius: '6px',
                    transition: 'border-color .2s ease, transform .2s ease, background-color .2s ease',
                    '&:hover': { borderColor: 'primary.main', transform: 'translateX(2px)', bgcolor: 'action.hover' },
                  }}
                >
                  <Box aria-hidden sx={{ width: 3, alignSelf: 'stretch', bgcolor: 'primary.main', borderRadius: '1px', flexShrink: 0 }} />
                  <Box>
                    <Typography sx={{ fontWeight: 600, fontSize: '0.88rem' }}>{f.title}</Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', mt: 0.4, lineHeight: 1.6 }}>{f.body}</Typography>
                  </Box>
                </Box>
              ))}
            </Stack>
          </Box>
        </Box>

        <Box sx={{ mt: 3.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 1.75 }}>
            <Typography sx={{ ...EYEBROW, color: 'text.secondary' }}>Start here</Typography>
            <Typography variant="h5">Popular in the catalogue</Typography>
          </Box>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' } }}>
            {(ANIME_LIST.filter((a) => a.trending).length >= 4
              ? ANIME_LIST.filter((a) => a.trending)
              : ANIME_LIST
            ).slice(0, 6).map((a) => (
              <PosterCard key={a.id} anime={a} />
            ))}
          </Box>
        </Box>
      </Box>
    );
  }

  const joined = user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : null;

  return (
    <Box sx={{ maxWidth: 1180 }}>
      <AccountHeading />

      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
          p: { xs: 2, sm: 2.5 }, mb: 2.5,
          border: '1px solid', borderColor: 'divider', borderRadius: '8px',
          bgcolor: 'background.paper',
          backgroundImage: 'radial-gradient(520px 200px at 100% 0%, rgba(var(--hanabi-accent-rgb),0.08), transparent 70%)',
        }}
      >
        <Box
          aria-hidden
          sx={{
            width: 58, height: 58, borderRadius: '6px', flexShrink: 0,
            display: 'grid', placeItems: 'center',
            bgcolor: 'primary.main', color: 'primary.contrastText',
            fontWeight: 800, fontSize: '1.35rem', fontFamily: NUMERAL.fontFamily,
          }}
        >
          {displayName.charAt(0).toUpperCase()}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 700, fontSize: '1.05rem' }}>{displayName}</Typography>
          <Typography noWrap sx={{ ...EYEBROW, color: 'text.secondary', mt: 0.6 }}>{user?.email}</Typography>
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        {joined && (
          <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
            <Typography sx={{ ...EYEBROW, color: 'text.secondary' }}>Member since</Typography>
            <Typography sx={{ ...NUMERAL, fontSize: '0.82rem', mt: 0.5 }}>{joined}</Typography>
          </Box>
        )}
        <Button
          variant="outlined"
          onClick={() => void signOut()}
          sx={{ borderColor: 'divider', flexShrink: 0, '&:hover': { borderColor: 'primary.main', color: 'primary.main' } }}
        >
          Sign out
        </Button>
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1.1fr 0.9fr' }, alignItems: 'start' }}>
        <Stack spacing={2}>
          <Panel title="Your stats">
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.5 }}>
              {stats.map((s) => (
                <Box
                  key={s.label}
                  sx={{
                    p: 1.75, border: '1px solid', borderColor: 'divider', borderRadius: '6px',
                    transition: 'border-color .2s ease, transform .2s ease, background-color .2s ease',
                    '&:hover': { borderColor: 'primary.main', transform: 'translateY(-2px)', bgcolor: 'action.hover' },
                  }}
                >
                  <Typography sx={{ ...NUMERAL, fontSize: '1.7rem', color: 'primary.main', lineHeight: 1 }}>
                    {s.value}
                  </Typography>
                  <Typography sx={{ ...EYEBROW, fontSize: '0.5rem', color: 'text.secondary', mt: 1 }}>
                    {s.label}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Panel>

          <Panel
            title="Taste profile"
            action={
              topGenres.length > 0 ? (
                <Typography sx={{ ...EYEBROW, fontSize: '0.5rem', color: 'text.secondary' }}>
                  {topGenres.reduce((acc, [, n]) => acc + n, 0)} genre hits
                </Typography>
              ) : undefined
            }
          >
            {topGenres.length > 0 ? (
              <Stack spacing={1.1}>
                {topGenres.map(([g, n]) => (
                  <Box key={g} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography sx={{ ...EYEBROW, fontSize: '0.56rem', color: 'text.secondary', width: 108, flexShrink: 0 }}>
                      {GENRE_LABELS_BY_ID.get(g) ?? g}
                    </Typography>
                    <Box sx={{ flexGrow: 1, height: 6, bgcolor: 'action.hover', borderRadius: '3px', overflow: 'hidden' }}>
                      <Box
                        sx={{
                          width: `${Math.max(8, (n / genreMax) * 100)}%`, height: '100%',
                          bgcolor: 'primary.main', borderRadius: '3px',
                          transition: 'width .4s cubic-bezier(0.22,1,0.36,1)',
                        }}
                      />
                    </Box>
                    <Typography sx={{ ...NUMERAL, fontSize: '0.7rem', color: 'text.secondary', width: 20, textAlign: 'right' }}>
                      {n}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                Add a few titles to your library and your genre breakdown appears here.
              </Typography>
            )}
          </Panel>

          <Panel
            title="Recent activity"
            action={
              recent.length > 0 ? (
                <Button size="small" onClick={() => navigate('/library')} sx={{ minHeight: 28, px: 1, fontSize: '0.72rem' }}>
                  Open library
                </Button>
              ) : undefined
            }
          >
            {recent.length > 0 ? (
              <Stack spacing={0.5}>
                {recent.map((p) => {
                  const pct = p.durationSeconds > 0 ? Math.min(100, (p.positionSeconds / p.durationSeconds) * 100) : 0;
                  return (
                    <Box
                      key={p.episodeId}
                      component="button"
                      onClick={() => navigate(`/watch/${p.animeId}?ep=${p.episodeNumber}`)}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', textAlign: 'left',
                        p: 0.75, borderRadius: '6px', border: '1px solid', borderColor: 'transparent',
                        cursor: 'pointer', bgcolor: 'transparent', color: 'text.primary',
                        transition: 'background-color .18s ease, border-color .18s ease',
                        '&:hover': { bgcolor: 'action.hover', borderColor: 'divider' },
                      }}
                    >
                      <Box
                        sx={{
                          width: 64, height: 36, flexShrink: 0, borderRadius: '4px', overflow: 'hidden',
                          bgcolor: 'action.hover', position: 'relative',
                          border: '1px solid', borderColor: 'divider',
                        }}
                      >
                        {p.animePoster && (
                          <Box component="img" src={p.animePoster} alt="" loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        )}
                      </Box>
                      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                        <Typography noWrap sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
                          {p.animeTitle ?? 'Anime'}
                        </Typography>
                        <Typography noWrap sx={{ ...EYEBROW, fontSize: '0.52rem', color: 'text.secondary', mt: 0.4 }}>
                          EP {p.episodeNumber} · {formatWhen(p.updatedAt)}
                        </Typography>
                      </Box>
                      <Box sx={{ width: 88, flexShrink: 0, display: { xs: 'none', sm: 'block' } }}>
                        <Box sx={{ height: 4, bgcolor: 'action.hover', borderRadius: '2px', overflow: 'hidden' }}>
                          <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: p.completed ? 'success.main' : 'primary.main' }} />
                        </Box>
                        <Typography sx={{ ...NUMERAL, fontSize: '0.6rem', color: 'text.secondary', mt: 0.5, textAlign: 'right' }}>
                          {p.completed ? 'FINISHED' : `${Math.round(pct)}%`}
                        </Typography>
                      </Box>
                      <PlayArrowIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
                    </Box>
                  );
                })}
              </Stack>
            ) : (
              <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                Nothing watched yet — start an episode and your history shows up here.
              </Typography>
            )}
          </Panel>
        </Stack>

        <Stack spacing={2}>
          <Panel title="Preferences">
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
              <Box>
                <Typography sx={{ fontWeight: 600, fontSize: '0.92rem' }}>Theme</Typography>
                <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', mt: 0.4 }}>
                  The video player always uses a cinematic black surface.
                </Typography>
              </Box>
              <Button
                variant="outlined"
                onClick={toggle}
                sx={{ flexShrink: 0, borderColor: 'divider', '&:hover': { borderColor: 'primary.main', color: 'primary.main' } }}
              >
                {mode === 'light' ? 'Switch to dark' : 'Switch to light'}
              </Button>
            </Stack>
          </Panel>

          <Panel title="Account details">
            <Stack spacing={1.25}>
              {[
                { label: 'Email', value: user?.email ?? '—' },
                { label: 'Display name', value: displayName },
                { label: 'Member since', value: joined ?? '—' },
                { label: 'Library titles', value: `${library.length}` },
              ].map((row) => (
                <Box key={row.label} sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2 }}>
                  <Typography sx={{ ...EYEBROW, fontSize: '0.54rem', color: 'text.secondary' }}>{row.label}</Typography>
                  <Typography noWrap sx={{ fontSize: '0.85rem', fontWeight: 600, textAlign: 'right', minWidth: 0 }}>
                    {row.value}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Panel>

          <Panel title="Sync">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                aria-hidden
                sx={{
                  width: 8, height: 8, borderRadius: '2px', flexShrink: 0,
                  bgcolor: syncing ? 'primary.main' : 'success.main',
                  boxShadow: syncing ? '0 0 0 4px rgba(var(--hanabi-accent-rgb),0.12)' : 'none',
                }}
              />
              <Typography sx={{ fontSize: '0.86rem', color: 'text.secondary', lineHeight: 1.6 }}>
                {syncing
                  ? 'Syncing your library and progress…'
                  : lastSyncedAt
                    ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString()}. Sync repeats automatically in the background.`
                    : 'Your library and progress sync to your account automatically.'}
              </Typography>
            </Box>
            {isCloudEnabled && (
              <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }} useFlexGap>
                <Chip size="small" variant="outlined" label="Library" sx={{ borderColor: 'divider' }} />
                <Chip size="small" variant="outlined" label="Watch progress" sx={{ borderColor: 'divider' }} />
                <Chip size="small" variant="outlined" label="Continue watching" sx={{ borderColor: 'divider' }} />
              </Stack>
            )}
          </Panel>

          <Alert
            icon={<InfoOutlinedIcon fontSize="small" />}
            severity="info"
            sx={{ borderRadius: '8px', alignItems: 'flex-start' }}
          >
            Signed in — your library, watch progress and continue-watching state follow this account on every device.
          </Alert>
        </Stack>
      </Box>
    </Box>
  );
}
