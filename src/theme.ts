import { createTheme } from '@mui/material/styles';
import type { ThemeOptions } from '@mui/material/styles';

/**
 * Hanabi — monochrome ink identity.
 *
 * Pure black canvas (#000000), tiered graphite surfaces, pure white type and
 * a single ink accent that flips with the theme: white on black, near-black
 * on white. No hue at all — artwork is the only colour on screen.
 *
 * Geometry stays rectilinear: tiles, rails and controls share a 4/6px radius
 * so the interface reads as a printed sheet rather than a bubble kit.
 */

const INK = '#000000';
const PAPER = '#0B0B0B';
const BONE = '#FFFFFF';
const ACCENT = '#FFFFFF';
const ACCENT_INK = '#0A0A0A';

export const TILE_RADIUS = 6;
export const RIM = 'inset 0 1px 0 0 rgba(255,255,255,0.09)';
export const RIM_LIGHT = 'inset 0 1px 0 0 rgba(255,255,255,0.85)';

const BODY = '"Inter Tight Variable", "Inter Tight", "Inter", system-ui, -apple-system, sans-serif';
const DISPLAY = BODY;
const MONO = 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, monospace';

/** Credits-style meta: mono, wide tracking, uppercase. */
export const EYEBROW = {
  fontFamily: MONO,
  fontSize: '0.63rem',
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  fontWeight: 600,
  lineHeight: 1.4,
} as const;

export const NUMERAL = {
  fontFamily: MONO,
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.02em',
} as const;

/** Film-still treatment: push the artwork to a duotone so repeats read as intent. */
export const DUOTONE = 'grayscale(1) contrast(1.06) brightness(0.96)';

const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E")`;

function globalCss(scrollThumb: string) {
  return {
    '::selection': { backgroundColor: 'rgba(255,255,255,0.28)' },
    '*': { scrollbarWidth: 'thin', scrollbarColor: `${scrollThumb} transparent` },
    '*::-webkit-scrollbar': { width: 8, height: 8 },
    '*::-webkit-scrollbar-thumb': { backgroundColor: scrollThumb, borderRadius: 8 },
    '*::-webkit-scrollbar-track': { background: 'transparent' },
    // Native buttons must never fall back to the UA's black text colour.
    button: { color: 'inherit', fontFamily: 'inherit', textAlign: 'inherit' },
  };
}

function baseComponents(accentGlow: string, skeleton: string, scrollThumb: string): ThemeOptions['components'] {
  return {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: '6px',
          paddingLeft: 20,
          paddingRight: 20,
          minHeight: 42,
          fontWeight: 600,
          letterSpacing: 0,
          textTransform: 'none',
        },
        containedPrimary: {
          boxShadow: 'none',
          '&:hover': { boxShadow: accentGlow },
        },
        outlined: { borderColor: 'divider' },
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: 10,
          border: 0,
          boxShadow: 'none',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: '6px', height: 26, fontSize: '0.72rem' },
        label: { px: 1.25 },
      },
    },
    MuiSkeleton: {
      defaultProps: { animation: 'wave' as const },
      styleOverrides: { root: { backgroundColor: skeleton } },
    },
    MuiTableCell: { styleOverrides: { root: { borderColor: 'divider' } } },
    MuiTabs: { styleOverrides: { indicator: { height: 2, borderRadius: 2 } } },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none', fontWeight: 600, letterSpacing: 0, fontSize: '0.9rem',
          minHeight: 44, paddingLeft: 2, paddingRight: 2, marginRight: 20,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: { tooltip: { borderRadius: '6px', fontSize: '0.75rem', padding: '6px 10px' } },
    },
    MuiCssBaseline: { styleOverrides: globalCss(scrollThumb) },
  };
}

