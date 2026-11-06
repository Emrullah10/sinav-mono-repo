import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import api from '@api';
import TextInput from '@components/TextInput/TextInput';
import ListRow from '@components/ListRow/ListRow';
import { SkeletonList } from '@components/Skeleton/Skeleton';
import ErrorState from '@components/ErrorState/ErrorState';
import EmptyState from '@components/EmptyState/EmptyState';
import useApiQuery from '@hooks/useApiQuery';
import Routes, { path } from '@shared/constant/route-paths';
import HelpShell from '../components/HelpShell';
import ContactCard from '../components/ContactCard';
import Snippet from '../components/Snippet';
import styles from '../Help.module.scss';

// /yardim — kategorilere göre yardım makaleleri + arama (en az 2 harf, 300 ms bekleyerek).
export default function HelpCenter() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(id);
  }, [text]);
  const searching = q.length >= 2;
  const cats = useApiQuery(['help', 'categories'], () => api.contentPublicArticleCategoriesList({ type: 'help' }));
  const list = useApiQuery(['help', 'articles'], () => api.contentPublicArticlesList({ type: 'help', pageSize: 100 }));
  const found = useApiQuery(['help', 'search', q], () => api.contentPublicArticlesSearch({ q, type: 'help', limit: 20 }), { enabled: searching });
  const groups = useMemo(() => {
    const items = list.data?.items || [];
    return (cats.data?.items || []).map((c) => ({ ...c, items: items.filter((a) => a.category?.key === c.key) })).filter((g) => g.items.length);
  }, [cats.data, list.data]);
  const open = (slug) => nav(path(Routes.helpArticle, { slug }));
  const err = [cats, list].find((x) => x.isError);

  return (
    <HelpShell>
      <section className={styles.hero}>
        <h1 className="t-display-m">{t('help.title')}</h1>
        <p className="muted t-body-l">{t('help.subtitle')}</p>
        <TextInput
          type="text"
          inputMode="search"
          enterKeyHint="search"
          label={t('help.searchLabel')}
          placeholder={t('help.searchPlaceholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          endAdornment={<Search size={18} aria-hidden />}
        />
      </section>

      {searching ? (
        <section aria-live="polite">
          {found.isLoading && <SkeletonList rows={3} height={56} />}
          {found.isError && <ErrorState error={found.error} onRetry={found.refetch} />}
          {found.data && (found.data.items.length ? (
            <div className={styles.list}>
              {found.data.items.map((a) => <ListRow key={a.code} title={a.title} onClick={() => open(a.slug)}><Snippet text={a.snippet} /></ListRow>)}
            </div>
          ) : <p className="muted t-body-m">{t('help.noResults', { q })}</p>)}
        </section>
      ) : (
        <>
          {(cats.isLoading || list.isLoading) && <SkeletonList rows={6} height={48} />}
          {err && <ErrorState error={err.error} onRetry={() => { cats.refetch(); list.refetch(); }} />}
          {cats.data && list.data && !groups.length && <EmptyState title={t('help.empty')} />}
          {groups.map((g) => (
            <section key={g.key} className={styles.group} aria-labelledby={`help-${g.key}`}>
              <h2 id={`help-${g.key}`} className="t-heading-3">{g.name}</h2>
              <div className={styles.list}>
                {g.items.map((a) => <ListRow key={a.code} title={a.title} onClick={() => open(a.slug)} />)}
              </div>
            </section>
          ))}
        </>
      )}
      <ContactCard />
    </HelpShell>
  );
}
