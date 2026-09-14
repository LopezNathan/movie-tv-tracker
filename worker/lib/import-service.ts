import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { NormalizedImportItem } from '../../shared/types';
import {
  importBatchReceipts,
  importIssues,
  importRuns,
  listEntries,
  media,
  ratings,
  watchEvents,
} from '../db/schema';
import type { Bindings } from '../env';
import { ensureEpisode, ensureMedia } from './media-service';
import { findTmdb, searchTmdb } from './tmdb';

type Resolution = { mediaId?: string; reason?: 'unresolved' | 'ambiguous' | 'invalid' };

function normalizeTitle(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function externalMatch(env: Bindings, item: NormalizedImportItem, kind: 'movie' | 'show') {
  const id = item.imdbId ?? (item.tvdbId ? String(item.tvdbId) : undefined);
  if (!id) return [];
  const found = await findTmdb(env, id, item.imdbId ? 'imdb_id' : 'tvdb_id');
  return kind === 'movie' ? found.movie_results : found.tv_results;
}

async function resolveTitle(
  env: Bindings,
  item: NormalizedImportItem,
  kind: 'movie' | 'show',
): Promise<Resolution> {
  if (item.tmdbId) {
    const saved = await ensureMedia(env, kind, item.tmdbId, { hydrateEpisodes: false });
    return { mediaId: saved.id };
  }
  const external = await externalMatch(env, item, kind);
  if (external.length === 1) {
    const saved = await ensureMedia(env, kind, external[0].id, { hydrateEpisodes: false });
    return { mediaId: saved.id };
  }
  if (external.length > 1) return { reason: 'ambiguous' };

  const results = await searchTmdb(env, item.title, 1);
  const title = normalizeTitle(item.title);
  const candidates = results.results.filter(
    (result) =>
      result.kind === kind &&
      (normalizeTitle(result.title) === title ||
        normalizeTitle(result.originalTitle ?? '') === title) &&
      (!item.year || !result.releaseYear || result.releaseYear === item.year),
  );
  if (candidates.length !== 1) return { reason: candidates.length ? 'ambiguous' : 'unresolved' };
  const saved = await ensureMedia(env, kind, candidates[0].tmdbId, { hydrateEpisodes: false });
  return { mediaId: saved.id };
}

async function resolveEpisode(env: Bindings, item: NormalizedImportItem): Promise<Resolution> {
  const db = drizzle(env.DB);
  if (item.tmdbId) {
    const existing = await db
      .select({ id: media.id })
      .from(media)
      .where(and(eq(media.kind, 'episode'), eq(media.tmdbId, item.tmdbId)))
      .get();
    if (existing) return { mediaId: existing.id };
  }

  let showTmdbId = item.showTmdbId;
  let seasonNumber = item.seasonNumber;
  let episodeNumber = item.episodeNumber;
  const externalId = item.imdbId ?? (item.tvdbId ? String(item.tvdbId) : undefined);
  if (!showTmdbId && externalId) {
    const found = await findTmdb(env, externalId, item.imdbId ? 'imdb_id' : 'tvdb_id');
    if (found.tv_episode_results.length === 1) {
      const match = found.tv_episode_results[0];
      showTmdbId = match.show_id;
      seasonNumber = match.season_number;
      episodeNumber = match.episode_number;
    }
  }

  if (!showTmdbId && item.showTitle) {
    const showResolution = await resolveTitle(
      env,
      {
        ...item,
        kind: 'show',
        title: item.showTitle,
        year: item.showYear,
        tmdbId: item.showTmdbId,
        imdbId: item.showImdbId,
        tvdbId: item.showTvdbId,
      },
      'show',
    );
    if (showResolution.mediaId) {
      const show = await db.select().from(media).where(eq(media.id, showResolution.mediaId)).get();
      showTmdbId = show?.tmdbId;
    } else {
      return showResolution;
    }
  }
  if (!showTmdbId || seasonNumber === undefined || episodeNumber === undefined) {
    return { reason: 'unresolved' };
  }
  const episode = await ensureEpisode(env, showTmdbId, seasonNumber, episodeNumber);
  return episode ? { mediaId: episode.id } : { reason: 'unresolved' };
}

async function resolveItem(env: Bindings, item: NormalizedImportItem) {
  if (item.kind === 'episode') return resolveEpisode(env, item);
  return resolveTitle(env, item, item.kind);
}

async function applyItem(
  env: Bindings,
  userId: string,
  item: NormalizedImportItem,
  mediaId: string,
) {
  const db = drizzle(env.DB);
  const now = new Date().toISOString();
  if (item.action === 'watch') {
    const rows = await db
      .insert(watchEvents)
      .values({
        id: crypto.randomUUID(),
        userId,
        mediaId,
        watchedAt: item.watchedAt ?? now,
        source: 'trakt',
        sourceEventKey: item.sourceEventId ?? item.fingerprint,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: watchEvents.id });
    return rows.length > 0;
  }
  if (item.action === 'rating') {
    await db
      .insert(ratings)
      .values({
        id: crypto.randomUUID(),
        userId,
        mediaId,
        rating: item.rating!,
        ratedAt: item.ratedAt ?? now,
        source: 'trakt',
      })
      .onConflictDoUpdate({
        target: [ratings.userId, ratings.mediaId],
        set: { rating: item.rating!, ratedAt: item.ratedAt ?? now, source: 'trakt' },
      });
    return true;
  }
  await db
    .insert(listEntries)
    .values({
      id: crypto.randomUUID(),
      userId,
      mediaId,
      list: 'watchlist',
      addedAt: item.addedAt ?? now,
      source: 'trakt',
    })
    .onConflictDoUpdate({
      target: [listEntries.userId, listEntries.mediaId, listEntries.list],
      set: { addedAt: item.addedAt ?? now, source: 'trakt' },
    });
  return true;
}

export async function processImportBatch(
  env: Bindings,
  userId: string,
  runId: string,
  items: NormalizedImportItem[],
  batchId?: string,
) {
  const db = drizzle(env.DB);
  const run = await db
    .select()
    .from(importRuns)
    .where(and(eq(importRuns.id, runId), eq(importRuns.userId, userId)))
    .get();
  if (!run) return null;

  if (batchId) {
    const receipt = await db
      .select()
      .from(importBatchReceipts)
      .where(and(eq(importBatchReceipts.id, batchId), eq(importBatchReceipts.importRunId, runId)))
      .get();
    if (receipt) {
      return {
        processed: receipt.itemCount,
        imported: receipt.importedItems,
        skipped: receipt.skippedItems,
        issues: receipt.issueCount,
        duplicate: true,
      };
    }
  }

  let imported = 0;
  let skipped = 0;
  let issues = 0;
  for (const item of items) {
    try {
      const resolution = await resolveItem(env, item);
      if (!resolution.mediaId) {
        const inserted = await db
          .insert(importIssues)
          .values({
            id: crypto.randomUUID(),
            importRunId: runId,
            fingerprint: item.fingerprint,
            reason: resolution.reason ?? 'unresolved',
            payload: JSON.stringify(item),
            createdAt: new Date().toISOString(),
          })
          .onConflictDoNothing()
          .returning({ id: importIssues.id });
        issues += inserted.length;
        skipped += 1;
        continue;
      }
      if (await applyItem(env, userId, item, resolution.mediaId)) imported += 1;
      else skipped += 1;
    } catch (error) {
      const inserted = await db
        .insert(importIssues)
        .values({
          id: crypto.randomUUID(),
          importRunId: runId,
          fingerprint: item.fingerprint,
          reason: error instanceof Error ? `provider: ${error.message}` : 'provider error',
          payload: JSON.stringify(item),
          createdAt: new Date().toISOString(),
        })
        .onConflictDoNothing()
        .returning({ id: importIssues.id });
      issues += inserted.length;
      skipped += 1;
    }
  }

  await db
    .update(importRuns)
    .set({
      status: 'running',
      processedItems: sql`${importRuns.processedItems} + ${items.length}`,
      importedItems: sql`${importRuns.importedItems} + ${imported}`,
      skippedItems: sql`${importRuns.skippedItems} + ${skipped}`,
      issueCount: sql`${importRuns.issueCount} + ${issues}`,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(importRuns.id, runId));
  if (batchId) {
    await db.insert(importBatchReceipts).values({
      id: batchId,
      importRunId: runId,
      itemCount: items.length,
      importedItems: imported,
      skippedItems: skipped,
      issueCount: issues,
      createdAt: new Date().toISOString(),
    });
  }
  return { processed: items.length, imported, skipped, issues };
}
