import { CloudOff } from 'lucide-react';
import { useOnlineStatus } from '../lib/connectivity';

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      <CloudOff size={16} aria-hidden="true" /> Offline — previously loaded pages are read-only.
    </div>
  );
}
