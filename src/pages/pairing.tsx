import { useEffect, useState } from 'react';

/**
 * A deliberately minimal Access-protected bridge for ASWebAuthenticationSession.
 * Keeping this navigation out of /api prevents a previously installed PWA service
 * worker from returning the Scene app shell instead of the native callback.
 */
export function PairingPage() {
  const state = new URLSearchParams(window.location.search).get('state');
  const validState = Boolean(state && /^[0-9a-f-]{36}$/i.test(state));
  const [message, setMessage] = useState(() =>
    validState
      ? 'Finishing secure pairing…'
      : 'This pairing request is invalid. Return to Scene and try again.',
  );

  useEffect(() => {
    if (!validState || !state) return;
    void fetch('/api/mobile/pair-code', { method: 'POST' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to create a pairing code.');
        return response.json() as Promise<{ code: string }>;
      })
      .then(({ code }) => {
        const callback = new URL('scene://auth');
        callback.searchParams.set('code', code);
        callback.searchParams.set('state', state);
        window.location.replace(callback.toString());
      })
      .catch(() => setMessage('Pairing could not be completed. Return to Scene and try again.'));
  }, [state, validState]);

  return (
    <main className="main-content" aria-live="polite">
      <h1>Scene pairing</h1>
      <p>{message}</p>
    </main>
  );
}
