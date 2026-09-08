import { AlertTriangle, LoaderCircle } from 'lucide-react';

export function LoadingState({ label = 'Loading your library…' }: { label?: string }) {
  return (
    <div className="async-state" role="status">
      <LoaderCircle className="spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="async-state error" role="alert">
      <AlertTriangle aria-hidden="true" />
      <div>
        <strong>Something went off script.</strong>
        <p>{error instanceof Error ? error.message : 'The request could not be completed.'}</p>
      </div>
      {retry && (
        <button className="button subtle" onClick={retry}>
          Try again
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
