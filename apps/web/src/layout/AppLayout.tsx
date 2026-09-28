import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useMatch } from 'react-router-dom';
import { useSyncEvents } from '../api/sync';
import { MenuIcon } from '../components/icons';
import { SearchDialog } from '../search/SearchDialog';
import { Sidebar } from '../sidebar/Sidebar';

const LayoutContext = createContext<{ openSidebar: () => void }>({ openSidebar: () => {} });

/**
 * Sidebar + main area. On small screens the sidebar becomes a drawer that closes after
 * navigating. Shared by the normal app and the database-less demo.
 */
export function LayoutShell({
  renderSidebar,
  children,
}: {
  renderSidebar: (closeSidebar: () => void) => ReactNode;
  children: ReactNode;
}) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const close = () => setSidebarOpen(false);

  useEffect(() => setSidebarOpen(false), [location.pathname]);

  return (
    <LayoutContext.Provider value={{ openSidebar: () => setSidebarOpen(true) }}>
      <div className={`app-shell${sidebarOpen ? ' sidebar-open' : ''}`}>
        {renderSidebar(close)}
        <div className="sidebar-backdrop" onClick={close} />
        <main className="main">{children}</main>
      </div>
    </LayoutContext.Provider>
  );
}

export function AppLayout() {
  const match = useMatch('/p/:pageId');
  const activePageId = match?.params.pageId ?? null;
  const [searchOpen, setSearchOpen] = useState(false);

  useSyncEvents(true);

  return (
    <>
      <LayoutShell
        renderSidebar={(closeSidebar) => (
          <Sidebar
            activePageId={activePageId}
            onOpenSearch={() => {
              closeSidebar();
              setSearchOpen(true);
            }}
            onClose={closeSidebar}
          />
        )}
      >
        <Outlet />
      </LayoutShell>
      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}
    </>
  );
}

/** Top bar of the main area. On mobile it carries the button that opens the sidebar. */
export function Topbar({ title, children }: { title?: ReactNode; children?: ReactNode }) {
  const { openSidebar } = useContext(LayoutContext);
  const { t } = useTranslation();
  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-button menu-toggle"
        aria-label={t('sidebar.openMenu')}
        onClick={openSidebar}
      >
        <MenuIcon />
      </button>
      <div className="topbar-title">{title}</div>
      {children}
    </header>
  );
}
