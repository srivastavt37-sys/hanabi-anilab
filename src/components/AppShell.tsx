import { useRef, useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import SearchIcon from '@mui/icons-material/Search';
import HomeIcon from '@mui/icons-material/Home';
import ExploreIcon from '@mui/icons-material/Explore';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import PersonIcon from '@mui/icons-material/Person';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import MenuIcon from '@mui/icons-material/Menu';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useLocation, useNavigate } from 'react-router-dom';
import { useThemeMode } from '../context/ThemeModeContext';
import { SyncBadge } from './StatusBadges';
import { EYEBROW } from '../theme';
import type { ReactNode } from 'react';

const NAV_WIDTH = 250;
const NAV_WIDTH_COLLAPSED = 76;

const PRIMARY_NAV = [
  { label: 'Home', icon: HomeIcon, to: '/' },
  { label: 'Explore', icon: ExploreIcon, to: '/explore' },
  { label: 'Library', icon: VideoLibraryIcon, to: '/library' },
];

const MOBILE_NAV = [...PRIMARY_NAV, { label: 'Account', icon: PersonIcon, to: '/account' }];

function pageMeta(pathname: string): { eyebrow: string; title: string } {
  if (pathname === '/') return { eyebrow: 'Featured', title: 'Home' };
  if (pathname.startsWith('/explore')) return { eyebrow: 'Catalogue', title: 'Explore' };
  if (pathname.startsWith('/library')) return { eyebrow: 'Your collection', title: 'My library' };
  if (pathname.startsWith('/account')) return { eyebrow: 'Your profile', title: 'Account' };
  if (pathname.startsWith('/watch')) return { eyebrow: 'Streaming', title: 'Now playing' };
  if (pathname.startsWith('/anime')) return { eyebrow: 'Title', title: 'Details' };
  return { eyebrow: 'Hanabi', title: 'Anime stream' };
}

