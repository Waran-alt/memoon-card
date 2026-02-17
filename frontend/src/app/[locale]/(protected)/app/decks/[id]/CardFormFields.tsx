'use client';

import { VALIDATION_LIMITS } from '@memoon-card/shared';

const { CARD_CONTENT_MAX, CARD_COMMENT_MAX } = VALIDATION_LIMITS;

export type CardFormFieldsTranslation = (key: string) => string;

interface CardFormFieldsProps {
  idPrefix: string;
  recto: string;
  verso: string;
  comment: string;
  onRectoChange: (value: string) => void;
  onVersoChange: (value: string) => void;
  onCommentChange: (value: string) => void;
  t: CardFormFieldsTranslation;
}

export function CardFormFields({
  idPrefix,
  recto,
  verso,
  comment,
  onRectoChange,
  onVersoChange,
  onCommentChange,
  t,
}: CardFormFieldsProps) {
  const rectoId = `${idPrefix}-recto`;
  const versoId = `${idPrefix}-verso`;
  const commentId = `${idPrefix}-comment`;
  const inputClass =
    'w-full rounded border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] px-3 py-2 text-sm text-[var(--mc-text-primary)]';
  const labelClass = 'mb-1 block text-sm font-medium text-[var(--mc-text-secondary)]';
  const countClass = 'mt-0.5 text-xs text-[var(--mc-text-secondary)]';

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={rectoId} className={labelClass}>
          {t('recto')}
        </label>
        <textarea
          id={rectoId}
          value={recto}
          onChange={(e) => onRectoChange(e.target.value)}
          maxLength={CARD_CONTENT_MAX}
          placeholder={t('rectoPlaceholder')}
          required
          rows={2}
          className={inputClass}
        />
        <p className={countClass}>
          {recto.length}/{CARD_CONTENT_MAX}
        </p>
      </div>
      <div>
        <label htmlFor={versoId} className={labelClass}>
          {t('verso')}
        </label>
        <textarea
          id={versoId}
          value={verso}
          onChange={(e) => onVersoChange(e.target.value)}
          maxLength={CARD_CONTENT_MAX}
          placeholder={t('versoPlaceholder')}
          required
          rows={2}
          className={inputClass}
        />
        <p className={countClass}>
          {verso.length}/{CARD_CONTENT_MAX}
        </p>
      </div>
      <div>
        <label htmlFor={commentId} className={labelClass}>
          {t('commentOptional')}
        </label>
        <textarea
          id={commentId}
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          maxLength={CARD_COMMENT_MAX}
          placeholder={t('commentPlaceholder')}
          rows={1}
          className={inputClass}
        />
        <p className={countClass}>
          {comment.length}/{CARD_COMMENT_MAX}
        </p>
      </div>
    </div>
  );
}
