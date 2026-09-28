import type { Block, PageDetail, PageSummary, UploadResponse } from '@cotebook/shared';
import { useCreateBlockNote } from '@blocknote/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { queryKeys, useInstanceConfig, usePages, useRenamePage } from '../api/queries';
import { Topbar } from '../layout/AppLayout';
import { BlockEditor, focusEditorStart, UndoRedoButtons } from './BlockEditor';
import { editorDictionary } from './dictionary';
import { schema, type PartialEditorBlock } from './schema';
import { TitleField } from './TitleField';
import { useAutosave, type SaveStatus } from './useAutosave';

function toEditorBlocks(blocks: Block[]): PartialEditorBlock[] | undefined {
  return blocks.length ? (blocks as unknown as PartialEditorBlock[]) : undefined;
}

/**
 * A page: editable title plus block content. With `readOnly`, it renders the same
 * view without any editing affordances, so it can be reused for shared pages later.
 */
export function PageView({ page, readOnly = false }: { page: PageDetail; readOnly?: boolean }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const config = useInstanceConfig();
  const [notice, setNotice] = useState<string | null>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      const max = config.data?.maxUploadBytes;
      if (max && file.size > max) {
        const message = t('page.uploadTooLarge', { size: Math.round(max / 1024 / 1024) });
        setNotice(message);
        throw new Error(message);
      }
      const form = new FormData();
      form.append('file', file);
      try {
        const res = await api<UploadResponse>(`/uploads?pageId=${page.id}`, {
          method: 'POST',
          body: form,
        });
        return res.url;
      } catch (err) {
        const unsupported = err instanceof ApiError && err.code === 'unsupported_media_type';
        const message = unsupported ? t('page.uploadUnsupported') : t('page.uploadFailed');
        setNotice(message);
        throw err;
      }
    },
    [config.data?.maxUploadBytes, page.id, t],
  );

  const editor = useCreateBlockNote(
    {
      schema,
      initialContent: toEditorBlocks(page.blocks),
      uploadFile,
      dictionary: editorDictionary(i18n.resolvedLanguage ?? 'en'),
    },
    [],
  );

  // A newer version from another device that arrived while we had unsaved edits.
  const [pendingRemote, setPendingRemote] = useState<PageDetail | null>(null);

  const autosave = useAutosave({
    pageId: page.id,
    initialVersion: page.version,
    getBlocks: () => editor.document as unknown as Block[],
    onSaved: (version, blocks) => {
      qc.setQueryData<PageDetail>(queryKeys.page(page.id), (old) =>
        old ? { ...old, version, blocks } : old,
      );
      // Our save superseded it (e.g. "keep mine"), so there is nothing left to resolve.
      setPendingRemote((p) => (p && p.version < version ? null : p));
    },
  });

  // Loading content into the editor fires onChange; ignore those events.
  const applyingRemote = useRef(false);
  const applyRemote = useCallback(
    (remote: PageDetail) => {
      applyingRemote.current = true;
      try {
        editor.replaceBlocks(
          editor.document,
          toEditorBlocks(remote.blocks) ?? [{ type: 'paragraph' }],
        );
      } finally {
        applyingRemote.current = false;
      }
      autosave.acceptRemote(remote.version);
    },
    [editor, autosave],
  );

  // A newer version arrived (another device saved it): load it unless we have local
  // edits, in which case the user decides.
  useEffect(() => {
    if (page.version <= autosave.versionRef.current) return;
    if (autosave.dirtyRef.current) setPendingRemote(page);
    else applyRemote(page);
  }, [page, applyRemote, autosave.versionRef, autosave.dirtyRef]);

  const onChange = useCallback(() => {
    if (applyingRemote.current || readOnly) return;
    autosave.markDirty();
  }, [autosave, readOnly]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(id);
  }, [notice]);

  const showConflict = autosave.status === 'conflict' || pendingRemote !== null;

  const loadTheirs = async () => {
    const latest = (await api<{ page: PageDetail }>(`/pages/${page.id}`)).page;
    setPendingRemote(null);
    qc.setQueryData(queryKeys.page(page.id), latest);
    applyRemote(latest);
  };
  const keepMine = () => {
    setPendingRemote(null);
    autosave.resolveKeepMine();
  };

  return (
    <>
      <Topbar title={<PageTitleCrumb pageId={page.id} fallback={page.title} />}>
        <StatusLabel status={readOnly ? null : autosave.status} />
        {!readOnly && <UndoRedoButtons editor={editor} />}
      </Topbar>
      <div className="content-scroll">
        <article className="page">
          <TitleInput page={page} readOnly={readOnly} onEnter={() => focusEditorStart(editor)} />
          {showConflict && !readOnly && (
            <div className="page-banner" role="alert">
              <span>{t('page.conflict')}</span>
              <button type="button" className="button" onClick={() => void loadTheirs()}>
                {t('page.conflictLoad')}
              </button>
              <button type="button" className="button" onClick={keepMine}>
                {t('page.conflictKeep')}
              </button>
            </div>
          )}
          {notice && (
            <div className="page-banner" role="status">
              <span>{notice}</span>
            </div>
          )}
          <BlockEditor editor={editor} readOnly={readOnly} onChange={onChange} />
        </article>
      </div>
    </>
  );
}