function Brand({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  return (
    <Box
      component="button"
      onClick={() => navigate('/')}
      aria-label="Hanabi home"
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: compact ? 'center' : 'flex-start',
        gap: 1.25, px: compact ? 0 : 2.25, py: compact ? 0 : 2.25,
        background: 'none', border: 0, cursor: 'pointer', textAlign: 'left',
        width: compact ? 'auto' : '100%', color: 'text.primary',
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 36, height: 36, borderRadius: '7px', flexShrink: 0,
          background: 'linear-gradient(140deg, rgba(var(--hanabi-accent-rgb),1), rgba(var(--hanabi-accent-rgb),0.72) 55%, rgba(var(--hanabi-accent-rgb),0.42))',
          display: 'grid', placeItems: 'center',
          boxShadow: '0 8px 22px -10px rgba(var(--hanabi-accent-rgb),0.4)',
        }}
      >
        <PlayArrowIcon sx={{ color: 'var(--hanabi-accent-ink)', fontSize: 22 }} />
      </Box>
      {!compact && (
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '0.02em', lineHeight: 1, color: 'text.primary' }}
          >
            HANABI
          </Typography>
          <Typography sx={{ fontSize: '0.55rem', letterSpacing: '0.3em', color: 'text.secondary', mt: 0.4 }}>
            ANIME STREAM
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export function AppShell({ children, query, onQueryChange }: {
  children: ReactNode;
  query: string;
  onQueryChange: (q: string) => void;
}) {
  const { mode, toggle } = useThemeMode();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('anistream:nav-collapsed') === '1');
  const searchRef = useRef<HTMLInputElement>(null);

  const isActive = (to: string) => (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to));
  const meta = pageMeta(location.pathname);

  const searchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) navigate(`/explore?q=${encodeURIComponent(query)}`);
  };

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      localStorage.setItem('anistream:nav-collapsed', c ? '0' : '1');
      return !c;
    });
  };

  const expandAndSearch = () => {
    if (collapsed) {
      setCollapsed(false);
      localStorage.setItem('anistream:nav-collapsed', '0');
      window.setTimeout(() => searchRef.current?.focus(), 240);
    } else {
      searchRef.current?.focus();
    }
  };

  const searchForm = (
    <Box
      component="form"
      onSubmit={searchSubmit}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1,
        bgcolor: 'action.hover', borderRadius: '6px', px: 1.75, py: 0.7,
        border: '1px solid', borderColor: 'divider',
        transition: 'border-color .2s, box-shadow .2s',
        '&:focus-within': {
          borderColor: 'primary.main',
          boxShadow: '0 0 0 3px rgba(var(--hanabi-accent-rgb),0.18)',
        },
      }}
    >
      <SearchIcon fontSize="small" sx={{ color: 'text.secondary', flexShrink: 0 }} aria-hidden />
      <InputBase
        inputRef={searchRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search anime…"
        inputProps={{ 'aria-label': 'Search anime' }}
        sx={{ fontSize: '0.86rem', flex: 1, minWidth: 0 }}
      />
    </Box>
  );

  const navList = (compact: boolean) => (
    <List sx={{ px: compact ? 1 : 1.5, pt: 1 }}>
      {PRIMARY_NAV.map(({ label, icon: Icon, to }) => {
        const item = (
          <ListItemButton
            key={to}
            selected={isActive(to)}
            onClick={() => { navigate(to); setMobileOpen(false); }}
            sx={{
              position: 'relative', borderRadius: '6px', mb: 0.5, py: 1.1,
              justifyContent: compact ? 'center' : 'flex-start',
              px: compact ? 0 : 2,
              color: 'text.secondary',
              transition: 'background-color .18s ease, color .18s ease',
              '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
              '&:hover .MuiListItemIcon-root': { color: 'primary.main' },
              '&::before': {
                content: '""', position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                width: 2, height: 26, borderRadius: 1, bgcolor: 'primary.main',
                opacity: 0, transition: 'opacity 200ms ease',
              },
              '&.Mui-selected': {
                bgcolor: 'action.selected', color: 'text.primary',
                '&::before': { opacity: 1 },
                '& .MuiListItemIcon-root': { color: 'primary.main' },
              },
              '&.Mui-selected:hover': { bgcolor: 'action.selected' },
            }}
          >
            <ListItemIcon sx={{ minWidth: compact ? 0 : 42, justifyContent: 'center', color: 'inherit' }}>
              <Icon fontSize="small" />
            </ListItemIcon>
            {!compact && (
              <ListItemText
                primary={label}
                slotProps={{ primary: { fontWeight: 600, fontSize: '0.9rem', letterSpacing: 0 } }}
              />
            )}
          </ListItemButton>
        );
        return compact ? <Tooltip key={to} title={label} placement="right">{item}</Tooltip> : item;
      })}
    </List>
  );

  const accountBlock = (compact: boolean) => {
    const active = isActive('/account');
    const inner = (
      <Box
        component="button"
        onClick={() => { navigate('/account'); setMobileOpen(false); }}
        aria-label="Account"
        sx={{
          display: 'flex', alignItems: 'center', gap: 1.25, width: '100%',
          px: compact ? 0 : 1.25, py: 1, mb: 1.5,
          justifyContent: compact ? 'center' : 'flex-start',
          bgcolor: active ? 'action.selected' : 'transparent',
          border: '1px solid', borderColor: active ? 'primary.main' : 'divider',
          borderRadius: '6px', cursor: 'pointer', textAlign: 'left',
          color: 'text.primary',
          transition: 'border-color .2s, background-color .2s',
          '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
        }}
      >
        <Box
          aria-hidden
          sx={{
            width: 30, height: 30, borderRadius: '4px', flexShrink: 0,
            display: 'grid', placeItems: 'center',
            bgcolor: active ? 'primary.main' : 'action.hover',
            color: active ? 'primary.contrastText' : 'text.secondary',
            border: '1px solid', borderColor: active ? 'primary.main' : 'divider',
          }}
        >
          <PersonIcon sx={{ fontSize: 17 }} />
        </Box>
        {!compact && (
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: '0.82rem', fontWeight: 700, lineHeight: 1.2 }}>
              Account
            </Typography>
            <Typography noWrap sx={{ ...EYEBROW, fontSize: '0.52rem', color: 'text.secondary', mt: 0.35 }}>
              Profile & settings
            </Typography>
          </Box>
        )}
      </Box>
    );
    return compact ? <Tooltip title="Account" placement="right">{inner}</Tooltip> : inner;
  };

  const drawerFooter = (compact: boolean) => (
    <Box sx={{ px: compact ? 1.25 : 2, pb: 2.5, mt: 'auto' }}>
      {accountBlock(compact)}
      {!compact && (
        <>
          <Box sx={{ height: 2, width: 28, bgcolor: 'primary.main', mb: 1.75 }} />
          <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.7 }}>
            Catalogue by AniList
            <br />
            Streams via AniLab2
          </Typography>
        </>
      )}
    </Box>
  );

  const drawerBody = (compact: boolean, mobile = false) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
      {compact ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, pt: 2, pb: 0.5 }}>
          <Brand compact />
          <IconButton
            onClick={toggleCollapsed}
            aria-label="Expand sidebar"
            size="small"
            sx={{ color: 'text.secondary', width: 26, height: 22 }}
          >
            <ChevronRightIcon sx={{ fontSize: 17 }} />
          </IconButton>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', px: mobile ? 1 : 1, pt: mobile ? 0.5 : 0 }}>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}><Brand /></Box>
          <IconButton
            onClick={mobile ? () => setMobileOpen(false) : toggleCollapsed}
            aria-label={mobile ? 'Close navigation' : 'Collapse sidebar'}
            size="small"
            sx={{ mr: mobile ? 1 : 0.5, flexShrink: 0, color: 'text.secondary' }}
          >
            {mobile ? <ChevronLeftIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
          </IconButton>
        </Box>
      )}

      <Box sx={{ px: compact ? 0 : 2, pb: 1.5, display: 'flex', justifyContent: 'center' }}>
        {compact ? (
          <Tooltip title="Search" placement="right">
            <IconButton onClick={expandAndSearch} aria-label="Search anime" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '6px', width: 38, height: 38 }}>
              <SearchIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : searchForm}
      </Box>

      {navList(compact)}
      {drawerFooter(compact)}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Desktop sidebar */}
      <Drawer
        variant="permanent"
        open
        sx={{
          width: collapsed ? NAV_WIDTH_COLLAPSED : NAV_WIDTH,
          flexShrink: 0,
          display: { xs: 'none', md: 'block' },
          transition: 'width 220ms cubic-bezier(0.4, 0, 0.2, 1)',
          '& .MuiDrawer-paper': {
            width: collapsed ? NAV_WIDTH_COLLAPSED : NAV_WIDTH,
            bgcolor: 'background.paper',
            borderRight: '1px solid', borderColor: 'divider', boxSizing: 'border-box',
            overflowX: 'hidden',
            transition: 'width 220ms cubic-bezier(0.4, 0, 0.2, 1)',
          },
        }}
      >
        {drawerBody(collapsed)}
      </Drawer>

      {/* Mobile temporary drawer */}
      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: 276, bgcolor: 'background.paper' } }}
      >
        {drawerBody(false, true)}
      </Drawer>

      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            bgcolor: mode === 'dark' ? 'rgba(18,14,14,0.72)' : 'rgba(242,240,238,0.8)',
            borderBottom: '1px solid', borderColor: 'divider',
            backdropFilter: 'blur(14px)',
            color: 'text.primary',
          }}
        >
          <Toolbar sx={{ gap: 1.5, minHeight: { xs: 60, md: 68 } }}>
            <IconButton
              onClick={() => setMobileOpen(true)}
              sx={{ display: { xs: 'inline-flex', md: 'none' } }}
              aria-label="Open navigation"
            >
              <MenuIcon />
            </IconButton>

            <Box sx={{ display: { xs: 'flex', md: 'none' }, width: { xs: 'auto', sm: 400 }, flexGrow: { xs: 1, sm: 0 } }}>
              {searchForm}
            </Box>

            <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1.25, minWidth: 0 }}>
              <Typography sx={{ ...EYEBROW, fontSize: '0.58rem', color: 'text.secondary', flexShrink: 0 }}>Hanabi</Typography>
              <Box aria-hidden sx={{ width: '1px', height: 13, bgcolor: 'divider', flexShrink: 0 }} />
              <Typography noWrap sx={{ ...EYEBROW, fontSize: '0.58rem', color: 'primary.main', flexShrink: 0 }}>
                {meta.title.toUpperCase()}
              </Typography>
            </Box>

            <Box sx={{ flexGrow: 1 }} />
            <SyncBadge />
            <Tooltip title={mode === 'light' ? 'Dark theme' : 'Light theme'}>
              <IconButton onClick={toggle} aria-label="Toggle color theme">
                {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
              </IconButton>
            </Tooltip>
          </Toolbar>
        </AppBar>

        <Box
          component="main"
          sx={{
            flexGrow: 1, px: { xs: 2, md: 4 }, py: { xs: 3, md: 4 },
            pb: { xs: 12, md: 6 }, maxWidth: 1500, width: '100%', mx: 'auto',
          }}
        >
          {children}
        </Box>

        {/* Mobile bottom navigation */}
        <BottomNavigation
          value={MOBILE_NAV.findIndex((n) => isActive(n.to))}
          showLabels
          sx={{
            display: { xs: 'flex', md: 'none' }, position: 'fixed', bottom: 0, left: 0, right: 0,
            borderTop: '1px solid', borderColor: 'divider',
            bgcolor: mode === 'dark' ? 'rgba(18,14,14,0.9)' : 'rgba(242,240,238,0.94)',
            backdropFilter: 'blur(12px)', zIndex: 1100,
            '& .MuiBottomNavigationAction-label': { fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' },
          }}
        >
          {MOBILE_NAV.map(({ label, icon: Icon, to }) => (
            <BottomNavigationAction
              key={to}
              label={label}
              icon={<Icon />}
              onClick={() => navigate(to)}
              sx={{ '&.Mui-selected': { color: 'primary.main' } }}
            />
          ))}
        </BottomNavigation>
      </Box>
    </Box>
  );
}
