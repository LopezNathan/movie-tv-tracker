import { Clapperboard, Clock3, Download, Home, Search, Settings } from 'lucide-react';
import { NavLink, Route, Routes } from 'react-router-dom';

const routes = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/history', label: 'History', icon: Clock3 },
  { to: '/watchlist', label: 'Watchlist', icon: Clapperboard },
  { to: '/import', label: 'Import', icon: Download },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <section className="page-stack">
      <p className="eyebrow">Your private screen diary</p>
      <h1>{title}</h1>
      <p className="lede">{description}</p>
      <div className="empty-state">This area is ready for the next milestone.</div>
    </section>
  );
}

export function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="Scene home">
          <span className="brand-mark">S</span>
          <span>Scene</span>
        </NavLink>
        <span className="privacy-pill">Private library</span>
      </header>

      <main className="main-content">
        <Routes>
          <Route
            path="/"
            element={
              <Placeholder
                title="Welcome back."
                description="Pick up where you left off, remember every watch, and keep your queue tidy."
              />
            }
          />
          <Route
            path="/search"
            element={
              <Placeholder
                title="Find something."
                description="Search movies and television without handing your viewing history to another social network."
              />
            }
          />
          <Route
            path="/history"
            element={
              <Placeholder
                title="Watch history."
                description="Every play gets its own timestamp, including the rewatches worth remembering."
              />
            }
          />
          <Route
            path="/watchlist"
            element={
              <Placeholder
                title="Your watchlist."
                description="A quiet shortlist for whatever deserves your time next."
              />
            }
          />
          <Route
            path="/import"
            element={
              <Placeholder
                title="Bring your history."
                description="Import a Trakt data export without sharing your credentials."
              />
            }
          />
          <Route
            path="/settings"
            element={
              <Placeholder
                title="Settings."
                description="Manage data, offline storage, and credits."
              />
            }
          />
          <Route
            path="/media/:kind/:id"
            element={
              <Placeholder
                title="Title details."
                description="Episodes, ratings, progress, and watch controls will live here."
              />
            }
          />
        </Routes>
      </main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {routes.slice(0, 5).map(({ to, label, icon: Icon }) => (
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
