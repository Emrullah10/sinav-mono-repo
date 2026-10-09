import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pin, Plus, Search, MessagesSquare } from 'lucide-react';
import dayjs from 'dayjs';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import Routes, { path } from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import Button from '@components/Button/Button';
import Card from '@components/Card/Card';
import Chip from '@components/Chip/Chip';
import ProgressBar from '@components/ProgressBar/ProgressBar';
import TextInput from '@components/TextInput/TextInput';
import Banner from '@components/Banner/Banner';
import EmptyState from '@components/EmptyState/EmptyState';
import ErrorState from '@components/ErrorState/ErrorState';
import { SkeletonList } from '@components/Skeleton/Skeleton';
import styles from './Home.module.scss';

// TUTOR-01: öğretmen ana ekranı. GET /overview
export default function Home() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const { data, isLoading, isError, error, refetch } = useApiQuery(['tutor', 'overview'], () => api.tutorOverviewGet({ limit: 100 }));
  const list = useMemo(() => {
    const s = q.trim().toLocaleLowerCase('tr-TR');
    return (data?.conversations || []).filter((c) => !s || `${c.title} ${c.lastMessagePreview || ''}`.toLocaleLowerCase('tr-TR').includes(s));
  }, [data, q]);

  if (isError) return <div className={styles.page}><ErrorState error={error} onRetry={refetch} /></div>;
  const u = data?.usage;
  const exhausted = u?.enabled && u.limit != null && u.remaining === 0;

  return (
    <div className={styles.page}>
      <PageHeader title={t('tutor.title')} subtitle={t('tutor.subtitle')} actions={<Button startIcon={<Plus size={18} />} onClick={() => nav(Path.newChat)} disabled={data?.llmAvailable === false}>{t('tutor.newChat')}</Button>} />
      {data?.llmAvailable === false && <Banner tone="warning" title={t('tutor.llmDown.title')}>{t('tutor.llmDown.body')}</Banner>}
      {isLoading && <SkeletonList rows={4} />}
      {data && (
        <div className={styles.grid}>
          <section className="stack" aria-label={t('tutor.history')}>
            <TextInput label={t('tutor.search')} value={q} onChange={(e) => setQ(e.target.value)} endAdornment={<Search size={18} aria-hidden />} />
            {list.length === 0 ? (
              <EmptyState icon={<MessagesSquare size={32} />} title={t(q ? 'tutor.noResults' : 'tutor.empty.title')} body={q ? undefined : t('tutor.empty.body')} action={!q && <Button onClick={() => nav(Path.newChat)}>{t('tutor.newChat')}</Button>} />
            ) : (
              <ul className={styles.list}>
                {list.map((c) => (
                  <li key={c.code}>
                    <Link to={path(Routes.tutorChat, { code: c.code })} className={styles.item}>
                      <span className="row">{c.pinned && <Pin size={14} aria-label={t('tutor.pinned')} />}<strong className="t-title grow">{c.title}</strong><span className="t-caption muted">{dayjs(c.lastMessageAt || c.createdAt).format('D MMM HH:mm')}</span></span>
                      {c.lastMessagePreview && <span className={`muted t-body-s ${styles.preview}`}>{c.lastMessagePreview}</span>}
                      <span className="row"><Chip size="sm">{t(`enums.tutor_mode.${c.mode}`)}</Chip>{c.context && <Chip size="sm" tone="accent">{c.context.label}</Chip>}<span className="t-caption muted">{t('tutor.messageCount', { n: c.messageCount })}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <aside className="stack">
            <Card className="stack-sm">
              <h2 className="t-heading-3">{t('tutor.usage.title')}</h2>
              {u?.enabled ? (
                <>
                  <p className="t-body-m tnum">{u.limit == null ? t('tutor.usage.unlimited') : t('tutor.usage.used', { used: u.used, limit: u.limit })}</p>
                  {u.limit != null && <ProgressBar value={(u.used / u.limit) * 100} label={t('tutor.usage.title')} tone={exhausted ? 'reward' : 'accent'} />}
                  {u.limit != null && <p className="t-caption muted">{t('tutor.usage.resets')}</p>}
                  {data.tier === 'free' && <Button variant={exhausted ? 'primary' : 'secondary'} size="sm" onClick={() => nav(Routes.plans)}>{t('tutor.limit.cta')}</Button>}
                </>
              ) : <p className="muted">{t('tutor.usage.disabled')}</p>}
            </Card>
            {data.starters.length > 0 && (
              <Card className="stack-sm">
                <h2 className="t-heading-3">{t('tutor.starters')}</h2>
                <div className={styles.chips}>
                  {data.starters.map((s) => (
                    <Chip key={s.code} onClick={() => nav(Path.newChat, { state: { starter: { mode: s.mode, text: s.text } } })}>{s.text}</Chip>
                  ))}
                </div>
              </Card>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
const Path = { newChat: Routes.tutorChat.replace(':code', 'yeni') };
