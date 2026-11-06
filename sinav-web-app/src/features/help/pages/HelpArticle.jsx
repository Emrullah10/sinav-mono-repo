import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import api from '@api';
import Markdown from '@components/Markdown/Markdown';
import ListRow from '@components/ListRow/ListRow';
import { SkeletonList } from '@components/Skeleton/Skeleton';
import ErrorState from '@components/ErrorState/ErrorState';
import useApiQuery from '@hooks/useApiQuery';
import Routes, { path } from '@shared/constant/route-paths';
import HelpShell from '../components/HelpShell';
import ContactCard from '../components/ContactCard';
import styles from '../Help.module.scss';

// /yardim/:slug — tek yardım makalesi (Markdown, güvenli bileşen) + ilgili makaleler + "Bize yaz".
export default function HelpArticle() {
  const { slug } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const q = useApiQuery(['help', 'article', slug], () => api.contentPublicArticleGet('help', slug));
  const a = q.data;
  return (
    <HelpShell>
      <Link to={Routes.help} className={styles.back}><ArrowLeft size={16} aria-hidden />{t('help.title')}</Link>
      {q.isLoading && <SkeletonList rows={5} height={24} />}
      {q.isError && <ErrorState error={q.error} onRetry={q.refetch} />}
      {a && (
        <article className={styles.article} lang={a.language || undefined}>
          {a.category?.name && <p className={`t-label-m ${styles.eyebrow}`}>{a.category.name}</p>}
          <h1 className="t-heading-1">{a.title}</h1>
          <Markdown source={a.bodyMd} />
        </article>
      )}
      {a?.related?.length > 0 && (
        <section className={styles.group} aria-labelledby="help-related">
          <h2 id="help-related" className="t-heading-3">{t('help.related')}</h2>
          <div className={styles.list}>
            {a.related.map((r) => <ListRow key={r.code} title={r.title} onClick={() => nav(path(Routes.helpArticle, { slug: r.slug }))} />)}
          </div>
        </section>
      )}
      <ContactCard />
    </HelpShell>
  );
}
