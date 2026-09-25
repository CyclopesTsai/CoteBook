import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCreatePage } from '../api/queries';
import { PlusIcon } from '../components/icons';
import { Topbar } from '../layout/AppLayout';

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createPage = useCreatePage();

  return (
    <>
      <Topbar />
      <div className="content-scroll">
        <div className="home">
          <h1>{t('home.welcome')}</h1>
          <p>{t('home.hint')}</p>
          <button
            type="button"
            className="button button-primary"
            disabled={createPage.isPending}
            onClick={() =>
              createPage.mutate({}, { onSuccess: (page) => navigate(`/p/${page.id}`) })
            }
          >
            <PlusIcon width={16} height={16} />
            {t('home.create')}
          </button>
        </div>
      </div>
    </>
  );
}
