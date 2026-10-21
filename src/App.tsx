import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { lightTheme, darkTheme } from './theme';
import { AppShell } from './components/AppShell';
import { AppDataProvider } from './context/AppDataContext';
import { AuthProvider } from './context/AuthContext';
import { ThemeModeProvider, useThemeMode } from './context/ThemeModeContext';
import { HomePage } from './pages/HomePage';
import { ExplorePage } from './pages/ExplorePage';
import { AnimeDetailPage } from './pages/AnimeDetailPage';
import { WatchPage } from './pages/WatchPage';
import { LibraryPage } from './pages/LibraryPage';
import { AccountPage } from './pages/AccountPage';
import { EmptyState } from './components/Rail';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      message="The page you're looking for doesn't exist or was moved."
      action={{ label: 'Back to home', onClick: () => window.location.assign('/') }}
    />
  );
}

function ThemedApp() {
  const { mode } = useThemeMode();
  const [query, setQuery] = useState('');

  return (
    <ThemeProvider theme={mode === 'light' ? lightTheme : darkTheme} defaultMode="dark">
      <CssBaseline />
      <AuthProvider>
        <AppDataProvider>
          <BrowserRouter>
            <ScrollToTop />
            <AppShell query={query} onQueryChange={setQuery}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/explore" element={<ExplorePage />} />
                <Route path="/anime/:slug" element={<AnimeDetailPage />} />
                <Route path="/watch/:slug" element={<WatchPage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/account" element={<AccountPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppShell>
          </BrowserRouter>
        </AppDataProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <ThemeModeProvider>
      <ThemedApp />
    </ThemeModeProvider>
  );
}
