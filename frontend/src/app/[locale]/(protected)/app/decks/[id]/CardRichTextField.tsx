'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, Strikethrough, Underline as UnderlineIcon, List, ListOrdered, Link2 } from 'lucide-react';
import { isCardFieldEmpty } from '@/lib/cardHtml';

type ToolbarTranslate = (key: string) => string;

function RichTextToolbar({ editor, toolbarT }: { editor: Editor; toolbarT: ToolbarTranslate }) {
  const t = toolbarT;
  return (
    <div
      className="flex flex-wrap gap-0.5 border-b border-(--mc-border-subtle) bg-(--mc-bg-page)/60 px-1 py-1"
      role="toolbar"
      aria-label={t('richTextToolbarFormatting')}
    >
      <ToolbarIcon
        label={t('richTextBold')}
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().toggleBold()}
      >
        <Bold className="h-4 w-4" strokeWidth={2.25} />
      </ToolbarIcon>
      <ToolbarIcon
        label={t('richTextItalic')}
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().toggleItalic()}
      >
        <Italic className="h-4 w-4" strokeWidth={2.25} />
      </ToolbarIcon>
      <ToolbarIcon
        label={t('richTextUnderline')}
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        disabled={!editor.can().toggleUnderline()}
      >
        <UnderlineIcon className="h-4 w-4" strokeWidth={2.25} />
      </ToolbarIcon>
      <ToolbarIcon
        label={t('richTextStrikethrough')}
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        disabled={!editor.can().toggleStrike()}
      >
        <Strikethrough className="h-4 w-4" strokeWidth={2.25} />
      </ToolbarIcon>
      <span className="mx-0.5 w-px self-stretch bg-(--mc-border-subtle)" aria-hidden />
      <ToolbarIcon
        label={t('richTextBulletList')}
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        disabled={!editor.can().toggleBulletList()}
      >
        <List className="h-4 w-4" strokeWidth={2.25} />
      </ToolbarIcon>
      <ToolbarIcon
        label={t('richTextNumberedList')}
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        disabled={!editor.can().toggleOrderedList()}
      >
        <ListOrdered className="h-4 w-4" strokeWidth={2.25} />
      </ToolbarIcon>
      <span className="mx-0.5 w-px self-stretch bg-(--mc-border-subtle)" aria-hidden />
      <ToolbarIcon
        label={t('richTextLink')}
        active={editor.isActive('link')}
        onClick={() => {
          const previous = editor.getAttributes('link').href as string | undefined;
          const def = previous ?? t('richTextLinkDefaultUrl');
          const url = window.prompt(t('richTextLinkPromptMessage'), def);
          if (url === null) return;
          if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
          }
          editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        }}
      >
        <Link2 className="h-4 w-4" strokeWidth={2.25} />
      </ToolbarIcon>
    </div>
  );
}

function ToolbarIcon({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-transparent text-(--mc-text-secondary) transition-colors hover:bg-(--mc-bg-card) hover:text-(--mc-text-primary) disabled:opacity-40 ${
        active ? 'bg-(--mc-bg-card) text-(--mc-text-primary)' : ''
      }`}
    >
      {children}
    </button>
  );
}

export type CardRichTextFieldProps = {
  id: string;
  /** Visible label element id (contenteditable is not labellable via htmlFor). */
  ariaLabelledby: string;
  value: string;
  onChange: (html: string) => void;
  maxLength: number;
  placeholder?: string;
  /** Smaller min-height for optional comment field */
  compact?: boolean;
  required?: boolean;
  /** Focus the editor on mount (e.g. when shown in a modal). */
  autoFocus?: boolean;
  /** App namespace translations for toolbar tooltips and link prompt */
  toolbarT: ToolbarTranslate;
};

export function CardRichTextField({
  id,
  ariaLabelledby,
  value,
  onChange,
  maxLength,
  placeholder,
  compact,
  required,
  autoFocus,
  toolbarT,
}: CardRichTextFieldProps) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const lastGoodHtmlRef = useRef(value);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: false,
        link: {
          openOnClick: false,
          HTMLAttributes: {
            class: 'underline text-(--mc-accent-primary)',
            rel: 'noopener noreferrer',
            target: '_blank',
          },
        },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? '',
      }),
    ],
    content: value === '' || value === undefined ? '<p></p>' : value,
    editorProps: {
      attributes: {
        id,
        'aria-labelledby': ariaLabelledby,
        'aria-multiline': 'true',
        ...(required ? { 'aria-required': 'true' as const } : {}),
        role: 'textbox',
        class: `mc-rich-text-editor focus:outline-none ${compact ? 'min-h-18' : 'min-h-32'} px-3 py-2 text-sm text-(--mc-text-primary)`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      if (html.length > maxLength) {
        const revert = lastGoodHtmlRef.current ?? '';
        ed.commands.setContent(revert, { emitUpdate: false });
        return;
      }
      lastGoodHtmlRef.current = html;
      onChangeRef.current(html);
    },
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (!autoFocus) return;
    const t = setTimeout(() => {
      if (!editor.isDestroyed) {
        // `scrollIntoView: false` keeps tiptap from calling getClientRects() (jsdom
        // has no layout, so it would throw and a fully-functional modal still works
        // fine for users without scrolling the editor into view).
        editor.commands.focus('end', { scrollIntoView: false });
      }
    }, 50);
    return () => clearTimeout(t);
    // Only run on mount/editor-ready: do not refocus when value/autoFocus change later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (editor.isFocused) return;
    const cur = editor.getHTML();
    const next = value === '' || value === undefined ? '<p></p>' : value;
    if (cur === next) return;
    if (isCardFieldEmpty(cur) && isCardFieldEmpty(next)) return;
    editor.commands.setContent(next, { emitUpdate: false });
    lastGoodHtmlRef.current = next;
  }, [value, editor]);

  const shellClass = `overflow-hidden rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) ${compact ? '' : ''}`;

  if (!editor) {
    return (
      <div className={shellClass}>
        <div className={`${compact ? 'min-h-18' : 'min-h-32'} animate-pulse bg-(--mc-bg-page)/50`} />
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <RichTextToolbar editor={editor} toolbarT={toolbarT} />
      <EditorContent editor={editor} className="mc-rich-text-content" />
    </div>
  );
}
