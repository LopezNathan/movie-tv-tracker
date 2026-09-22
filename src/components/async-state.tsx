import { AlertTriangle, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { couldBeExpiredAccessSession } from '../lib/api';

export function LoadingState({ label = 'Loading your library…' }: { label?: string }) {
  return (
    <div className="async-state" role="status">
      <LoaderCircle className="spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const [restartingAccess, setRestartingAccess] = useState(false);
  const needsAccessRenewal = couldBeExpiredAccessSession(error);
  const renewAccessSession = async () => {
    setRestartingAccess(true);
    try {
      // An API fetch can be intercepted by the PWA before Cloudflare Access
      // gets a chance to start its browser login flow. Removing the active
      // registration makes this navigation reach Access directly; the app
      // registers a fresh service worker once authentication completes.
      const registrations = await navigator.serviceWorker?.getRegistrations();
      await Promise.all(registrations?.map((registration) => registration.unregister()) ?? []);
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  return (
    <div className="async-state error" role="alert">
      <AlertTriangle aria-hidden="true" />
      <div>
        <strong>Something went off script.</strong>
        <p>{error instanceof Error ? error.message : 'The request could not be completed.'}</p>
        {needsAccessRenewal && (
          <p>Your Cloudflare Access session may have expired. Sign in again to continue.</p>
        )}
      </div>
      {retry && (
        <button className="button subtle" onClick={retry}>
          Try again
        </button>
      )}
      {needsAccessRenewal && (
        <button
          className="button subtle"
          onClick={() => void renewAccessSession()}
          disabled={restartingAccess}
        >
          {restartingAccess ? 'Opening sign-in…' : 'Sign in again'}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="empty-state">
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}
