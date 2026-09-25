import type { PageSummary } from '@cotebook/shared';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCreatePage, useDeletePage, useLogout, useMe, usePages } from '../api/queries';
import { CloseIcon, LogoutIcon, PlusIcon, SearchIcon } from '../components/icons';
import { PageTree } from './PageTree';
import { ancestorsOf, subtreeIds } from './tree';

const EXPANDED_KEY = 'cotebook.expanded';

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function Sidebar({
  activePageId,
  onOpenSearch,
  onClose,
}: {
  activePageId: string | null;
  onOpenSearch: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: user } = useMe();
  const { data: pages = [], isPending } = usePages();
  const createPage = useCreatePage();
  const deletePage = useDeletePage();
  const logout = useLogout();
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);

  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
    } catch {
      // Storage may be unavailable (private mode); expansion state is non-essential.
    }
  }, [expanded]);

  // Reveal the open page in the tree.
  useEffect(() => {
    if (!activePageId) return;
    const ancestors = ancestorsOf(pages, activePageId);
    if (ancestors.some((id) => !expanded.has(id))) {
      setExpanded((prev) => new Set([...prev, ...ancestors]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageId, pages]);

  const toggle = useCallback((id: string, force?: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const open = force ?? !next.has(id);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const create = (parentId: string | null) => {
    createPage.mutate(
      { parentId },
      {
        onSuccess: (page) => {
          if (parentId) toggle(parentId, true);
          navigate(`/p/${page.id}`);
        },
      },
    );
  };

  const remove = (page: PageSummary) => {
    const title = page.title || t('page.untitled');
    if (!window.confirm(t('sidebar.confirmDelete', { title }))) return;
    const removed = subtreeIds(pages, page.id);
    deletePage.mutate(page.id, {
      onSuccess: () => {
        if (activePageId && removed.has(activePageId)) navigate('/');
      },
    });
  };

  return (
    <nav className="sidebar" aria-label={t('sidebar.pages')}>
      <div className="sidebar-header">
        <span className="sidebar-user">{user?.displayName || user?.email}</span>
        <button
          type="button"
          className="icon-button menu-toggle"
          aria-label={t('sidebar.closeMenu')}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="sidebar-actions">
        <button type="button" className="sidebar-action" onClick={onOpenSearch}>
          <SearchIcon />
          {t('sidebar.search')}
        </button>
        <button
          type="button"
          className="sidebar-action"
          onClick={() => create(null)}
          disabled={createPage.isPending}
        >
          <PlusIcon />
          {t('sidebar.newPage')}
        </button>
      </div>
      <div className="sidebar-section-title">{t('sidebar.pages')}</div>
      <div className="sidebar-tree">
        {!isPending && pages.length === 0 && (
          <div className="sidebar-empty">{t('sidebar.noPages')}</div>
        )}
        <PageTree
          pages={pages}
          activeId={activePageId}
          expanded={expanded}
          onToggle={toggle}
          onAddChild={(id) => create(id)}
          onDelete={remove}
        />
      </div>
      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-action"
          style={{ width: '100%' }}
          onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/login') })}
        >
          <LogoutIcon />
          {t('auth.logout')}
        </button>
      </div>
    </nav>
  );
}
