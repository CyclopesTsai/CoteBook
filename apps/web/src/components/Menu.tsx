import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

/** A minimal popover menu anchored to an element, closed by outside click or Escape. */
export function Menu({
  anchor,
  items,
  onClose,
}: {
  anchor: HTMLElement;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const menu = ref.current!.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - menu.width - 8);
    const below = rect.bottom + 4;
    const top = below + menu.height > window.innerHeight ? rect.top - menu.height - 4 : below;
    setPos({ top: Math.max(8, top), left: Math.max(8, left) });
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [anchor]);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      className="menu"
      role="menu"
      style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`menu-item${item.danger ? ' is-danger' : ''}`}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
