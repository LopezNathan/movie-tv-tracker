import { useQuery } from '@tanstack/react-query';
import {
  Check,
  Clipboard,
  Download,
  ExternalLink,
  FileArchive,
  Link2,
  LoaderCircle,
  RefreshCw,
  Trash2,
  Unplug,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { api, json } from '../lib/api';

type PlexIntegration = {
  plexUsername: string;
  createdAt: string;
  lastEventAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
};

export function SettingsPage() {
  const [cleared, setCleared] = useState(false);
  const [plexUsername, setPlexUsername] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [plexBusy, setPlexBusy] = useState(false);
  const [plexError, setPlexError] = useState('');
  const [copied, setCopied] = useState(false);
  const plex = useQuery({
    queryKey: ['plex-integration'],
    queryFn: () => api<{ integration: PlexIntegration | null }>('/api/integrations/plex'),
  });

  async function clearOfflineData() {
    if (!('caches' in window)) return;
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    setCleared(true);
  }

  async function configurePlex() {
    const username = plexUsername.trim() || plex.data?.integration?.plexUsername;
    if (!username) {
      setPlexError('Enter the Plex username shown in your Plex account.');
      return;
    }
    setPlexBusy(true);
    setPlexError('');
    setCopied(false);
    try {
      const result = await api<{ integration: PlexIntegration; webhookUrl: string }>(
        '/api/integrations/plex',
        json('PUT', { plexUsername: username }),
      );
      setWebhookUrl(result.webhookUrl);
      setPlexUsername('');
      await plex.refetch();
    } catch (error) {
      setPlexError(error instanceof Error ? error.message : 'Could not configure Plex.');
    } finally {
      setPlexBusy(false);
    }
  }

  async function disconnectPlex() {
    setPlexBusy(true);
    setPlexError('');
    try {
      await api('/api/integrations/plex', { method: 'DELETE' });
      setWebhookUrl('');
      await plex.refetch();
    } catch (error) {
      setPlexError(error instanceof Error ? error.message : 'Could not disconnect Plex.');
    } finally {
      setPlexBusy(false);
    }
  }

  async function copyWebhookUrl() {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
  }

  const integration = plex.data?.integration;
  const plexQueryError = plex.isError ? plex.error.message : '';

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
      <section className="settings-card plex-settings">
        <div className="grow">
          <h2>Automatic Plex tracking</h2>
          <p>
            Record movies and episodes when Plex marks them watched. Events from other Plex users
            are ignored.
          </p>
          {integration ? (
            <div className="integration-status">
              <span className="status-dot" aria-hidden="true" />
              <span>
                Connected for <strong>{integration.plexUsername}</strong>
                {integration.lastEventAt
                  ? ` · Last event ${new Date(integration.lastEventAt).toLocaleString()}`
                  : ' · Waiting for the first event'}
              </span>
            </div>
          ) : null}
          {integration?.lastStatus ? (
            <p className={integration.lastError ? 'integration-error' : 'success-text'}>
              Last result: {integration.lastStatus}
              {integration.lastError ? ` — ${integration.lastError}` : ''}
            </p>
          ) : null}
          <div className="plex-controls">
            <label>
              Plex username
              <input
                value={plexUsername}
                onChange={(event) => setPlexUsername(event.target.value)}
                placeholder={integration?.plexUsername ?? 'Your Plex username'}
                disabled={plexBusy || plex.isLoading}
              />
            </label>
            <button
              className="button primary"
              disabled={plexBusy || plex.isLoading}
              onClick={() => void configurePlex()}
            >
              {plexBusy ? (
                <LoaderCircle className="spin" size={17} />
              ) : integration ? (
                <RefreshCw size={17} />
              ) : (
                <Link2 size={17} />
              )}
              {integration ? 'Generate new URL' : 'Connect Plex'}
            </button>
            {integration ? (
              <button
                className="button secondary"
                disabled={plexBusy}
                onClick={() => void disconnectPlex()}
              >
                <Unplug size={17} /> Disconnect
              </button>
            ) : null}
          </div>
          {webhookUrl ? (
            <div className="webhook-reveal" role="status">
              <p>
                In Plex Web, open <strong>Settings → Account → Webhooks</strong>, add this URL, and
                save. It is shown only now; generating another URL disables this one.
              </p>
              <div className="webhook-url">
                <code>{webhookUrl}</code>
                <button className="button secondary" onClick={() => void copyWebhookUrl()}>
                  {copied ? <Check size={17} /> : <Clipboard size={17} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          ) : null}
          {plexError ? (
            <p className="integration-error" role="alert">
              {plexError}
            </p>
          ) : null}
          {plexQueryError ? (
            <p className="integration-error" role="alert">
              Could not load the Plex connection: {plexQueryError}
            </p>
          ) : null}
          <p className="integration-note">
            Plex webhooks require Plex Pass. Scene stores only a digest of the secret URL.
          </p>
        </div>
      </section>
      <section className="settings-card">
        <div>
          <h2>Import from Trakt</h2>
          <p>Bring in your Trakt history, ratings, and watchlist from an exported ZIP.</p>
        </div>
        <Link className="button primary" to="/import">
          <FileArchive size={17} /> Import data
        </Link>
      </section>
      <section className="settings-card">
        <div>
          <h2>Offline data</h2>
          <p>Clear cached pages and artwork on this device. Your D1 library is not affected.</p>
          {cleared ? (
            <p className="success-text" role="status">
              Offline data cleared.
            </p>
          ) : null}
        </div>
        <button className="button primary" onClick={() => void clearOfflineData()}>
          <Trash2 size={17} /> Clear offline data
        </button>
      </section>
      <section className="settings-card">
        <div>
          <h2>Catalog credits</h2>
          <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        </div>
        <a
          className="button primary"
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
