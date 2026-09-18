import { useQuery } from '@tanstack/react-query';
import { Clapperboard, Home, Library, Search, Settings } from 'lucide-react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { OfflineBanner } from './components/connectivity';
import { DashboardPage } from './pages/dashboard';
import { ImportPage, ImportReviewPage } from './pages/import';
import { LibraryPage } from './pages/library';
import { MediaDetailPage } from './pages/media-detail';
import { SearchPage } from './pages/search';
import { SettingsPage } from './pages/settings';
import { WatchlistPage } from './pages/watchlist';
import { PairingPage } from './pages/pairing';
import { queries } from './lib/api';

const routes = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/watchlist', label: 'Watchlist', icon: Clapperboard },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function App() {
  const location = useLocation();
  if (location.pathname === '/pair') return <PairingPage />;
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: queries.dashboard });
  const stats = dashboard.data?.stats;

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="Scene home">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span className="brand-copy">
            <strong>Scene</strong>
          </span>
        </NavLink>
        {stats && (
          <div className="header-stats" aria-label="Viewing totals">
            <span className="header-stat">
              <strong>{stats.watchedMovies}</strong>
              <small>Movies</small>
            </span>
            <span className="header-stat">
              <strong>{stats.watchedEpisodes}</strong>
              <small>Episodes</small>
            </span>
            <span className="header-stat accent">
              <strong>{stats.watchEvents}</strong>
              <small>Plays</small>
            </span>
          </div>
        )}
      </header>

      <OfflineBanner />

      <aside className="side-nav" aria-label="Primary navigation">
        {routes.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            <Icon aria-hidden="true" size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/history" element={<Navigate to="/library" replace />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/import/:id/review" element={<ImportReviewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/media/:kind/:id" element={<MediaDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {routes.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            <Icon aria-hidden="true" size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
