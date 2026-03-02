'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useApiGet } from '@/hooks/useApiGet';
import type { Deck } from '@/types';

/** Card item in export/import payload (content + optional metadata). */
interface ExportCardItem {
  recto: string;
  verso: string;
  comment?: string | null;
  reverse?: boolean;
  recto_formula?: boolean;
  verso_formula?: boolean;
  stability?: number | null;
  difficulty?: number | null;
  next_review?: string | null;
  last_review?: string | null;
  is_important?: boolean;
}

/** Export file shape from backend or user upload. */
interface ExportPayload {
  version?: number;
  exportedAt?: string;
  deckId?: string;
  deckTitle?: string;
  cards: ExportCardItem[];
}

function parseImportFile(json: string): ExportCardItem[] {
  const raw = JSON.parse(json) as unknown;
  if (!raw || typeof raw !== 'object') throw new Error('Invalid JSON');
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.cards)) return obj.cards as ExportCardItem[];
  if (Array.isArray(obj)) return obj as ExportCardItem[];
  throw new Error('File must contain a "cards" array or be an array of cards');
}

export default function ImportExportPage() {
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const { data: decksData } = useApiGet<Deck[]>('/api/decks', { errorFallback: '' });
  const decks = Array.isArray(decksData) ? decksData : [];

  const [exportDeckId, setExportDeckId] = useState('');
  const [exportFormat, setExportFormat] = useState<'content' | 'full'>('full');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const [importDeckId, setImportDeckId] = useState('');
  const [applyMetadata, setApplyMetadata] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    if (!exportDeckId) {
      setExportError(ta('importExportSelectDeck') || 'Select a deck');
      return;
    }
    setExportError('');
    setExporting(true);
    try {
      const res = await apiClient.get<ExportPayload>(
        `/api/decks/${exportDeckId}/cards/export?format=${exportFormat}`
      );
      const payload = res.data;
      if (!payload || !Array.isArray(payload.cards)) {
        setExportError(ta('importExportExportFailed') || 'Export failed');
        return;
      }
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `memoon-export-${(payload.deckTitle || 'deck').replace(/[^a-zA-Z0-9-_]/g, '-')}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(getApiErrorMessage(err, ta('importExportExportFailed') || 'Export failed'));
    } finally {
      setExporting(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!importDeckId) {
      setImportError(ta('importExportSelectDeck') || 'Select a target deck');
      return;
    }
    setImportError('');
    setImportSuccess(null);
    setImporting(true);
    try {
      const text = await file.text();
      const cards = parseImportFile(text);
      if (cards.length === 0) {
        setImportError(ta('importExportNoCards') || 'No cards in file');
        setImporting(false);
        return;
      }
      const res = await apiClient.post<{ success: boolean; data?: unknown[]; count?: number }>(
        `/api/decks/${importDeckId}/cards/import`,
        { cards, options: { applyMetadata } }
      );
      const count = res.data?.count ?? res.data?.data?.length ?? cards.length;
      setImportSuccess(count);
    } catch (err) {
      setImportError(
        getApiErrorMessage(err, ta('importExportImportFailed') || 'Import failed. Check file format.')
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mc-import-export-page mx-auto max-w-2xl space-y-8">
      <div>
        <Link
          href={`/${locale}/app`}
          className="text-sm font-medium text-(--mc-text-secondary) hover:text-(--mc-text-primary)"
        >
          ← {ta('backToDecks')}
        </Link>
        <h2 className="mt-2 text-xl font-semibold text-(--mc-text-primary)">
          {ta('importExportTitle') !== 'importExportTitle' ? ta('importExportTitle') : 'Export / Import cards'}
        </h2>
        <p className="mt-1 text-sm text-(--mc-text-secondary)">
          {ta('importExportIntro') !== 'importExportIntro'
            ? ta('importExportIntro')
            : 'Export a deck as JSON or import cards from a JSON file into a deck.'}
        </p>
      </div>

      {/* Export */}
      <section className="rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-card) p-6 shadow-sm">
        <h3 className="text-sm font-medium text-(--mc-text-primary)">
          {ta('importExportExportTitle') !== 'importExportExportTitle'
            ? ta('importExportExportTitle')
            : 'Export'}
        </h3>
        <p className="mt-1 text-xs text-(--mc-text-secondary)">
          {ta('importExportExportHint') !== 'importExportExportHint'
            ? ta('importExportExportHint')
            : 'Download all cards from a deck as a JSON file. Use "Content only" for sharing or backup without scheduling data; use "Full" to keep stability and next review dates.'}
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="export-deck" className="block text-xs font-medium text-(--mc-text-secondary)">
              {ta('importExportDeck') !== 'importExportDeck' ? ta('importExportDeck') : 'Deck'}
            </label>
            <select
              id="export-deck"
              value={exportDeckId}
              onChange={(e) => setExportDeckId(e.target.value)}
              className="mt-1 w-full rounded border border-(--mc-border-subtle) bg-(--mc-bg-page) px-3 py-2 text-sm text-(--mc-text-primary)"
            >
              <option value="">—</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="export-format" className="block text-xs font-medium text-(--mc-text-secondary)">
              {ta('importExportFormat') !== 'importExportFormat' ? ta('importExportFormat') : 'Format'}
            </label>
            <select
              id="export-format"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as 'content' | 'full')}
              className="mt-1 w-full rounded border border-(--mc-border-subtle) bg-(--mc-bg-page) px-3 py-2 text-sm text-(--mc-text-primary)"
            >
              <option value="content">
                {ta('importExportFormatContent') !== 'importExportFormatContent'
                  ? ta('importExportFormatContent')
                  : 'Content only (recto, verso, comment)'}
              </option>
              <option value="full">
                {ta('importExportFormatFull') !== 'importExportFormatFull'
                  ? ta('importExportFormatFull')
                  : 'Full (with metadata: stability, next review, etc.)'}
              </option>
            </select>
          </div>
          {exportError && (
            <p className="text-sm text-(--mc-accent-danger)" role="alert">
              {exportError}
            </p>
          )}
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || !exportDeckId}
            className="rounded-lg bg-(--mc-accent-primary) px-4 py-2 text-sm font-medium text-white opacity-90 hover:opacity-100 disabled:opacity-50"
          >
            {exporting
              ? (ta('importExportExporting') !== 'importExportExporting' ? ta('importExportExporting') : 'Exporting…')
              : ta('importExportDownload') !== 'importExportDownload'
                ? ta('importExportDownload')
                : 'Download JSON'}
          </button>
        </div>
      </section>

      {/* Import */}
      <section className="rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-card) p-6 shadow-sm">
        <h3 className="text-sm font-medium text-(--mc-text-primary)">
          {ta('importExportImportTitle') !== 'importExportImportTitle'
            ? ta('importExportImportTitle')
            : 'Import'}
        </h3>
        <p className="mt-1 text-xs text-(--mc-text-secondary)">
          {ta('importExportImportHint') !== 'importExportImportHint'
            ? ta('importExportImportHint')
            : 'Upload a JSON file containing a "cards" array (from an export or compatible format). Choose the target deck and whether to apply metadata (stability, next review) if present in the file.'}
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="import-deck" className="block text-xs font-medium text-(--mc-text-secondary)">
              {ta('importExportTargetDeck') !== 'importExportTargetDeck'
                ? ta('importExportTargetDeck')
                : 'Target deck'}
            </label>
            <select
              id="import-deck"
              value={importDeckId}
              onChange={(e) => setImportDeckId(e.target.value)}
              className="mt-1 w-full rounded border border-(--mc-border-subtle) bg-(--mc-bg-page) px-3 py-2 text-sm text-(--mc-text-primary)"
            >
              <option value="">—</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="import-apply-metadata"
              type="checkbox"
              checked={applyMetadata}
              onChange={(e) => setApplyMetadata(e.target.checked)}
              disabled={importing}
              className="h-4 w-4 rounded border-(--mc-border-subtle)"
            />
            <label htmlFor="import-apply-metadata" className="text-sm text-(--mc-text-primary)">
              {ta('importExportApplyMetadata') !== 'importExportApplyMetadata'
                ? ta('importExportApplyMetadata')
                : 'Apply metadata (stability, difficulty, next/last review, important) from file'}
            </label>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImport}
            className="hidden"
            aria-label={ta('importExportChooseFile') || 'Choose JSON file'}
          />
          {importError && (
            <p className="text-sm text-(--mc-accent-danger)" role="alert">
              {importError}
            </p>
          )}
          {importSuccess !== null && (
            <p className="text-sm text-(--mc-accent-success)" role="status">
              {ta('importExportImportSuccess') !== 'importExportImportSuccess'
                ? ta('importExportImportSuccess').replace('{{count}}', String(importSuccess))
                : `${importSuccess} card(s) imported.`}
            </p>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing || !importDeckId}
            className="rounded-lg bg-(--mc-accent-primary) px-4 py-2 text-sm font-medium text-white opacity-90 hover:opacity-100 disabled:opacity-50"
          >
            {importing
              ? (ta('importExportImporting') !== 'importExportImporting' ? ta('importExportImporting') : 'Importing…')
              : ta('importExportChooseFile') !== 'importExportChooseFile'
                ? ta('importExportChooseFile')
                : 'Choose file and import'}
          </button>
        </div>
      </section>
    </div>
  );
}
