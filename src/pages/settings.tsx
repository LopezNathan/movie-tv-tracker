import { Download, ExternalLink } from 'lucide-react';

export function SettingsPage() {
  return (
    <div className="page-stack">
      <header>
        <p className="eyebrow">Ownership</p>
        <h1>Settings.</h1>
        <p className="lede">Your data stays portable, your catalog source stays credited.</p>
      </header>
      <section className="settings-card">
        <div>
          <h2>Export your data</h2>
          <p>Download a versioned JSON backup of your media, watches, ratings, and watchlist.</p>
        </div>
        <a className="button primary" href="/api/export.json" download>
          <Download size={17} /> Download JSON
        </a>
      </section>
      <section className="settings-card">
        <div>
          <h2>Catalog credits</h2>
          <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        </div>
        <a
          className="button secondary"
          href="https://www.themoviedb.org"
          target="_blank"
          rel="noreferrer"
        >
          Visit TMDB <ExternalLink size={16} />
        </a>
      </section>
    </div>
  );
}
