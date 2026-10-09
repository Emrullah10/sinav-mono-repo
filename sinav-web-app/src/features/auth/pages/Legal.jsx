import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import api from '@api';
import Markdown from '@components/Markdown/Markdown';
import { SkeletonList } from '@components/Skeleton/Skeleton';
import ErrorState from '@components/ErrorState/ErrorState';
import useApiQuery from '@hooks/useApiQuery';
import styles from './Legal.module.scss';

// /yasal/:type — bodyMd güvenli Markdown bileşeniyle.
export default function Legal() {
  const { type } = useParams();
  const { t, i18n } = useTranslation();
  const q = useApiQuery(['legal', type, i18n.language], () => api.identityPublicLegalGet(type, { locale: i18n.language.slice(0, 2) }));
  const d = q.data;
  return (
    <article className={styles.page}>
      {q.isLoading && <SkeletonList rows={5} height={24} />}
      {q.isError && <ErrorState error={q.error} onRetry={q.refetch} />}
      {d && (
        <>
          <h1 className="t-heading-1">{d.title || t(`legal.title.${type}`)}</h1>
          <p className="t-caption muted">{t('legal.version', { v: d.version, date: dayjs(d.publishedAt).format('D MMMM YYYY') })}</p>
          <Markdown source={d.bodyMd} />
        </>
      )}
    </article>
  );
}
