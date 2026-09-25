import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { useMe } from './api/queries';
import { LoginPage, RegisterPage } from './auth/AuthPages';
import { AppLayout } from './layout/AppLayout';
import { HomePage } from './routes/HomePage';
import { PageRoute } from './routes/PageRoute';

function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending, isError, refetch } = useMe();
  const location = useLocation();
  const { t } = useTranslation();

  if (isPending) return <div className="center-screen">{t('app.loading')}</div>;
  if (isError) {
    return (
      <div className="center-screen">
        <p>{t('app.networkError')}</p>
        <button className="button" onClick={() => void refetch()}>
          {t('app.retry')}
        </button>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useMe();
  if (isPending) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <LoginPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/register"
        element={
          <RedirectIfAuthed>
            <RegisterPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="p/:pageId" element={<PageRoute />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
