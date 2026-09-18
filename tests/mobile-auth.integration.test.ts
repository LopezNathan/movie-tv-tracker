// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../worker';
import { createPairingCode } from '../worker/lib/auth';
import { drizzle } from 'drizzle-orm/d1';
import { createTestDatabase } from './d1';

let harness: Awaited<ReturnType<typeof createTestDatabase>>;
const mobileEnv = () => ({ ...harness.env, MOBILE_API_HOST: 'api.scene.test' as const });
const request = (path: string, init?: RequestInit) =>
  app.request(`https://api.scene.test${path}`, init, mobileEnv());

beforeEach(async () => {
  harness = await createTestDatabase();
});
afterEach(async () => {
  await harness.dispose();
});

describe('mobile sessions', () => {
  it('consumes a pairing code once and isolates the resulting bearer session', async () => {
    await app.request('https://scene.test/api/me', undefined, harness.env);
    const code = await createPairingCode(drizzle(harness.env.DB), 'dev:owner@example.test');
    const exchange = await request('/api/mobile/sessions/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    expect(exchange.status).toBe(201);
    const tokens = await exchange.json<{ accessToken: string; refreshToken: string }>();
    expect((await request('/api/dashboard')).status).toBe(401);
    expect(
      (
        await request('/api/dashboard', {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request('/api/mobile/sessions/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        })
      ).status,
    ).toBe(401);
  });

  it('rotates refresh credentials and revokes the current session', async () => {
    await app.request('https://scene.test/api/me', undefined, harness.env);
    const code = await createPairingCode(drizzle(harness.env.DB), 'dev:owner@example.test');
    const initial = await (
      await request('/api/mobile/sessions/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
    ).json<{ accessToken: string; refreshToken: string }>();
    const refreshed = await (
      await request('/api/mobile/sessions/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: initial.refreshToken }),
      })
    ).json<{ accessToken: string; refreshToken: string }>();
    expect(
      (
        await request('/api/mobile/sessions/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: initial.refreshToken }),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request('/api/mobile/sessions/current', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${refreshed.accessToken}` },
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await request('/api/dashboard', {
          headers: { Authorization: `Bearer ${refreshed.accessToken}` },
        })
      ).status,
    ).toBe(401);
  });
});
