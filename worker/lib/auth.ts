import { drizzle } from 'drizzle-orm/d1';
import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { users } from '../db/schema';
import type { AccessIdentity, AppEnv } from '../env';

type AccessContext = {
  access?: { getIdentity(): Promise<AccessIdentity | null> };
};

export async function requireUser(c: Context<AppEnv>, next: Next) {
  const executionContext = c.executionCtx as unknown as AccessContext;
  const identity = await executionContext.access?.getIdentity();
  const devEmail = c.env.ENVIRONMENT !== 'production' ? c.env.DEV_USER_EMAIL : undefined;
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
