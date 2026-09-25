import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useMatch } from 'react-router-dom';
import { useSyncEvents } from '../api/sync';
import { MenuIcon } from '../components/icons';
import { SearchDialog } from '../search/SearchDialog';
import { Sidebar } from '../sidebar/Sidebar';

const LayoutContext = createContext<{ openSidebar: () => void }>({ openSidebar: () => {} });

export function AppLayout() {
  const location = useLocation();
  const match = useMatch('/p/:pageId');
  const activePageId = match?.params.pageId ?? null;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useSyncEvents(true);

  // On small screens the sidebar is a drawer; close it after navigating.
  useEffect(() => setSidebarOpen(false), [location.pathname]);

  return (
    <LayoutContext.Provider value={{ openSidebar: () => setSidebarOpen(true) }}>
      <div className={`app-shell${sidebarOpen ? ' sidebar-open' : ''}`}>
        <Sidebar
          activePageId={activePageId}
          onOpenSearch={() => {
            setSidebarOpen(false);
            setSearchOpen(true);
          }}
          onClose={() => setSidebarOpen(false)}
        />
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
        <main className="main">
          <Outlet />
        </main>
      </div>
      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}
    </LayoutContext.Provider>
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
