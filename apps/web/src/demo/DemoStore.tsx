import type { PageSummary } from '@cotebook/shared';
import { generateKeyBetween } from 'fractional-indexing';
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { PartialEditorBlock } from '../editor/schema';
import { comparePages, subtreeIds } from '../sidebar/tree';
import { getDemoContent } from './content';

interface DemoStore {
  pages: PageSummary[];
  getBlocks: (id: string) => PartialEditorBlock[];
  setBlocks: (id: string, blocks: PartialEditorBlock[]) => void;
  createPage: (parentId: string | null) => string;
  renamePage: (id: string, title: string) => void;
  movePage: (id: string, parentId: string | null, index: number) => void;
  /** Removes the page and its subpages; returns the removed ids. */
  deletePage: (id: string) => Set<string>;
}

const DemoContext = createContext<DemoStore | null>(null);

/** In-memory page store for demo mode. Nothing leaves the browser tab. */
export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [initial] = useState(() => getDemoContent(i18n.resolvedLanguage ?? 'en'));
  const [pages, setPages] = useState<PageSummary[]>(initial.pages);
  // Editor content changes on every keystroke; keep it out of React state.
  const blocks = useRef<Record<string, PartialEditorBlock[]>>(initial.blocks);
  const nextId = useRef(1);

  const store = useMemo<DemoStore>(() => {
    const touch = (p: PageSummary): PageSummary => ({ ...p, updatedAt: new Date().toISOString() });
    const keyAt = (list: PageSummary[], parentId: string | null, index: number, skip?: string) => {
      const siblings = list
        .filter((p) => p.parentId === parentId && p.id !== skip)
        .sort(comparePages);
      const i = Math.max(0, Math.min(index, siblings.length));
      return generateKeyBetween(siblings[i - 1]?.position ?? null, siblings[i]?.position ?? null);
    };

    return {
      pages,
      getBlocks: (id) => blocks.current[id] ?? [],
      setBlocks: (id, value) => {
        blocks.current[id] = value;
      },
      createPage: (parentId) => {
        const id = `demo-new-${nextId.current++}`;
        const page: PageSummary = {
          id,
          parentId,
          title: '',
          position: keyAt(pages, parentId, Number.MAX_SAFE_INTEGER),
          icon: null,
          updatedAt: new Date().toISOString(),
        };
        blocks.current[id] = [];
        setPages((prev) => [...prev, page]);
        return id;
      },
      renamePage: (id, title) =>
        setPages((prev) => prev.map((p) => (p.id === id ? touch({ ...p, title }) : p))),
      movePage: (id, parentId, index) =>
        setPages((prev) => {
          const position = keyAt(prev, parentId, index, id);
          return prev.map((p) => (p.id === id ? touch({ ...p, parentId, position }) : p));
        }),
      deletePage: (id) => {
        const removed = subtreeIds(pages, id);
        setPages((prev) => prev.filter((p) => !removed.has(p.id)));
        for (const r of removed) delete blocks.current[r];
        return removed;
      },
    };
  }, [pages]);

  return <DemoContext.Provider value={store}>{children}</DemoContext.Provider>;
}

export function useDemoStore(): DemoStore {
  const store = useContext(DemoContext);
  if (!store) throw new Error('useDemoStore must be used inside DemoStoreProvider');
  return store;
}
