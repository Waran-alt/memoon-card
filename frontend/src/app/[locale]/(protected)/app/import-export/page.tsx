'use client';

import { useState, useRef, Fragment, useMemo } from 'react';
import Link from 'next/link';
import { useLocale } from 'i18n';
import { McSelect } from '@/components/ui/McSelect';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useApiGet } from '@/hooks/useApiGet';
import type { Deck } from '@/types';

/**
 * Card item in export/import payload.
 *
 * Linking semantics (must match backend `card.service.ts#getCardsForExport`/`importCards`):
 *   - `pairId`: two cards sharing the same value are reimported as a 2-card linked pair.
 *   - `link_group_id`: ≥2 cards sharing the same value are reimported as a fully-connected
 *     link group (each card linked to every other in that group). Used when a card has 2+
 *     linked neighbors at export time.
 *   - `linked_card_ids`: informational only on the round-trip; not used by import.
 */
interface ExportCardItem {
  recto: string;
  verso: string;
  comment?: string | null;
  reverse?: boolean;
  recto_formula?: boolean;
  verso_formula?: boolean;
  pairId?: string | null;
  link_group_id?: string | null;
  linked_card_ids?: string[] | null;
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

/** Parse flexible JSON: array of cards, or object with "cards" array (e.g. export format). */
function parseImportFile(json: string): ExportCardItem[] {
  const raw = JSON.parse(json) as unknown;
  if (!raw || typeof raw !== 'object') throw new Error('Invalid JSON');
  if (Array.isArray(raw)) return raw as ExportCardItem[];
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.cards)) return obj.cards as ExportCardItem[];
  throw new Error('File must be a JSON array of cards or an object with a "cards" array');
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '…';
}

/**
 * Counts what the backend will create:
 *   - `linkGroupCount`: groups of ≥2 cards sharing a non-empty `link_group_id`.
 *     Cards in such groups are also counted in `linkedCardCount` (sum of group sizes).
 *   - `pairCount`: pairs of exactly 2 cards sharing a non-empty `pairId`. Cards
 *     already covered by a link group are excluded so they aren't double-counted.
 *   - `singleCount`: everything else (one card per row).
 *   - `withMetadataCount`: rows that carry stability/difficulty/next_review/last_review/
 *     is_important — useful preview when "Apply metadata" is enabled.
 */
function getImportSummary(cards: ExportCardItem[]): {
  pairCount: number;
  linkGroupCount: number;
  linkedCardCount: number;
  singleCount: number;
  withMetadataCount: number;
} {
  const byLinkGroup = new Map<string, number[]>();
  cards.forEach((c, idx) => {
    const lg = c.link_group_id?.trim();
    if (!lg) return;
    if (!byLinkGroup.has(lg)) byLinkGroup.set(lg, []);
    byLinkGroup.get(lg)!.push(idx);
  });
  const inLinkGroup = new Set<number>();
  let linkGroupCount = 0;
  let linkedCardCount = 0;
  byLinkGroup.forEach((indices) => {
    if (indices.length < 2) return;
    linkGroupCount += 1;
    linkedCardCount += indices.length;
    indices.forEach((i) => inLinkGroup.add(i));
  });

  const byPairId = new Map<string, number[]>();
  cards.forEach((c, idx) => {
    if (inLinkGroup.has(idx)) return;
    const key = c.pairId && c.pairId.trim() ? c.pairId : `__single_${idx}`;
    if (!byPairId.has(key)) byPairId.set(key, []);
    byPairId.get(key)!.push(idx);
  });
  let pairCount = 0;
  let singleCount = 0;
  byPairId.forEach((indices) => {
    if (indices.length === 2) pairCount += 1;
    else singleCount += indices.length;
  });

  let withMetadataCount = 0;
  cards.forEach((c) => {
    if (
      c.stability != null ||
      c.difficulty != null ||
      c.next_review != null ||
      c.last_review != null ||
      c.is_important === true
    ) {
      withMetadataCount += 1;
    }
  });

  return { pairCount, linkGroupCount, linkedCardCount, singleCount, withMetadataCount };
}

