import type { PageSummary } from '@cotebook/shared';
import { useCreateBlockNote } from '@blocknote/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useMatch,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { useInstanceConfig } from '../api/queries';
import { CloseIcon, PlusIcon } from '../components/icons';
import { BlockEditor, focusEditorStart, UndoRedoButtons } from '../editor/BlockEditor';
import { editorDictionary } from '../editor/dictionary';
import { schema, type PartialEditorBlock } from '../editor/schema';
import { TitleField } from '../editor/TitleField';
import { LayoutShell, Topbar } from '../layout/AppLayout';
import { PageTree } from '../sidebar/PageTree';
import { ancestorsOf, comparePages } from '../sidebar/tree';
import { DemoStoreProvider, useDemoStore } from './DemoStore';

/**
 * The app shown when the server runs without a database (DATABASE_ENABLED=false).
 * It reuses the real editor, page tree and layout, but keeps everything in memory.
 */
export function DemoApp() {
  return (
    <DemoStoreProvider>
      <Routes>
        <Route element={<DemoLayout />}>
          <Route index element={<DemoHome />} />
          <Route path="p/:pageId" element={<DemoPageRoute />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DemoStoreProvider>
  );
}

function DemoLayout() {
  return (
    <LayoutShell renderSidebar={(close) => <DemoSidebar onClose={close} />}>
      <Outlet />
    </LayoutShell>
  );
}

function DemoSidebar({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const store = useDemoStore();
  const match = useMatch('/p/:pageId');
  const activeId = match?.params.pageId ?? null;
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(store.pages.map((p) => p.parentId).filter((id): id is string => !!id)),
  );

  useEffect(() => {
    if (!activeId) return;
    const ancestors = ancestorsOf(store.pages, activeId);
    if (ancestors.some((id) => !expanded.has(id))) {
      setExpanded((prev) => new Set([...prev, ...ancestors]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, store.pages]);

  const toggle = useCallback((id: string, force?: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (force ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const create = (parentId: string | null) => {
    const id = store.createPage(parentId);
    if (parentId) toggle(parentId, true);
    navigate(`/p/${id}`);
  };

  const remove = (page: PageSummary) => {
    const title = page.title || t('page.untitled');
    if (!window.confirm(t('sidebar.confirmDelete', { title }))) return;
    const removed = store.deletePage(page.id);
    if (activeId && removed.has(activeId)) navigate('/');
  };

  return (
    <nav className="sidebar" aria-label={t('sidebar.pages')}>
      <div className="sidebar-header">
        <span className="sidebar-user">{t('demo.sidebarTitle')}</span>
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
        <button type="button" className="sidebar-action" onClick={() => create(null)}>
          <PlusIcon />
          {t('sidebar.newPage')}
        </button>
      </div>
      <div className="sidebar-section-title">{t('sidebar.pages')}</div>
      <div className="sidebar-tree">
        {store.pages.length === 0 && <div className="sidebar-empty">{t('sidebar.noPages')}</div>}
        <PageTree
          pages={store.pages}
          activeId={activeId}
          expanded={expanded}
          onToggle={toggle}
          onAddChild={(id) => create(id)}
          onDelete={remove}
          onMove={store.movePage}
        />
      </div>
      <div className="sidebar-footer demo-footer">{t('demo.footer')}</div>
    </nav>
  );
}

function DemoHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const store = useDemoStore();
  const first = store.pages.filter((p) => p.parentId === null).sort(comparePages)[0];
  if (first) return <Navigate to={`/p/${first.id}`} replace />;
  return (
    <>
      <Topbar>
        <DemoBadge />
      </Topbar>
      <div className="content-scroll">
        <div className="home">
          <h1>{t('home.welcome')}</h1>
          <p>{t('home.hint')}</p>
          <button
            type="button"
            className="button button-primary"
            onClick={() => navigate(`/p/${store.createPage(null)}`)}
          >
            <PlusIcon width={16} height={16} />
            {t('home.create')}
          </button>
        </div>
      </div>
    </>
  );
}

function DemoPageRoute() {
  const { pageId = '' } = useParams();
  const { t } = useTranslation();
  const store = useDemoStore();
  const page = store.pages.find((p) => p.id === pageId);
  if (!page) {
    return (
      <>
        <Topbar>
          <DemoBadge />
        </Topbar>
        <div className="center-screen">
          <p>{t('page.notFound')}</p>
          <Link className="button" to="/">
            {t('page.backHome')}
          </Link>
        </div>
      </>
    );
  }
  return <DemoPageView key={page.id} page={page} />;
}

function DemoPageView({ page }: { page: PageSummary }) {
  const { t, i18n } = useTranslation();
  const store = useDemoStore();
  const config = useInstanceConfig();
  const [notice, setNotice] = useState<string | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Images stay in the browser as object URLs; nothing is uploaded.
  const uploadFile = useCallback(
    async (file: File) => {
      const allowed = config.data?.allowedUploadTypes;
      const max = config.data?.maxUploadBytes;
      let message: string | null = null;
      if (allowed && !allowed.includes(file.type)) message = t('page.uploadUnsupported');
      else if (max && file.size > max) {
        message = t('page.uploadTooLarge', { size: Math.round(max / 1024 / 1024) });
      }
      if (message) {
        setNotice(message);
        throw new Error(message);
      }
      return URL.createObjectURL(file);
    },
    [config.data, t],
  );

  const editor = useCreateBlockNote(
    {
      schema,
      initialContent: store.getBlocks(page.id).length ? store.getBlocks(page.id) : undefined,
      uploadFile,
      dictionary: editorDictionary(i18n.resolvedLanguage ?? 'en'),
    },
    [],
  );

  useEffect(() => {
    if (!page.title) titleRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(id);
  }, [notice]);

  return (
    <>
      <Topbar title={page.title || t('page.untitled')}>
        <DemoBadge />
        <UndoRedoButtons editor={editor} />
      </Topbar>
      <div className="content-scroll">
        <article className="page">
          <TitleField
            ref={titleRef}
            value={page.title}
            onChange={(title) => store.renamePage(page.id, title)}
            onEnter={() => focusEditorStart(editor)}
          />
          <div className="page-banner" role="note">
            <span>{t('demo.banner')}</span>
          </div>
          {notice && (
            <div className="page-banner" role="status">
              <span>{notice}</span>
            </div>
          )}
          <BlockEditor
            editor={editor}
            onChange={() =>
              store.setBlocks(page.id, editor.document as unknown as PartialEditorBlock[])
            }
          />
        </article>
      </div>
    </>
  );
}

function DemoBadge() {
  const { t } = useTranslation();
  return (
    <span className="demo-badge" title={t('demo.banner')}>
      {t('demo.badge')}
    </span>
  );
}
