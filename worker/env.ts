export type AccessIdentity = {
  sub?: string;
  email?: string;
};

export type Bindings = {
  DB: D1Database;
  ASSETS?: Fetcher;
  ENVIRONMENT: 'development' | 'production' | 'test';
  AUTH_MODE?: 'cloudflare-access' | 'tailnet-single-user';
  APP_USER_EMAIL?: string;
  DEV_USER_EMAIL?: string;
  TMDB_API_TOKEN?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  CF_ACCESS_JWKS_B64?: string;
  /** Hostname intentionally excluded from Cloudflare Access, e.g. api.scene.nathanlopez.com. */
  MOBILE_API_HOST?: string;
  /** Access-protected browser hostname used when redirecting accidental API-host navigations. */
  BROWSER_APP_HOST?: string;
};

export type Variables = {
  user: { id: string; email: string };
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