type PreviewItem =
  | { type: 'pair'; pairNum: number; cards: [ExportCardItem, ExportCardItem] }
  | { type: 'group'; groupNum: number; cards: ExportCardItem[]; key: string }
  | { type: 'single'; card: ExportCardItem; index: number };

/**
 * Build ordered list of preview items for the first ~maxCards rows. We collapse:
 *   - link groups (≥2 cards sharing `link_group_id`) into a single "Group N" row
 *     listing all members,
 *   - pairs (2 cards sharing `pairId`) into one "Pair N" row,
 *   - everything else into individual "Single" rows.
 *
 * Groups are processed first (and their members are excluded from pair detection)
 * so the visual breakdown matches what the backend will actually create.
 */
function getPreviewItems(cards: ExportCardItem[], maxCards: number): PreviewItem[] {
  const items: PreviewItem[] = [];
  const used = new Set<number>();

  const linkGroupMap = new Map<string, number[]>();
  cards.forEach((c, idx) => {
    const lg = c.link_group_id?.trim();
    if (!lg) return;
    if (!linkGroupMap.has(lg)) linkGroupMap.set(lg, []);
    linkGroupMap.get(lg)!.push(idx);
  });
  const linkedIndices = new Set<number>();
  linkGroupMap.forEach((indices) => {
    if (indices.length >= 2) indices.forEach((i) => linkedIndices.add(i));
  });

  let pairNum = 0;
  let groupNum = 0;
  for (let i = 0; i < cards.length && used.size < maxCards; i++) {
    if (used.has(i)) continue;
    const card = cards[i];
    if (!card) continue;

    const lg = card.link_group_id?.trim();
    if (lg && linkedIndices.has(i)) {
      const indices = linkGroupMap.get(lg) ?? [];
      const groupCards: ExportCardItem[] = [];
      for (const j of indices) {
        if (used.has(j)) continue;
        const c = cards[j];
        if (!c) continue;
        groupCards.push(c);
        used.add(j);
      }
      if (groupCards.length >= 2) {
        groupNum += 1;
        items.push({ type: 'group', groupNum, cards: groupCards, key: lg });
        continue;
      }
    }

    const pairKey = card.pairId && card.pairId.trim() ? card.pairId : `__single_${i}`;
    const isPair = !pairKey.startsWith('__single_');
    let pairPartner: number | null = null;
    if (isPair) {
      for (let j = i + 1; j < cards.length; j++) {
        if (used.has(j)) continue;
        const c = cards[j];
        if (!c) continue;
        const k = c.pairId && c.pairId.trim() ? c.pairId : `__single_${j}`;
        if (k === pairKey) {
          pairPartner = j;
          break;
        }
      }
    }
    if (pairPartner !== null) {
      const partner = cards[pairPartner];
      if (partner) {
        pairNum += 1;
        items.push({ type: 'pair', pairNum, cards: [card, partner] });
        used.add(i);
        used.add(pairPartner);
        continue;
      }
    }
    items.push({ type: 'single', card, index: i });
    used.add(i);
  }
  return items;
}

