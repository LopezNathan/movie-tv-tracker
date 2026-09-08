export type AccessIdentity = {
  sub?: string;
  email?: string;
};

export type Bindings = {
  DB: D1Database;
  ENVIRONMENT: 'development' | 'production' | 'test';
  DEV_USER_EMAIL?: string;
  TMDB_API_TOKEN?: string;
};

export type Variables = {
  user: { id: string; email: string };
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
