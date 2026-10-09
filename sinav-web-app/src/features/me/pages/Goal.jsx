import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import { queryClient } from '@shared/providers/QueryProvider';
import useEnrollment, { ENROLLMENT_KEY } from '@features/onboarding/hooks/useEnrollment';
import Routes from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import Segmented from '@components/Segmented/Segmented';
import Select from '@components/Select/Select';
import TextInput from '@components/TextInput/TextInput';
import ErrorState from '@components/ErrorState/ErrorState';
import EmptyState from '@components/EmptyState/EmptyState';
import Skeleton from '@components/Skeleton/Skeleton';
import styles from '../components/page.module.scss';

// ME-03: hedef ve sınav ayarları. GET /enrollments/active → PATCH /enrollments/{code}
export default function Goal() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { enrollment: e, isLoading, isError, error, refetch } = useEnrollment();
  const track = useApiQuery(['me', 'track', e?.track?.key], () => api.contentPublicTrackGet(e.track.key), { enabled: !!e?.track?.key });
  const [score, setScore] = useState('');
  const [dateMode, setDateMode] = useState('unknown');
  const [session, setSession] = useState('');
  const [custom, setCustom] = useState('');
  useEffect(() => {
    if (!e) return;
    setScore(String(e.targetScore ?? ''));
    setDateMode(e.dateMode);
    setSession(e.examSession?.key || '');
    setCustom(e.customExamDate || '');
  }, [e]);

  const sessions = (track.data?.sessions || []).filter((s) => s.status !== 'held' && !dayjs(s.examDate).isBefore(dayjs(), 'day'));
  const max = e?.scoreMax || 100;
  const valid = Number(score) >= 1 && Number(score) <= max && (dateMode === 'unknown' || (dateMode === 'session' && session) || (dateMode === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(custom)));
  const save = useApiMutation(() => api.learningEnrollmentUpdate(e.code, {
    targetScore: Number(score), dateMode,
    ...(dateMode === 'session' ? { examSessionKey: session } : {}), ...(dateMode === 'custom' ? { customExamDate: custom } : {}),
  }), { successMessage: 'me.goal.saved', onSuccess: () => { queryClient.invalidateQueries({ queryKey: ENROLLMENT_KEY }); queryClient.invalidateQueries({ queryKey: ['me'] }); } });

  if (isError) return <div className={styles.page}><ErrorState error={error} onRetry={refetch} /></div>;
  if (isLoading) return <div className={styles.page}><Skeleton height={300} radius={16} /></div>;
  if (!e) return <div className={styles.page}><EmptyState title={t('me.goal.none')} action={<Button onClick={() => nav(Routes.onbExam)}>{t('me.goal.choose')}</Button>} /></div>;

  return (
    <div className={styles.page}>
      <PageHeader eyebrow={e.exam.shortName} title={t('me.goal.title')} subtitle={e.track.name} />
      <Card className="stack">
        <TextInput label={t('me.goal.target', { max })} type="number" inputMode="numeric" min={1} max={max} value={score} onChange={(ev) => setScore(ev.target.value)} helper={Number(score) > 0 ? t('me.goal.needed', { n: Math.ceil((Number(score) / max) * e.questionCount) }) : undefined} />
        <div className="stack-sm">
          <h2 className="t-title">{t('me.goal.date')}</h2>
          <Segmented label={t('me.goal.date')} value={dateMode} onChange={setDateMode} options={['session', 'custom', 'unknown'].map((m) => ({ value: m, label: t(`me.goal.mode.${m}`) }))} />
          {dateMode === 'session' && <Select label={t('me.goal.session')} value={session} onChange={(ev) => setSession(ev.target.value)} options={[{ value: '', label: t('me.goal.pick') }, ...sessions.map((s) => ({ value: s.key, label: `${s.name} · ${dayjs(s.examDate).format('D MMMM YYYY')}` }))]} />}
          {dateMode === 'custom' && <TextInput label={t('me.goal.customDate')} type="date" value={custom} onChange={(ev) => setCustom(ev.target.value)} />}
          {e.daysToExam != null && <p className="muted t-body-s">{t('me.goal.daysLeft', { n: e.daysToExam })}</p>}
        </div>
        <div className="row"><Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button><Button variant="tertiary" onClick={() => nav(Routes.me)}>{t('common.back')}</Button></div>
      </Card>
    </div>
  );
}
