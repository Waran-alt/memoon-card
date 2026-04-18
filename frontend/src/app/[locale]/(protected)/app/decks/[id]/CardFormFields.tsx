'use client';

import { VALIDATION_LIMITS } from '@memoon-card/shared';
import { CardRichTextField } from './CardRichTextField';

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
  /** When true, focuses the recto editor on mount. Use in modals so users can type immediately. */
  autoFocusRecto?: boolean;
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
  autoFocusRecto,
  t,
}: CardFormFieldsProps) {
  const rectoId = `${idPrefix}-recto`;
  const versoId = `${idPrefix}-verso`;
  const commentId = `${idPrefix}-comment`;
  const rectoLabelId = `${idPrefix}-recto-label`;
  const versoLabelId = `${idPrefix}-verso-label`;
  const commentLabelId = `${idPrefix}-comment-label`;
  const labelClass = 'mb-1 block text-sm font-medium text-(--mc-text-secondary)';
  const countClass = 'mt-0.5 text-xs text-(--mc-text-secondary)';

  return (
    <div className="space-y-3">
      <div>
        <label id={rectoLabelId} className={labelClass}>
          {t('recto')}
        </label>
        <CardRichTextField
          id={rectoId}
          ariaLabelledby={rectoLabelId}
          value={recto}
          onChange={onRectoChange}
          maxLength={CARD_CONTENT_MAX}
          placeholder={t('rectoPlaceholder')}
          toolbarT={t}
          required
          autoFocus={autoFocusRecto}
        />
        <p className={countClass}>
          {recto.length}/{CARD_CONTENT_MAX}
        </p>
      </div>
      <div>
        <label id={versoLabelId} className={labelClass}>
          {t('verso')}
        </label>
        <CardRichTextField
          id={versoId}
          ariaLabelledby={versoLabelId}
          value={verso}
          onChange={onVersoChange}
          maxLength={CARD_CONTENT_MAX}
          placeholder={t('versoPlaceholder')}
          toolbarT={t}
          required
        />
        <p className={countClass}>
          {verso.length}/{CARD_CONTENT_MAX}
        </p>
      </div>
      <div>
        <label id={commentLabelId} className={labelClass}>
          {t('commentOptional')}
        </label>
        <CardRichTextField
          id={commentId}
          ariaLabelledby={commentLabelId}
          value={comment}
          onChange={onCommentChange}
          maxLength={CARD_COMMENT_MAX}
          placeholder={t('commentPlaceholder')}
          toolbarT={t}
          compact
        />
        <p className={countClass}>
          {comment.length}/{CARD_COMMENT_MAX}
        </p>
      </div>
    </div>
  );
}
