# Scene

A private, installable movie and television tracker. Scene keeps watch history, ratings, watchlists, and episode progress in a Cloudflare D1 database and uses TMDB for catalog metadata.

![Scene dashboard](public/scene-dashboard.png)

## Requirements

- Node.js 22 or newer
- A free Cloudflare account for production
- A TMDB API read-access token

## Local development

```sh
npm ci
cp .dev.vars.example .dev.vars
# Add your TMDB token and email to .dev.vars
npm run db:migrate:local
npm run dev
```

The local app is available at `http://localhost:5173`. The development identity override is accepted only when `ENVIRONMENT=development`.

## Commands

```sh
npm run dev          # local Cloudflare/Vite runtime
npm run build        # type-check and production build
npm run lint         # static analysis
npm run test         # unit and integration tests
npm run test:e2e     # Playwright browser tests
npm run check        # all non-browser verification
```

For the complete verification suite on a fresh clone:

```sh
npx playwright install chromium
npm run check
npm run test:e2e
```

Vitest runs unit tests plus API integration tests against isolated Miniflare D1 databases. Playwright starts the local Worker and covers the primary desktop and mobile navigation journeys.

## Production

Two deployment paths are supported:

- [Cloudflare Workers](./DEPLOYMENT.md) with hosted D1 and Cloudflare Access.
- [Docker with Tailscale](./DOCKER.md) with persistent local D1 storage and private tailnet access.
- [Docker with Cloudflare Tunnel](./CLOUDFLARE.md) with persistent local D1 storage, a custom hostname, and Cloudflare Access.

No live resources are provisioned by this repository.

## Offline behavior

Scene precaches its application shell and keeps recently read dashboard, history, watchlist, media details, and artwork available offline. Search, imports, and all writes stay online-only; a failed write is never queued for later. Clear device-local caches from Settings at any time.

## Privacy

The production Worker is designed to sit behind Cloudflare Access. Secrets, local databases, build output, and personal exports are excluded from Git.
