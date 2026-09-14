import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileArchive, LoaderCircle, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { NormalizedImportItem } from '../../shared/types';
import { api, json } from '../lib/api';
import { importStore, type PendingImport } from '../lib/import-store';
import { parseTraktExport, type ParsedTraktExport } from '../lib/trakt-import';

type ImportRun = {
  id: string;
  filename: string | null;
  status: 'pending' | 'running' | 'complete' | 'failed';
  totalItems: number;
  processedItems: number;
  importedItems: number;
  skippedItems: number;
  issueCount: number;
};

type ImportIssue = {
  id: string;
  reason: string;
  payload: string;
};

function issueItem(issue: ImportIssue) {
  try {
    return JSON.parse(issue.payload) as NormalizedImportItem;
  } catch {
    return { kind: 'movie', title: 'Unreadable import record' } as NormalizedImportItem;
  }
}

// A new TV series can require hydrating every episode before its first watch is saved.
// Keep import requests small enough to stay within Worker and D1 per-request limits.
const batchSize = 5;

async function createRun(filename: string, items: NormalizedImportItem[]) {
  const { run } = await api<{ run: ImportRun }>(
    '/api/imports',
    json('POST', { source: 'trakt', filename, totalItems: items.length }),
  );
  return { runId: run.id, filename, items, nextIndex: 0 } satisfies PendingImport;
}

export function ImportPage() {
  const [preview, setPreview] = useState<ParsedTraktExport | null>(null);
  const [filename, setFilename] = useState('');
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void importStore.get().then((saved) => saved && setPending(saved));
  }, []);

  const progress = pending ? Math.round((pending.nextIndex / pending.items.length) * 100) : 0;

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      setPreview(await parseTraktExport(file));
      setFilename(file.name);
    } catch (cause) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : 'Could not read that export.');
    } finally {
      setBusy(false);
    }
  }

  async function runImport(initial?: PendingImport) {
    if (!navigator.onLine) {
      setError('Reconnect to start or resume an import.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      let current = initial;
      if (!current) {
        if (!preview) return;
        current = await createRun(filename, preview.items);
        await importStore.save(current);
        setPending(current);
      }
      while (current.nextIndex < current.items.length) {
        const items = current.items.slice(current.nextIndex, current.nextIndex + batchSize);
        await api(`/api/imports/${current.runId}/batches`, json('POST', { items }));
        current = { ...current, nextIndex: current.nextIndex + items.length };
        await importStore.save(current);
        setPending(current);
      }
      await api(`/api/imports/${current.runId}/finalize`, json('POST'));
      await importStore.clear();
      window.location.assign(`/import/${current.runId}/review`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Import paused. You can resume safely.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <header>
        <p className="eyebrow">Bring your history</p>
        <h1>Import from Trakt.</h1>
        <p className="lede">
          Your ZIP is unpacked in this browser. Only normalized history, ratings, and watchlist
          records are sent to your private Worker.
        </p>
      </header>
      {pending ? (
        <section className="panel import-progress" aria-live="polite">
          <FileArchive aria-hidden="true" />
          <div className="grow">
            <strong>Resume {pending.filename}</strong>
            <p>
              {pending.nextIndex.toLocaleString()} of {pending.items.length.toLocaleString()}{' '}
              records processed
            </p>
            <div className="progress-track">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void runImport(pending)}
          >
            {busy ? <LoaderCircle className="spin" /> : null} Resume
          </button>
        </section>
      ) : (
        <label className="upload-zone">
          {busy ? <LoaderCircle className="spin" size={30} /> : <Upload size={30} />}
          <strong>Choose your Trakt account export ZIP</strong>
          <span>No file leaves the browser until you approve the preview.</span>
          <input
            type="file"
            accept=".zip,application/zip"
            disabled={busy}
            onChange={(event) => void chooseFile(event.target.files?.[0])}
          />
        </label>
      )}
      {error ? (
        <div className="notice error">
          <AlertTriangle /> {error}
        </div>
      ) : null}
      {preview && !pending ? (
        <section className="panel preview-panel">
          <div>
            <p className="eyebrow">Ready to import</p>
            <h2>{preview.items.length.toLocaleString()} records</h2>
            <p className="muted">From {preview.files.length} supported export files.</p>
          </div>
          <div className="import-counts">
            <span>
              <strong>{preview.counts.watch}</strong> watches
            </span>
            <span>
              <strong>{preview.counts.rating}</strong> ratings
            </span>
            <span>
              <strong>{preview.counts.watchlist}</strong> watchlist
            </span>
          </div>
          {preview.warnings.map((warning) => (
            <p className="notice" key={warning}>
              {warning}
            </p>
          ))}
          <button className="button primary" disabled={busy} onClick={() => void runImport()}>
            Import these records
          </button>
        </section>
      ) : null}
    </div>
  );
}

export function ImportReviewPage() {
  const { id = '' } = useParams();
  const query = useQuery({
    queryKey: ['import', id],
    queryFn: () => api<{ run: ImportRun; issues: ImportIssue[] }>(`/api/imports/${id}`),
  });
  const parsed = useMemo(
    () => (query.data?.issues ?? []).map((issue) => ({ ...issue, item: issueItem(issue) })),
    [query.data?.issues],
  );
  if (query.isLoading)
    return (
      <div className="loading-line">
        <LoaderCircle className="spin" /> Loading import…
      </div>
    );
  if (query.isError)
    return (
      <div className="notice error">
        <AlertTriangle /> {query.error.message}
      </div>
    );
  const run = query.data!.run;
  return (
    <div className="page-stack wide">
      <header>
        <p className="eyebrow">Import complete</p>
        <h1>Review the results.</h1>
        <p className="lede">
          Imported {run.importedItems.toLocaleString()} records and kept{' '}
          {run.issueCount.toLocaleString()}
          unresolved matches for review. Re-importing is safe.
        </p>
      </header>
      {!parsed.length ? (
        <div className="empty-state">
          <div>
            <CheckCircle2 />
            <strong>Everything matched</strong>
            <p>No manual review is needed.</p>
          </div>
        </div>
      ) : (
        <section className="content-section">
          <h2>Needs review</h2>
          <div className="issue-list">
            {parsed.map(({ id: issueId, reason, item }) => (
              <article className="panel issue-row" key={issueId}>
                <AlertTriangle aria-hidden="true" />
                <div>
                  <strong>{item.showTitle ?? item.title}</strong>
                  <p>
                    {item.kind} · {item.year ?? 'year unknown'} · {reason}
                  </p>
                </div>
              </article>
            ))}
          </div>
          <p className="muted">
            Ambiguous records are never matched automatically. Manual resolution is intentionally
            read-only in this first release.
          </p>
        </section>
      )}
      <Link className="button secondary" to="/import">
        Import another export
      </Link>
    </div>
  );
}
