import type { PageSummary } from '@cotebook/shared';

export interface FlatItem {
  id: string;
  parentId: string | null;
  depth: number;
  page: PageSummary;
  hasChildren: boolean;
}

export function comparePages(a: PageSummary, b: PageSummary) {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function childrenMap(pages: PageSummary[]): Map<string | null, PageSummary[]> {
  const map = new Map<string | null, PageSummary[]>();
  for (const p of pages) {
    const list = map.get(p.parentId) ?? [];
    list.push(p);
    map.set(p.parentId, list);
  }
  for (const list of map.values()) list.sort(comparePages);
  return map;
}

/** Depth-first list of the visible rows (children of collapsed pages are skipped). */
export function flattenTree(
  map: Map<string | null, PageSummary[]>,
  expanded: ReadonlySet<string>,
  collapseId?: string | null,
): FlatItem[] {
  const out: FlatItem[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const page of map.get(parentId) ?? []) {
      const hasChildren = (map.get(page.id)?.length ?? 0) > 0;
      out.push({ id: page.id, parentId, depth, page, hasChildren });
      if (hasChildren && expanded.has(page.id) && page.id !== collapseId) {
        walk(page.id, depth + 1);
      }
    }
  };
  walk(null, 0);
  return out;
}

/** All ancestor ids of a page, nearest first. */
export function ancestorsOf(pages: PageSummary[], id: string): string[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const out: string[] = [];
  let cur = byId.get(id)?.parentId ?? null;
  while (cur && !out.includes(cur)) {
    out.push(cur);
    cur = byId.get(cur)?.parentId ?? null;
  }
  return out;
}

/** The page and all of its descendants. */
export function subtreeIds(pages: PageSummary[], id: string): Set<string> {
  const map = childrenMap(pages);
  const out = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    for (const child of map.get(stack.pop()!) ?? []) {
      if (!out.has(child.id)) {
        out.add(child.id);
        stack.push(child.id);
      }
    }
  }
  return out;
}

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const copy = list.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item!);
  return copy;
}

export interface Projection {
  depth: number;
  parentId: string | null;
  /** Index among the new siblings, excluding the dragged page. */
  index: number;
}

/**
 * Works out where a dragged row would land: the row order comes from the pointer's
 * vertical position (`overId`), the nesting depth from its horizontal offset.
 */
export function projectDrop(
  items: FlatItem[],
  activeId: string,
  overId: string,
  offsetX: number,
  indentWidth: number,
): Projection | null {
  const activeIndex = items.findIndex((i) => i.id === activeId);
  const overIndex = items.findIndex((i) => i.id === overId);
  if (activeIndex < 0 || overIndex < 0) return null;
  const active = items[activeIndex]!;

  const moved = arrayMove(items, activeIndex, overIndex);
  const previous = moved[overIndex - 1];
  const next = moved[overIndex + 1];

  const projected = active.depth + Math.round(offsetX / indentWidth);
  const maxDepth = previous ? previous.depth + 1 : 0;
  const minDepth = next ? next.depth : 0;
  const depth = Math.min(Math.max(projected, minDepth), maxDepth);

  let parentId: string | null = null;
  if (depth > 0 && previous) {
    if (depth === previous.depth) parentId = previous.parentId;
    else if (depth > previous.depth) parentId = previous.id;
    else {
      parentId =
        moved
          .slice(0, overIndex)
          .reverse()
          .find((i) => i.depth === depth)?.parentId ?? null;
    }
  }

  const index = moved.slice(0, overIndex).filter((i) => i.parentId === parentId).length;
  return { depth, parentId, index };
}
