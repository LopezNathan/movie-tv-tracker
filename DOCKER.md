# Docker and Tailscale deployment

This deployment runs Scene's Worker and D1 database locally in Docker, then publishes it privately with Tailscale Serve. It is a single-user setup: Scene trusts the tailnet boundary and assigns every request the identity in `APP_USER_EMAIL`.

Do not publish the `scene` container port to the public internet. The Compose file binds it to the host's loopback interface for local access and exposes it to the private Docker network for Tailscale Serve. Funnel is explicitly disabled. If other people use your tailnet, restrict this node (or its advertised tag) to your own devices or user identity in the tailnet access policy.

## Prerequisites

- Docker Engine with Docker Compose
- A Tailscale tailnet with MagicDNS and HTTPS certificates enabled
- A Tailscale auth key for the container's first login
- A TMDB API read-access token

## Start Scene

Copy the environment template and fill in its values:

```sh
cp .env.example .env
docker compose up -d --build
```

Use a one-off, preferably pre-authorized Tailscale auth key. If your tailnet uses tags, set `TS_EXTRA_ARGS` to an advertised tag whose ownership is allowed by your tailnet policy. The key is needed for the first login; the `tailscale-state` volume preserves the node identity across restarts. After a successful login, you can blank `TS_AUTHKEY` in `.env` and recreate the container.

Check startup and discover the assigned tailnet hostname:

```sh
docker compose ps
docker compose logs tailscale
docker compose exec tailscale tailscale status
```

Open `https://scene.<your-tailnet>.ts.net` (or the fully qualified MagicDNS hostname shown by Tailscale) from a device logged into the same tailnet. Tailscale Serve terminates HTTPS and proxies to Scene inside the Compose network. Funnel is explicitly disabled.

On the Docker host, Scene is also available directly at `http://127.0.0.1:8787`.

To enable automatic Plex tracking, open Scene Settings and generate a webhook URL, then add it in
Plex Web under Settings → Account → Webhooks. The Plex server must be logged into the same tailnet
and able to resolve and reach Scene's HTTPS MagicDNS name. Plex webhooks require Plex Pass.

## Data and upgrades

The `scene-data` volume contains the local D1 state. Migrations run automatically before every start and are safe to re-run. The `tailscale-state` volume contains the Tailscale node identity.

Upgrade with:

```sh
git pull
docker compose up -d --build
```

Before host maintenance, use Settings → Download JSON for a portable application backup. For a volume-level backup, stop the stack first and back up the `scene-data` Docker volume with your normal Docker volume backup tooling.

To stop without deleting either volume:

```sh
docker compose down
```

Do not add `--volumes` unless you intend to erase both the local D1 database and the Tailscale node state.

## Troubleshooting

- If the Tailscale container cannot authenticate, create a new auth key, put it in `.env`, and run `docker compose up -d` again.
- If the HTTPS name does not resolve, confirm that MagicDNS and HTTPS certificates are enabled, then inspect `docker compose logs tailscale`.
- If Scene is unhealthy, inspect `docker compose logs scene`. Missing `APP_USER_EMAIL` or `TMDB_API_TOKEN` values cause an intentional startup failure.
- To change the Scene owner email without changing ownership of existing records, update `APP_USER_EMAIL` and recreate the container. The internal single-user ID remains stable.