function PageTitleCrumb({ pageId, fallback }: { pageId: string; fallback: string }) {
  const { t } = useTranslation();
  const { data: pages } = usePages();
  const title = pages?.find((p) => p.id === pageId)?.title ?? fallback;
  return <>{title || t('page.untitled')}</>;
}

function StatusLabel({ status }: { status: SaveStatus | null }) {
  const { t } = useTranslation();
  if (!status || status === 'conflict') return null;
  const label = {
    saved: t('page.saved'),
    unsaved: t('page.unsaved'),
    saving: t('page.saving'),
    error: t('page.saveFailed'),
    offline: t('page.offline'),
  }[status];
  const isError = status === 'error' || status === 'offline';
  return (
    <span className={`topbar-status${isError ? ' is-error' : ''}`} aria-live="polite">
      {label}
    </span>
  );
}

const RENAME_DEBOUNCE_MS = 400;

function TitleInput({
  page,
  readOnly,
  onEnter,
}: {
  page: PageDetail;
  readOnly: boolean;
  onEnter: () => void;
}) {
  const qc = useQueryClient();
  const rename = useRenamePage();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(page.title);
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSent = useRef(page.title);

  // Follow renames made on other devices (via the page list), unless we are editing.
  const { data: pages } = usePages();
  const listTitle = pages?.find((p) => p.id === page.id)?.title;
  useEffect(() => {
    if (listTitle === undefined || pending.current) return;
    if (document.activeElement === ref.current) return;
    if (listTitle !== value) {
      setValue(listTitle);
      lastSent.current = listTitle;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listTitle]);

  useEffect(() => {
    if (!page.title && !readOnly) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flush = useCallback(
    (title: string) => {
      clearTimeout(pending.current);
      pending.current = undefined;
      if (title === lastSent.current) return;
      lastSent.current = title;
      rename.mutate({ id: page.id, title });
    },
    [page.id, rename],
  );

  useEffect(() => () => clearTimeout(pending.current), []);

  return (
    <TitleField
      ref={ref}
      value={value}
      readOnly={readOnly}
      onChange={(title) => {
        setValue(title);
        // Keep the sidebar in sync while typing.
        qc.setQueryData<PageSummary[]>(queryKeys.pages, (old) =>
          old?.map((p) => (p.id === page.id ? { ...p, title } : p)),
        );
        clearTimeout(pending.current);
        pending.current = setTimeout(() => flush(title), RENAME_DEBOUNCE_MS);
      }}
      onBlur={() => flush(value)}
      onEnter={() => {
        flush(value);
        onEnter();
      }}
    />
  );
}
