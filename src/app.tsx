import { Clapperboard, Clock3, Download, Home, Search, Settings } from 'lucide-react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { OfflineBanner } from './components/connectivity';
import { DashboardPage } from './pages/dashboard';
import { HistoryPage } from './pages/history';
import { ImportPage, ImportReviewPage } from './pages/import';
import { MediaDetailPage } from './pages/media-detail';
import { SearchPage } from './pages/search';
import { SettingsPage } from './pages/settings';
import { WatchlistPage } from './pages/watchlist';

const routes = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/history', label: 'History', icon: Clock3 },
  { to: '/watchlist', label: 'Watchlist', icon: Clapperboard },
  { to: '/import', label: 'Import', icon: Download },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function App() {
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
          <Route path="/history" element={<HistoryPage />} />
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