export default function ImportExportPage() {
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const { data: decksData } = useApiGet<Deck[]>('/api/decks', { errorFallback: '' });
  const decks = Array.isArray(decksData) ? decksData : [];

  const deckOptions = useMemo(
    () => [
      { value: '', label: '—' },
      ...decks.map((d) => ({ value: d.id, label: d.title })),
    ],
    [decks]
  );

  const exportFormatOptions = useMemo(
    () => [
      {
        value: 'content',
        label:
          ta('importExportFormatContent') !== 'importExportFormatContent'
            ? ta('importExportFormatContent')
            : 'Content only (recto, verso, comment)',
      },
      {
        value: 'full',
        label:
          ta('importExportFormatFull') !== 'importExportFormatFull'
            ? ta('importExportFormatFull')
            : 'Full (with metadata: stability, next review, etc.)',
      },
    ],
    [ta]
  );

  const [exportDeckId, setExportDeckId] = useState('');
  const [exportFormat, setExportFormat] = useState<'content' | 'full'>('full');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const [importDeckId, setImportDeckId] = useState('');
  const [applyMetadata, setApplyMetadata] = useState(false);
  const [pendingImportCards, setPendingImportCards] = useState<ExportCardItem[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importSummary = pendingImportCards ? getImportSummary(pendingImportCards) : null;

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

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    setImportSuccess(null);
    setPendingImportCards(null);
    if (!file) return;
    setImportError('');
    file
      .text()
      .then((text) => {
        const cards = parseImportFile(text);
        if (cards.length === 0) {
          setImportError(ta('importExportNoCards') || 'No cards in file');
          return;
        }
        setPendingImportCards(cards);
      })
      .catch(() => {
        setImportError(ta('importExportImportFailed') || 'Import failed. Check file format.');
      });
  }

  async function handleConfirmImport() {
    if (!pendingImportCards?.length || !importDeckId) return;
    setImportError('');
    setImportSuccess(null);
    setImporting(true);
    try {
      const res = await apiClient.post<{ success: boolean; data?: unknown[]; count?: number }>(
        `/api/decks/${importDeckId}/cards/import`,
        { cards: pendingImportCards, options: { applyMetadata } }
      );
      const count = res.data?.count ?? res.data?.data?.length ?? pendingImportCards.length;
      setImportSuccess(count);
      setPendingImportCards(null);
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
            <McSelect
              id="export-deck"
              value={exportDeckId}
              onChange={setExportDeckId}
              options={deckOptions}
              className="mt-1"
              ariaLabel={ta('importExportDeck') !== 'importExportDeck' ? ta('importExportDeck') : 'Deck'}
            />
          </div>
          <div>
            <label htmlFor="export-format" className="block text-xs font-medium text-(--mc-text-secondary)">
              {ta('importExportFormat') !== 'importExportFormat' ? ta('importExportFormat') : 'Format'}
            </label>
            <McSelect
              id="export-format"
              value={exportFormat}
              onChange={(v) => setExportFormat(v as 'content' | 'full')}
              options={exportFormatOptions}
              className="mt-1"
              ariaLabel={ta('importExportFormat') !== 'importExportFormat' ? ta('importExportFormat') : 'Format'}
            />
          </div>
          {exportError && (
            <p className="text-sm text-(--mc-accent-danger)" role="alert" aria-live="polite">
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
            : 'Upload a JSON file: either an array of cards or an object with a "cards" array. Each card needs "recto" and "verso"; optional: comment, pairId, metadata.'}
        </p>
        <p className="mt-1 text-xs text-(--mc-text-muted)">
          {ta('importExportPairIdHint') !== 'importExportPairIdHint'
            ? ta('importExportPairIdHint')
            : 'To link two cards as a reverse pair, give them the same "pairId".'}
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="import-deck" className="block text-xs font-medium text-(--mc-text-secondary)">
              {ta('importExportTargetDeck') !== 'importExportTargetDeck'
                ? ta('importExportTargetDeck')
                : 'Target deck'}
            </label>
            <McSelect
              id="import-deck"
              value={importDeckId}
              onChange={setImportDeckId}
              options={deckOptions}
              className="mt-1"
              ariaLabel={
                ta('importExportTargetDeck') !== 'importExportTargetDeck'
                  ? ta('importExportTargetDeck')
                  : 'Target deck'
              }
            />
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
            onChange={handleFileSelect}
            className="hidden"
            aria-label={ta('importExportChooseFile') || 'Choose JSON file'}
          />
          {importError && (
            <p className="text-sm text-(--mc-accent-danger)" role="alert" aria-live="polite">
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
          {!pendingImportCards ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!importDeckId}
              className="rounded-lg bg-(--mc-accent-primary) px-4 py-2 text-sm font-medium text-white opacity-90 hover:opacity-100 disabled:opacity-50"
            >
              {ta('importExportChooseFile') !== 'importExportChooseFile'
                ? ta('importExportChooseFile')
                : 'Choose file'}
            </button>
          ) : (
            <>
              <div className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page) p-4">
                <p className="mb-3 text-xs font-medium text-(--mc-text-secondary)">
                  {ta('importExportPreviewSummary') !== 'importExportPreviewSummary'
                    ? ta('importExportPreviewSummary')
                    : 'Import preview'}
                </p>
                <dl className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <div>
                    <dt className="inline font-medium text-(--mc-text-primary)">{ta('importExportPreviewTotal') !== 'importExportPreviewTotal' ? ta('importExportPreviewTotal') : 'Total'}: </dt>
                    <dd className="inline text-(--mc-text-secondary)">{pendingImportCards.length} {ta('importExportPreviewCards') !== 'importExportPreviewCards' ? ta('importExportPreviewCards') : 'cards'}</dd>
                  </div>
                  {importSummary && importSummary.pairCount > 0 && (
                    <div>
                      <dt className="inline font-medium text-(--mc-text-primary)">{ta('importExportPreviewPairs') !== 'importExportPreviewPairs' ? ta('importExportPreviewPairs') : 'Pairs'}: </dt>
                      <dd className="inline text-(--mc-text-secondary)">{importSummary.pairCount}</dd>
                    </div>
                  )}
                  {importSummary && importSummary.linkGroupCount > 0 && (
                    <div title={ta('importExportPreviewLinkingHint')}>
                      <dt className="inline font-medium text-(--mc-text-primary)">{ta('importExportPreviewLinkGroups')}: </dt>
                      <dd className="inline text-(--mc-text-secondary)">
                        {importSummary.linkGroupCount} ({importSummary.linkedCardCount} {ta('importExportPreviewLinkedCards').toLowerCase()})
                      </dd>
                    </div>
                  )}
                  {importSummary && importSummary.singleCount > 0 && (
                    <div>
                      <dt className="inline font-medium text-(--mc-text-primary)">{ta('importExportPreviewSingles') !== 'importExportPreviewSingles' ? ta('importExportPreviewSingles') : 'Single cards'}: </dt>
                      <dd className="inline text-(--mc-text-secondary)">{importSummary.singleCount}</dd>
                    </div>
                  )}
                  {importSummary && importSummary.withMetadataCount > 0 && (
                    <div>
                      <dt className="inline font-medium text-(--mc-text-primary)">{ta('importExportPreviewWithMetadata')}: </dt>
                      <dd className="inline text-(--mc-text-secondary)">{importSummary.withMetadataCount}</dd>
                    </div>
                  )}
                </dl>
                {importSummary && (importSummary.pairCount > 0 || importSummary.linkGroupCount > 0) ? (
                  <p className="mb-3 text-xs text-(--mc-text-muted)">{ta('importExportPreviewLinkingHint')}</p>
                ) : null}
                {importSummary && importSummary.withMetadataCount > 0 && !applyMetadata ? (
                  <p className="mb-3 text-xs text-(--mc-text-muted)">
                    {ta('importExportPreviewMetadataHint', { vars: { count: String(importSummary.withMetadataCount) } })}
                  </p>
                ) : null}
                <div className="max-h-60 overflow-auto rounded border border-(--mc-border-subtle)">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-(--mc-bg-surface) text-xs font-medium text-(--mc-text-secondary)">
                      <tr>
                        <th className="w-24 px-2 py-2">{ta('importExportPreviewType') !== 'importExportPreviewType' ? ta('importExportPreviewType') : 'Type'}</th>
                        <th className="px-2 py-2">{ta('recto')}</th>
                        <th className="px-2 py-2">{ta('verso')}</th>
                      </tr>
                    </thead>
                    <tbody className="text-(--mc-text-primary)">
                      {getPreviewItems(pendingImportCards, 50).map((item) => {
                        if (item.type === 'pair') {
                          return (
                            <Fragment key={`pair-${item.pairNum}`}>
                              <tr className="border-t-2 border-(--mc-accent-primary) bg-(--mc-bg-card-back)/60">
                                <td
                                  rowSpan={2}
                                  className="w-24 border-r border-(--mc-border-subtle) px-2 py-1.5 align-top font-medium text-(--mc-accent-primary)"
                                  title={item.cards[0].pairId ?? undefined}
                                >
                                  <span className="text-xs">{ta('importExportPreviewPair') !== 'importExportPreviewPair' ? ta('importExportPreviewPair') : 'Pair'}</span>
                                  <span className="ml-1 font-semibold tabular-nums">{item.pairNum}</span>
                                </td>
                                <td className="max-w-48 truncate px-2 py-1.5" title={item.cards[0].recto}>{truncate(item.cards[0].recto, 40)}</td>
                                <td className="max-w-48 truncate px-2 py-1.5" title={item.cards[0].verso}>{truncate(item.cards[0].verso, 40)}</td>
                              </tr>
                              <tr className="bg-(--mc-bg-card-back)/60">
                                <td className="max-w-48 truncate border-t border-(--mc-border-subtle) px-2 py-1.5" title={item.cards[1].recto}>{truncate(item.cards[1].recto, 40)}</td>
                                <td className="max-w-48 truncate border-t border-(--mc-border-subtle) px-2 py-1.5" title={item.cards[1].verso}>{truncate(item.cards[1].verso, 40)}</td>
                              </tr>
                            </Fragment>
                          );
                        }
                        if (item.type === 'group') {
                          return (
                            <Fragment key={`group-${item.groupNum}`}>
                              {item.cards.map((c, gIdx) => (
                                <tr
                                  key={`group-${item.groupNum}-row-${gIdx}`}
                                  className={`bg-(--mc-bg-card-back)/40 ${gIdx === 0 ? 'border-t-2 border-(--mc-accent-success)' : ''}`}
                                >
                                  {gIdx === 0 ? (
                                    <td
                                      rowSpan={item.cards.length}
                                      className="w-24 border-r border-(--mc-border-subtle) px-2 py-1.5 align-top font-medium text-(--mc-accent-success)"
                                      title={item.key}
                                    >
                                      <span className="text-xs">{ta('importExportPreviewLinkGroups')}</span>
                                      <span className="ml-1 font-semibold tabular-nums">
                                        {item.groupNum} ({item.cards.length})
                                      </span>
                                    </td>
                                  ) : null}
                                  <td className={`max-w-48 truncate px-2 py-1.5 ${gIdx > 0 ? 'border-t border-(--mc-border-subtle)' : ''}`} title={c.recto}>{truncate(c.recto, 40)}</td>
                                  <td className={`max-w-48 truncate px-2 py-1.5 ${gIdx > 0 ? 'border-t border-(--mc-border-subtle)' : ''}`} title={c.verso}>{truncate(c.verso, 40)}</td>
                                </tr>
                              ))}
                            </Fragment>
                          );
                        }
                        return (
                          <tr key={`single-${item.index}`} className="border-t border-(--mc-border-subtle)">
                            <td className="w-24 px-2 py-1.5 text-(--mc-text-muted) text-xs">
                              {ta('importExportPreviewSingle') !== 'importExportPreviewSingle' ? ta('importExportPreviewSingle') : 'Single'}
                            </td>
                            <td className="max-w-48 truncate px-2 py-1.5" title={item.card.recto}>{truncate(item.card.recto, 40)}</td>
                            <td className="max-w-48 truncate px-2 py-1.5" title={item.card.verso}>{truncate(item.card.verso, 40)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {pendingImportCards.length > 50 && (
                  <p className="mt-2 text-xs text-(--mc-text-muted)">
                    {ta('importExportPreviewMore') !== 'importExportPreviewMore' ? ta('importExportPreviewMore').replace('{{count}}', String(pendingImportCards.length - 50)) : `… and ${pendingImportCards.length - 50} more`}
                  </p>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={importing || !importDeckId}
                  className="rounded-lg bg-(--mc-accent-primary) px-4 py-2 text-sm font-medium text-white opacity-90 hover:opacity-100 disabled:opacity-50"
                >
                  {importing
                    ? (ta('importExportImporting') !== 'importExportImporting' ? ta('importExportImporting') : 'Importing…')
                    : (ta('importExportConfirmImport') !== 'importExportConfirmImport' ? ta('importExportConfirmImport') : 'Confirm import')}
                </button>
                <button
                  type="button"
                  onClick={() => { setPendingImportCards(null); fileInputRef.current?.click(); }}
                  disabled={importing}
                  className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-4 py-2 text-sm font-medium text-(--mc-text-primary) hover:bg-(--mc-bg-card-back) disabled:opacity-50"
                >
                  {ta('importExportChangeFile') !== 'importExportChangeFile' ? ta('importExportChangeFile') : 'Change file'}
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
