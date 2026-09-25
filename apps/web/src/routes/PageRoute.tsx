import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { usePage } from '../api/queries';
import { PageView } from '../editor/PageView';
import { Topbar } from '../layout/AppLayout';
import { usePageSync } from './usePageSync';

export function PageRoute() {
  const { pageId = '' } = useParams();
  const { t } = useTranslation();
  const query = usePage(pageId);
  usePageSync(pageId);

  if (query.isPending) {
    return (
      <>
        <Topbar />
        <div className="center-screen">{t('app.loading')}</div>
      </>
    );
  }
  if (query.isError) {
    const notFound =
      query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 400);
    return (
      <>
        <Topbar />
        <div className="center-screen">
          <p>{notFound ? t('page.notFound') : t('app.error')}</p>
          {notFound ? (
            <Link className="button" to="/">
              {t('page.backHome')}
            </Link>
          ) : (
            <button className="button" onClick={() => void query.refetch()}>
              {t('app.retry')}
            </button>
          )}
        </div>
      </>
    );
  }
  // Keyed by id: switching pages creates a fresh editor with that page's content.
  return <PageView key={pageId} page={query.data} />;
}
