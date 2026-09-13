export type AccessIdentity = {
  sub?: string;
  email?: string;
};

export type Bindings = {
  DB: D1Database;
  ENVIRONMENT: 'development' | 'production' | 'test';
  AUTH_MODE?: 'cloudflare-access' | 'tailnet-single-user';
  APP_USER_EMAIL?: string;
  DEV_USER_EMAIL?: string;
  TMDB_API_TOKEN?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  CF_ACCESS_JWKS_B64?: string;
};

export type Variables = {
  user: { id: string; email: string };
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
