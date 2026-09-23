# Cloudflare deployment

Scene is deployed to Cloudflare Workers at `scene.nathanlopez.com`, backed by D1 and protected by Cloudflare Access. The repository contains the non-secret resource identifiers needed by Wrangler, while credentials remain in Cloudflare and GitHub secrets.

## 1. Prerequisites

- Node.js 22 or newer
- A Cloudflare account with Workers and Zero Trust enabled
- A TMDB API read-access token from a personal, non-commercial TMDB developer account
- Wrangler authenticated locally with `npx wrangler login`

## 2. D1

The production `movie-tv-tracker` database is already bound in `wrangler.jsonc`. Apply any pending migrations before deploying code that depends on them:

```sh
npm run db:migrate:remote
```

To provision a replacement database, create it and update the non-secret `database_id` in `wrangler.jsonc`:

```sh
npx wrangler d1 create movie-tv-tracker
```

## 3. Add the TMDB secret

```sh
npx wrangler secret put TMDB_API_TOKEN
```

Paste the TMDB API read-access token at the prompt. Keep `.dev.vars` local for development; it is ignored by Git.

## 4. Deploy manually

Review the production build, then deploy:

```sh
npm run check
npm run deploy
```

Wrangler deploys the Worker and static assets to `https://scene.nathanlopez.com`. The `workers.dev` and preview URLs are disabled.

## 5. Protect the application with Cloudflare Access

Cloudflare Zero Trust has a self-hosted Access application for `scene.nathanlopez.com`. The
`api.scene.nathanlopez.com` route points to the same Worker but must remain outside Access so the
iPhone companion and signed Plex webhook URLs can reach it.

1. Add a policy whose action is **Allow**.
2. Include only the email address that should own this library.
3. Set the session duration you prefer and save the application.
4. Keep the application's **AUD tag** synchronized with `CF_ACCESS_AUD` in `wrangler.jsonc`.
5. Keep the Zero Trust team domain synchronized with `CF_ACCESS_TEAM_DOMAIN`.
6. Open the custom domain in a private browser window and confirm that Access challenges before Scene loads.

Do not add `api.scene.nathanlopez.com` to the Access application. Keep that hostname synchronized
with `MOBILE_API_HOST` in `wrangler.jsonc`; its mobile endpoints use bearer credentials and its Plex
endpoint uses a generated 256-bit URL secret.

The Worker validates Cloudflare's signed `Cf-Access-Jwt-Assertion` and uses the stable Access subject as `user_id`. `DEV_USER_EMAIL` is accepted only when `ENVIRONMENT=development`; never set that variable in production.

## 6. Deploy from GitHub Actions

Pushes to `main` run the complete CI suite. After it passes, the `Deploy to Cloudflare` job applies pending D1 migrations and deploys the exact tested revision.

Create a Cloudflare API token scoped to this account, Worker, D1 database, and custom domain, then add these GitHub Actions repository secrets:

- `CLOUDFLARE_API_TOKEN`: the Cloudflare API token; it needs permission to edit Workers scripts and D1, plus the zone permissions required to maintain the custom domain.
- `CLOUDFLARE_ACCOUNT_ID`: `c403778a850d9f61a15dd8e7caf4646d`

The TMDB token is a Worker secret stored in Cloudflare and is not passed through GitHub. A normal Worker deployment preserves it.

Optionally add protection rules to the GitHub `production` environment if deployments should require approval. The workflow exposes `https://scene.nathanlopez.com` as the environment URL.

## 7. Verify and operate

After Access succeeds:

- Open `/api/health` and confirm `{"ok":true,"environment":"production"}`.
- Search for one title to verify TMDB access.
- Add and remove it from the watchlist to verify D1 writes.
- In Settings, generate a Plex webhook URL, add it under Plex Account → Webhooks, and play a test
  item past Plex's watched threshold.
- Install the PWA and revisit the dashboard offline to verify cached read-only data.
- Use Settings → Download JSON periodically for a portable backup.

For routine releases, merge or push a reviewed revision to `main` and monitor the CI workflow. Manual deployment remains available using the commands above.

## Security notes

- Never commit `.dev.vars`, `.env` files, Wrangler state, D1 files, TMDB tokens, or Trakt exports.
- Treat generated Plex webhook URLs as credentials. Rotating or disconnecting the integration
  invalidates the previous URL.
- Mutations, search, and imports require a live network connection and are not queued by the service worker.
- The PWA caches only the app shell, TMDB artwork, and successful reads for dashboard/history/library/media endpoints. Settings can clear those device-local caches.
- This product uses the TMDB API but is not endorsed or certified by TMDB.
