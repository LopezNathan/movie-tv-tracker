import { drizzle } from 'drizzle-orm/d1';
import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { Jwt } from 'hono/utils/jwt';
import { users } from '../db/schema';
import type { AccessIdentity, AppEnv } from '../env';

async function verifiedAccessIdentity(c: Context<AppEnv>): Promise<AccessIdentity | null> {
  const token = c.req.header('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  const teamDomain = c.env.CF_ACCESS_TEAM_DOMAIN?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const audience = c.env.CF_ACCESS_AUD;
  if (!teamDomain || !audience) {
    throw new HTTPException(503, { message: 'Cloudflare Access validation is not configured.' });
  }
  try {
    const payload = await Jwt.verifyWithJwks(token, {
      jwks_uri: `https://${teamDomain}/cdn-cgi/access/certs`,
      allowedAlgorithms: ['RS256'],
      verification: { iss: `https://${teamDomain}`, aud: audience },
    });
    return {
      sub: typeof payload.sub === 'string' ? payload.sub : undefined,
      email: typeof payload.email === 'string' ? payload.email : undefined,
    };
  } catch {
    throw new HTTPException(401, { message: 'Cloudflare Access token is invalid.' });
  }
}

export async function requireUser(c: Context<AppEnv>, next: Next) {
  const production = c.env.ENVIRONMENT === 'production';
  const identity = production ? await verifiedAccessIdentity(c) : null;
  const devEmail = !production ? c.env.DEV_USER_EMAIL : undefined;
  const email = identity?.email ?? devEmail;
  const subject = identity?.sub ?? (devEmail ? `dev:${devEmail.toLowerCase()}` : undefined);

  if (!email || !subject) {
    throw new HTTPException(401, { message: 'Authentication is required.' });
  }

  const user = { id: subject, email: email.toLowerCase() };
  const db = drizzle(c.env.DB);
  await db
    .insert(users)
    .values({ ...user, createdAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: users.id, set: { email: user.email } });
  c.set('user', user);
  await next();
}
