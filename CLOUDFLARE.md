# Docker with Cloudflare Tunnel and Access

This deployment publishes the local Docker application at a Cloudflare-managed hostname without opening an inbound port. Cloudflare Access authenticates the user, and Scene independently validates the Access JWT at the origin.

## Cloudflare configuration

1. Create a remotely managed Cloudflare Tunnel and copy its connector token.
2. Add public hostnames for both `scene.nathanlopez.com` and `api.scene.nathanlopez.com`; map both
   to `http://scene:8787`.
3. Create a self-hosted Access application for `scene.nathanlopez.com`.
4. Add an Allow policy containing only the Scene owner's email address.
5. Copy the Access team domain and application AUD tag into `.env` along with the tunnel token.
   Keep the API hostname outside the Access application; mobile bearer authentication and Plex's
   generated webhook secret protect its exposed routes.

```dotenv
AUTH_MODE=cloudflare-access
CF_TUNNEL_TOKEN=replace-with-the-tunnel-token
CF_ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
CF_ACCESS_AUD=replace-with-the-application-aud-tag
MOBILE_API_HOST=api.scene.nathanlopez.com
```

Start the Cloudflare deployment:

```sh
docker compose --profile cloudflare up -d --build
```

After `https://scene.nathanlopez.com` passes an authenticated end-to-end check, stop the optional Tailscale sidecar:

```sh
docker compose stop tailscale
```

The app remains available on the Docker host at `http://127.0.0.1:8787`, but protected API routes require a valid Cloudflare Access assertion while Cloudflare authentication mode is active.
