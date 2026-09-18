import { drizzle } from 'drizzle-orm/d1';
import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { Jwt } from 'hono/utils/jwt';
import { mobilePairingCodes, mobileSessions, users } from '../db/schema';
import type { AccessIdentity, AppEnv } from '../env';

type Database = ReturnType<typeof drizzle>;
type AuthenticatedUser = { id: string; email: string };
export type MobileTokens = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
};

const encoder = new TextEncoder();
const ACCESS_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const REFRESH_TTL_MS = 1000 * 60 * 60 * 24 * 90;

function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function tokenHash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createMobileSession(db: Database, userId: string): Promise<MobileTokens> {
  const now = new Date();
  const accessToken = token();
  const refreshToken = token();
  const accessExpiresAt = new Date(now.getTime() + ACCESS_TTL_MS).toISOString();
  const refreshExpiresAt = new Date(now.getTime() + REFRESH_TTL_MS).toISOString();
  await db.insert(mobileSessions).values({
    id: crypto.randomUUID(),
    userId,
    accessTokenHash: await tokenHash(accessToken),
    refreshTokenHash: await tokenHash(refreshToken),
    accessExpiresAt,
    refreshExpiresAt,
    revokedAt: null,
    createdAt: now.toISOString(),
    lastUsedAt: now.toISOString(),
  });
  return { accessToken, refreshToken, accessExpiresAt, refreshExpiresAt };
}

export async function createPairingCode(db: Database, userId: string) {
  const value = token();
  const now = new Date();
  await db.insert(mobilePairingCodes).values({
    id: crypto.randomUUID(),
    codeHash: await tokenHash(value),
    userId,
    expiresAt: new Date(now.getTime() + 1000 * 60 * 5).toISOString(),
    consumedAt: null,
    createdAt: now.toISOString(),
  });
  return value;
}

export async function exchangePairingCode(db: Database, code: string) {
  const now = new Date().toISOString();
  const row = await db
    .update(mobilePairingCodes)
    .set({ consumedAt: now })
    .where(
      and(
        eq(mobilePairingCodes.codeHash, await tokenHash(code)),
        isNull(mobilePairingCodes.consumedAt),
        gt(mobilePairingCodes.expiresAt, now),
      ),
    )
    .returning({ userId: mobilePairingCodes.userId });
  return row[0] ? createMobileSession(db, row[0].userId) : null;
}

export async function rotateMobileSession(db: Database, refreshToken: string) {
  const now = new Date();
  const row = await db
    .select()
    .from(mobileSessions)
    .where(eq(mobileSessions.refreshTokenHash, await tokenHash(refreshToken)))
    .get();
  if (!row || row.revokedAt || row.refreshExpiresAt <= now.toISOString()) return null;
  // One-time refresh: revoke the old credential before issuing the rotated pair.
  await db.update(mobileSessions).set({ revokedAt: now.toISOString() }).where(eq(mobileSessions.id, row.id));
  return createMobileSession(db, row.userId);
}

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
  const mobileHost = c.env.MOBILE_API_HOST?.toLowerCase();
  const requestHost = new URL(c.req.url).hostname.toLowerCase();
  if (mobileHost && requestHost === mobileHost) {
    const bearer = c.req.header('Authorization')?.match(/^Bearer +(.+)$/i)?.[1];
    if (!bearer) throw new HTTPException(401, { message: 'A mobile session is required.' });
    const now = new Date().toISOString();
    const session = await drizzle(c.env.DB)
      .select({ id: mobileSessions.id, userId: mobileSessions.userId, email: users.email })
      .from(mobileSessions)
      .innerJoin(users, eq(mobileSessions.userId, users.id))
      .where(
        and(
          eq(mobileSessions.accessTokenHash, await tokenHash(bearer)),
          isNull(mobileSessions.revokedAt),
          gt(mobileSessions.accessExpiresAt, now),
        ),
      )
      .get();
    if (!session) throw new HTTPException(401, { message: 'This mobile session has expired or been revoked.' });
    const db = drizzle(c.env.DB);
    await db.update(mobileSessions).set({ lastUsedAt: now }).where(eq(mobileSessions.id, session.id));
    c.set('user', { id: session.userId, email: session.email });
    await next();
    return;
  }
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
