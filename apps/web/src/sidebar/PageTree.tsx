import type { PageSummary } from '@cotebook/shared';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useMovePage } from '../api/queries';
import { Menu } from '../components/Menu';
import { ChevronRightIcon, MoreIcon, PlusIcon, TrashIcon } from '../components/icons';
import { childrenMap, flattenTree, projectDrop, type FlatItem, type Projection } from './tree';

const INDENT = 14;
const BASE_PADDING = 4;

interface PageTreeProps {
  pages: PageSummary[];
  activeId: string | null;
  expanded: ReadonlySet<string>;
  onToggle: (id: string, expanded?: boolean) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (page: PageSummary) => void;
}

export function PageTree({
  pages,
  activeId,
  expanded,
  onToggle,
  onAddChild,
  onDelete,
}: PageTreeProps) {
  const { t } = useTranslation();
  const move = useMovePage();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetX, setOffsetX] = useState(0);

  const map = useMemo(() => childrenMap(pages), [pages]);
  // While dragging, the dragged page's subtree travels with it and is hidden.
  const items = useMemo(() => flattenTree(map, expanded, dragId), [map, expanded, dragId]);
  const ids = useMemo(() => items.map((i) => i.id), [items]);

  const projection: Projection | null =
    dragId && overId ? projectDrop(items, dragId, overId, offsetX, INDENT) : null;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );

  const reset = () => {
    setDragId(null);
    setOverId(null);
    setOffsetX(0);
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    setDragId(String(active.id));
    setOverId(String(active.id));
  };
  const onDragMove = ({ delta, over }: DragMoveEvent) => {
    setOffsetX(delta.x);
    if (over) setOverId(String(over.id));
  };
  const onDragEnd = ({ active }: DragEndEvent) => {
    const id = String(active.id);
    const p = projection;
    reset();
    if (!p) return;
    const page = pages.find((x) => x.id === id);
    if (!page) return;
    const currentIndex = (map.get(page.parentId) ?? []).findIndex((x) => x.id === id);
    if (p.parentId === page.parentId && p.index === currentIndex) return;
    if (p.parentId) onToggle(p.parentId, true);
    move.mutate(
      { id, parentId: p.parentId, index: p.index },
      { onError: () => window.alert(t('sidebar.moveFailed')) },
    );
  };

  const dragItem = dragId ? items.find((i) => i.id === dragId) : undefined;
  const titleOf = (id: string | number) =>
    pages.find((p) => p.id === id)?.title || t('page.untitled');
  const announcements = {
    onDragStart: ({ active }: { active: { id: string | number } }) =>
      t('sidebar.dragStart', { title: titleOf(active.id) }),
    onDragOver: () => undefined,
    onDragEnd: ({ active }: { active: { id: string | number } }) =>
      t('sidebar.dragEnd', { title: titleOf(active.id) }),
    onDragCancel: ({ active }: { active: { id: string | number } }) =>
      t('sidebar.dragCancel', { title: titleOf(active.id) }),
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
      accessibility={{ announcements }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul style={{ margin: 0, padding: 0 }} role="tree">
          {items.map((item) => (
            <TreeRow
              key={item.id}
              item={item}
              depth={item.id === dragId && projection ? projection.depth : item.depth}
              isActive={item.id === activeId}
              isExpanded={expanded.has(item.id)}
              onToggle={onToggle}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))}
        </ul>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {dragItem ? (
          <div className="tree-row is-overlay" style={{ paddingLeft: 8 }}>
            <span className={`tree-title${dragItem.page.title ? '' : ' is-untitled'}`}>
              {dragItem.page.title || t('page.untitled')}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function TreeRow({
  item,
  depth,
  isActive,
  isExpanded,
  onToggle,
  onAddChild,
  onDelete,
}: {
  item: FlatItem;
  depth: number;
  isActive: boolean;
  isExpanded: boolean;
  onToggle: (id: string, expanded?: boolean) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (page: PageSummary) => void;
}) {
  const { t } = useTranslation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  // Only the pointer listeners are used: dnd-kit's a11y attributes would turn the row
  // into a button that wraps other buttons.
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const title = item.page.title || t('page.untitled');

  return (
    <li
      className="tree-item"
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      role="treeitem"
      aria-expanded={item.hasChildren ? isExpanded : undefined}
      aria-selected={isActive}
    >
      <div
        className={`tree-row${isActive ? ' is-active' : ''}${isDragging ? ' is-dragging' : ''}`}
        style={{ paddingLeft: BASE_PADDING + depth * INDENT }}
        {...listeners}
      >
        <button
          type="button"
          className={`icon-button tree-chevron${isExpanded ? ' is-expanded' : ''}`}
          style={{ visibility: item.hasChildren ? 'visible' : 'hidden' }}
          aria-label={isExpanded ? t('sidebar.collapse') : t('sidebar.expand')}
          onClick={() => onToggle(item.id)}
        >
          <ChevronRightIcon />
        </button>
        <Link
          to={`/p/${item.id}`}
          className={`tree-title${item.page.title ? '' : ' is-untitled'}`}
          draggable={false}
        >
          {title}
        </Link>
        <div className={`tree-row-actions${menuAnchor ? ' is-open' : ''}`}>
          <button
            type="button"
            className="icon-button"
            aria-label={t('sidebar.more')}
            title={t('sidebar.more')}
            onClick={(e) => setMenuAnchor(e.currentTarget)}
          >
            <MoreIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={t('sidebar.addSubpage')}
            title={t('sidebar.addSubpage')}
            onClick={() => onAddChild(item.id)}
          >
            <PlusIcon />
          </button>
        </div>
      </div>
      {menuAnchor && (
        <Menu
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          items={[
            {
              label: t('sidebar.delete'),
              icon: <TrashIcon />,
              danger: true,
              onSelect: () => onDelete(item.page),
            },
          ]}
        />
      )}
    </li>
  );
}
