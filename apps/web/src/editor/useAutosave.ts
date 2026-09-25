import type { Block, SaveContentResponse } from '@cotebook/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error' | 'offline' | 'conflict';

const DEBOUNCE_MS = 700;
const RETRY_MS = 4000;

/**
 * Debounced, versioned saving of a page's blocks.
 *
 * Every save sends the version the edits are based on. If another device saved in the
 * meantime the server answers 409 and autosave pauses in the `conflict` state until
 * the user picks a side via `resolveKeepMine` or by loading the remote version.
 */
export function useAutosave({
  pageId,
  initialVersion,
  getBlocks,
  onSaved,
}: {
  pageId: string;
  initialVersion: number;
  getBlocks: () => Block[];
  onSaved: (version: number, blocks: Block[]) => void;
}) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const version = useRef(initialVersion);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const changedDuringSave = useRef(false);
  const conflict = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const alive = useRef(true);

  // Keep the latest callbacks without re-creating `save`.
  const getBlocksRef = useRef(getBlocks);
  const onSavedRef = useRef(onSaved);
  getBlocksRef.current = getBlocks;
  onSavedRef.current = onSaved;

  const save = useCallback(
    async (force = false): Promise<void> => {
      clearTimeout(timer.current);
      if (inFlight.current) {
        changedDuringSave.current = true;
        return;
      }
      if ((!dirty.current && !force) || (conflict.current && !force)) return;

      let blocks: Block[];
      try {
        blocks = getBlocksRef.current();
      } catch {
        return; // The editor has already been torn down.
      }
      let saveAgain = false;
      inFlight.current = true;
      changedDuringSave.current = false;
      setStatus('saving');
      try {
        const res = await api<SaveContentResponse>(`/pages/${pageId}/content`, {
          method: 'PUT',
          body: { baseVersion: version.current, blocks, force },
        });
        version.current = res.version;
        conflict.current = false;
        onSavedRef.current(res.version, blocks);
        if (changedDuringSave.current) {
          saveAgain = true;
          setStatus('unsaved');
        } else {
          dirty.current = false;
          setStatus('saved');
        }
      } catch (err) {
        if (err instanceof ApiError && err.code === 'version_conflict') {
          conflict.current = true;
          setStatus('conflict');
        } else if (err instanceof ApiError && err.status === 404) {
          // The page was deleted elsewhere; nothing to save into.
          dirty.current = false;
          setStatus('saved');
        } else {
          setStatus(err instanceof ApiError && err.code === 'network_error' ? 'offline' : 'error');
          if (alive.current) timer.current = setTimeout(() => void save(), RETRY_MS);
        }
      } finally {
        inFlight.current = false;
      }
      if (saveAgain) {
        // Edits arrived while saving. After the page view is gone, flush them right away.
        if (alive.current) timer.current = setTimeout(() => void save(), DEBOUNCE_MS);
        else void save();
      }
    },
    [pageId],
  );

  const markDirty = useCallback(() => {
    dirty.current = true;
    if (conflict.current) return;
    setStatus((s) => (s === 'saving' ? s : 'unsaved'));
    if (inFlight.current) {
      changedDuringSave.current = true;
      return;
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), DEBOUNCE_MS);
  }, [save]);

  /** Called after remote content has been loaded into the editor. */
  const acceptRemote = useCallback((remoteVersion: number) => {
    clearTimeout(timer.current);
    version.current = remoteVersion;
    dirty.current = false;
    conflict.current = false;
    setStatus('saved');
  }, []);

  const resolveKeepMine = useCallback(() => {
    dirty.current = true;
    void save(true);
  }, [save]);

  // Save pending changes when leaving the page, and warn before closing the tab.
  useEffect(() => {
    alive.current = true;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    const onOnline = () => {
      if (dirty.current) void save();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('online', onOnline);
      clearTimeout(timer.current);
      if (dirty.current && !conflict.current) void save();
      alive.current = false;
    };
  }, [save]);

  return {
    status,
    markDirty,
    acceptRemote,
    resolveKeepMine,
    /** Latest version known to match the editor contents (or the base of local edits). */
    versionRef: version,
    dirtyRef: dirty,
  };
}
