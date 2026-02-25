'use client';

import { useState } from 'react';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useApiGet } from '@/hooks/useApiGet';
import type { CategoryWithCardCount } from '@/types';

export default function CategoriesPage() {
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const { data: list, loading, error, refetch } = useApiGet<CategoryWithCardCount[]>(
    '/api/users/me/categories?cardCount=true',
    { errorFallback: tc('invalidResponse') }
  );
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    setCreateError('');
    try {
      await apiClient.post('/api/users/me/categories', { name });
      setNewName('');
      refetch();
    } catch (err) {
      setCreateError(getApiErrorMessage(err, ta('categoriesCreateError')));
    } finally {
      setCreating(false);
    }
  }

  function startEdit(cat: CategoryWithCardCount) {
    setEditingId(cat.id);
    setEditName(cat.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName('');
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId || !editName.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      await apiClient.patch(`/api/users/me/categories/${editingId}`, { name: editName.trim() });
      cancelEdit();
      refetch();
    } catch {
      // Keep form open; could show error
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete() {
    if (!deleteConfirmId || deleting) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/users/me/categories/${deleteConfirmId}`);
      setDeleteConfirmId(null);
      refetch();
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--mc-text-secondary)]">{tc('loading')}</p>;
  }
  if (error) {
    return (
      <p className="text-sm text-[var(--mc-accent-danger)]" role="alert">
        {error}
      </p>
    );
  }

  const categories = Array.isArray(list) ? list : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--mc-text-primary)]">
          {ta('categoriesTitle')}
        </h2>
        <p className="mt-1 text-sm text-[var(--mc-text-secondary)]">
          {ta('categoriesIntro')}
        </p>
      </div>

      <form onSubmit={handleCreate} className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={ta('categoryNamePlaceholder')}
          maxLength={255}
          className="rounded border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] px-3 py-1.5 text-sm text-[var(--mc-text-primary)] placeholder:text-[var(--mc-text-muted)]"
          aria-label={ta('categoryNamePlaceholder')}
        />
        <button
          type="submit"
          disabled={!newName.trim() || creating}
          className="rounded bg-[var(--mc-accent-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {creating ? tc('creating') : ta('addCategory')}
        </button>
      </form>
      {createError && (
        <p className="text-sm text-[var(--mc-accent-danger)]" role="alert">
          {createError}
        </p>
      )}

      {categories.length === 0 ? (
        <p className="text-sm text-[var(--mc-text-secondary)]">
          {ta('noCategoriesYet')} {ta('createFirstCategory')}
        </p>
      ) : (
        <ul className="space-y-2 rounded-lg border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] p-4">
          {categories.map((cat) => (
            <li
              key={cat.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--mc-border-subtle)] pb-2 last:border-0 last:pb-0"
            >
              {editingId === cat.id ? (
                <form onSubmit={saveEdit} className="flex flex-1 items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={255}
                    className="min-w-0 flex-1 rounded border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-base)] px-2 py-1 text-sm"
                    autoFocus
                    aria-label={ta('categoryNamePlaceholder')}
                  />
                  <button
                    type="submit"
                    disabled={!editName.trim() || savingEdit}
                    className="rounded bg-[var(--mc-accent-primary)] px-2 py-1 text-sm text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {tc('save')}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="rounded border border-[var(--mc-border-subtle)] px-2 py-1 text-sm text-[var(--mc-text-secondary)] hover:bg-[var(--mc-bg-card-back)]"
                  >
                    {tc('cancel')}
                  </button>
                </form>
              ) : (
                <>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="font-medium text-[var(--mc-text-primary)]">{cat.name}</span>
                    {cat.card_count != null && (
                      <span className="text-xs text-[var(--mc-text-secondary)]">
                        {ta('categoryCardCount', { vars: { count: String(cat.card_count) } })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(cat)}
                      className="rounded border border-[var(--mc-border-subtle)] px-2 py-1 text-xs text-[var(--mc-text-secondary)] hover:bg-[var(--mc-bg-card-back)]"
                    >
                      {ta('editCategory')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(cat.id)}
                      className="rounded border border-[var(--mc-accent-danger)/50] px-2 py-1 text-xs text-[var(--mc-accent-danger)] hover:bg-[var(--mc-accent-danger)/10]"
                    >
                      {ta('deleteCategory')}
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {deleteConfirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-category-title"
        >
          <div className="w-full max-w-sm rounded-lg border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] p-4 shadow-lg">
            <h3 id="delete-category-title" className="font-medium text-[var(--mc-text-primary)]">
              {ta('deleteCategoryConfirmTitle')}
            </h3>
            <p className="mt-2 text-sm text-[var(--mc-text-secondary)]">
              {ta('deleteCategoryConfirmMessage')}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                disabled={deleting}
                className="rounded border border-[var(--mc-border-subtle)] px-3 py-1.5 text-sm text-[var(--mc-text-secondary)] hover:bg-[var(--mc-bg-card-back)] disabled:opacity-50"
              >
                {tc('cancel')}
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded bg-[var(--mc-accent-danger)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {deleting ? tc('saving') : ta('deleteCategoryConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
