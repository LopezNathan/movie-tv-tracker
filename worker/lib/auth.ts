import { drizzle } from 'drizzle-orm/d1';
import { eq, ne } from 'drizzle-orm';
import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { Jwt } from 'hono/utils/jwt';
import { users } from '../db/schema';
import type { AccessIdentity, AppEnv } from '../env';

type Database = ReturnType<typeof drizzle>;
type AuthenticatedUser = { id: string; email: string };

export async function syncAuthenticatedUser(db: Database, user: AuthenticatedUser) {
  const existing = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, user.id))
    .get();

  if (existing) {
    if (existing.email !== user.email) {
      await db.update(users).set({ email: user.email }).where(eq(users.id, user.id));
    }
    return;
  }

  await db
    .insert(users)
    .values({ ...user, createdAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: user.email },
      setWhere: ne(users.email, user.email),
    });
}

async function verifiedAccessIdentity(c: Context<AppEnv>): Promise<AccessIdentity | null> {
  const token = c.req.header('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  const teamDomain = c.env.CF_ACCESS_TEAM_DOMAIN?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const audience = c.env.CF_ACCESS_AUD;
  const encodedKeys = c.env.CF_ACCESS_JWKS_B64;
  if (!teamDomain || !audience) {
    throw new HTTPException(503, { message: 'Cloudflare Access validation is not configured.' });
  }
  try {
    const keys = encodedKeys
      ? (JSON.parse(atob(encodedKeys)) as NonNullable<
          Parameters<typeof Jwt.verifyWithJwks>[1]['keys']
        >)
      : undefined;
    const payload = await Jwt.verifyWithJwks(token, {
      ...(keys ? { keys } : { jwks_uri: `https://${teamDomain}/cdn-cgi/access/certs` }),
      allowedAlgorithms: ['RS256'],
      verification: { iss: `https://${teamDomain}`, aud: audience },
    });
    return {
      sub: typeof payload.sub === 'string' ? payload.sub : undefined,
      email: typeof payload.email === 'string' ? payload.email : undefined,
    };
  } catch (error) {
    console.warn(
      'Cloudflare Access token validation failed:',
      error instanceof Error ? error.message : 'Unknown validation error',
    );
    throw new HTTPException(401, { message: 'Cloudflare Access token is invalid.' });
  }
}

export async function requireUser(c: Context<AppEnv>, next: Next) {
  const production = c.env.ENVIRONMENT === 'production';
  const tailnetSingleUser = c.env.AUTH_MODE === 'tailnet-single-user';
  const identity = production && !tailnetSingleUser ? await verifiedAccessIdentity(c) : null;
  const localEmail = tailnetSingleUser
    ? c.env.APP_USER_EMAIL
    : !production
      ? c.env.DEV_USER_EMAIL
      : undefined;
  const email = identity?.email ?? localEmail;
  const subject =
    identity?.sub ??
    (tailnetSingleUser && localEmail
      ? 'tailnet:single-user'
      : localEmail
        ? `dev:${localEmail.toLowerCase()}`
        : undefined);

  if (!email || !subject) {
    throw new HTTPException(401, { message: 'Authentication is required.' });
  }

  const user = { id: subject, email: email.toLowerCase() };
  const db = drizzle(c.env.DB);
  await syncAuthenticatedUser(db, user);
  c.set('user', user);
  await next();
}