const baseTypography: ThemeOptions['typography'] = {
  fontFamily: BODY,
  h1: {
    fontFamily: DISPLAY,
    fontWeight: 800,
    fontSize: 'clamp(2.4rem, 5.4vw, 4.7rem)',
    lineHeight: 0.88,
    letterSpacing: '-0.035em',
    textTransform: 'uppercase',
  },
  h2: {
    fontFamily: DISPLAY,
    fontWeight: 800,
    fontSize: 'clamp(1.6rem, 2.8vw, 2.3rem)',
    lineHeight: 1,
    letterSpacing: '-0.02em',
  },
  h3: {
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: '1.35rem',
    lineHeight: 1.15,
    letterSpacing: '-0.015em',
  },
  h4: {
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: 'clamp(1.2rem, 1.8vw, 1.5rem)',
    lineHeight: 1.2,
    letterSpacing: '-0.015em',
  },
  h5: { fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.01em' },
  h6: { fontSize: '0.95rem', fontWeight: 600, letterSpacing: '-0.005em' },
  subtitle1: { fontWeight: 600, letterSpacing: '-0.005em' },
  subtitle2: { fontWeight: 600, fontSize: '0.85rem', letterSpacing: 0 },
  body1: { fontSize: '0.95rem', lineHeight: 1.65 },
  body2: { fontSize: '0.85rem', lineHeight: 1.6 },
  caption: { fontSize: '0.72rem', letterSpacing: '0.06em' },
  overline: { ...EYEBROW, lineHeight: 1.4 },
  button: { textTransform: 'none', fontWeight: 600, fontSize: '0.85rem' },
};

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: ACCENT, light: '#EDEDED', dark: '#C2C2C2', contrastText: ACCENT_INK },
    secondary: { main: ACCENT, light: '#F5F5F5', dark: '#B0B0B0', contrastText: ACCENT_INK },
    background: { default: INK, paper: PAPER },
    text: { primary: BONE, secondary: 'rgba(255,255,255,0.58)' },
    divider: 'rgba(255,255,255,0.12)',
    success: { main: '#D7D7D7' },
    warning: { main: '#CFCFCF' },
    error: { main: '#E4634F' },
  },
  typography: baseTypography,
  shape: { borderRadius: 8 },
  components: {
    ...baseComponents('0 14px 34px -12px rgba(255,255,255,0.32)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.18)'),
    MuiCssBaseline: {
      styleOverrides: {
        ...globalCss('rgba(255,255,255,0.18)'),
        ':root': {
          '--hanabi-accent-rgb': '255, 255, 255',
          '--hanabi-accent-ink': ACCENT_INK,
        },
        body: {
          backgroundColor: INK,
          backgroundImage:
            'radial-gradient(1200px 600px at 88% -14%, rgba(255,255,255,0.07), transparent 62%),' +
            'radial-gradient(900px 520px at -8% 4%, rgba(255,255,255,0.04), transparent 60%)',
          backgroundAttachment: 'fixed',
        },
        'body::before': {
          content: '""',
          position: 'fixed',
          inset: 0,
          backgroundImage: GRAIN,
          opacity: 0.04,
          mixBlendMode: 'overlay',
          pointerEvents: 'none',
          zIndex: 2000,
        },
      },
    },
  },
});

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: ACCENT_INK, light: '#2E2E2E', dark: '#000000', contrastText: '#FFFFFF' },
    secondary: { main: ACCENT_INK, light: '#333333', dark: '#000000', contrastText: '#FFFFFF' },
    background: { default: '#FFFFFF', paper: '#F2F2F2' },
    text: { primary: '#0A0A0A', secondary: 'rgba(10,10,10,0.58)' },
    divider: 'rgba(0,0,0,0.12)',
    success: { main: '#2F2F2F' },
    warning: { main: '#4A4A4A' },
    error: { main: '#B23A28' },
  },
  typography: baseTypography,
  shape: { borderRadius: 8 },
  components: {
    ...baseComponents('0 14px 32px -14px rgba(0,0,0,0.35)', 'rgba(10,10,10,0.06)', 'rgba(0,0,0,0.2)'),
    MuiCssBaseline: {
      styleOverrides: {
        ...globalCss('rgba(0,0,0,0.2)'),
        ':root': {
          '--hanabi-accent-rgb': '10, 10, 10',
          '--hanabi-accent-ink': '#FFFFFF',
        },
        body: {
          backgroundColor: '#FFFFFF',
          backgroundImage: 'radial-gradient(1100px 520px at 86% -16%, rgba(0,0,0,0.05), transparent 62%)',
          backgroundAttachment: 'fixed',
        },
        'body::before': {
          content: '""',
          position: 'fixed',
          inset: 0,
          backgroundImage: GRAIN,
          opacity: 0.03,
          mixBlendMode: 'multiply',
          pointerEvents: 'none',
          zIndex: 2000,
        },
      },
    },
  },
});

// Player surface — always pure black regardless of app theme.
export const PLAYER_SURFACE = '#000000';
