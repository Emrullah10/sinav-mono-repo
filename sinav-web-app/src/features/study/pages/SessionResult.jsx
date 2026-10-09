import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, X, Minus } from 'lucide-react';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import Routes, { path } from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import Banner from '@components/Banner/Banner';
import ProgressRing from '@components/ProgressRing/ProgressRing';
import ErrorState from '@components/ErrorState/ErrorState';
import Skeleton from '@components/Skeleton/Skeleton';
import EmptyState from '@components/EmptyState/EmptyState';
import usePracticeStart from '../hooks/usePracticeStart';

const Delta = ({ c }) => (
  <li className="row" style={{ justifyContent: 'space-between' }}>
    <span>{c.name}</span>
    <span className="tnum muted">{Math.round(c.before)} → {Math.round(c.after)} ({c.delta > 0 ? '+' : ''}{Math.round(c.delta)})</span>
  </li>
);

// STUDY-12: POST /sessions/{code}/complete (idempotent) sonrası GET /sessions/{code}/result.
export default function SessionResult() {
  const { code } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const extra = useLocation().state?.extra;
  const q = useApiQuery(['learning', 'session', code, 'result'], () => api.learningSessionResultGet(code), { retry: false });
  const start = usePracticeStart();
  const retry = useApiMutation(() => api.learningMistakeReviewStart({}), { onSuccess: (r) => (r.empty ? nav(Routes.mistakes) : nav(path(Routes.session, { code: r.code }))) });
  if (q.isLoading) return <Skeleton height={320} />;
  if (q.isError) {
    if (q.error?.response?.data?.error?.code === 'SESSION_NOT_FINISHED') {
      return <EmptyState title={t('study.result.notFinished')} action={<Button onClick={() => nav(path(Routes.session, { code }))}>{t('study.result.resume')}</Button>} />;
    }
    return <ErrorState error={q.error} onRetry={q.refetch} />;
  }
  const r = q.data;
  const tot = r.totals;
  const acc = Math.round(tot.accuracy <= 1 ? tot.accuracy * 100 : tot.accuracy);
  const sec = Math.round(r.time.totalSeconds || 0);
  const next = r.nextActions || {};
  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <PageHeader title={t('study.result.title')} subtitle={t('study.result.counts', { correct: tot.correct, wrong: tot.wrong, blank: tot.blank })}
        actions={<Button variant="secondary" onClick={() => nav(Routes.today)}>{t('study.result.today')}</Button>} />
      <Card>
        <div className="row" style={{ gap: 'var(--space-6)', flexWrap: 'wrap' }}>
          <ProgressRing value={acc} size={120} label={t('study.result.accuracy', { n: acc })}><span className="t-numeric-m tnum">%{acc}</span></ProgressRing>
          <div className="stack-sm">
            <p className="t-heading-2">{t('study.result.total', { total: tot.total, correct: tot.correct })}</p>
            <p className="muted t-body-s">{t('study.result.time')}: {t('study.result.timeValue', { min: Math.floor(sec / 60), sec: sec % 60 })} · {t('study.result.avg', { n: Math.round(r.time.avgSecondsPerQuestion || 0) })}</p>
            {(r.hints.used > 0 || r.hints.solutionsViewed > 0) && <p className="muted t-body-s">{t('study.result.hints')}: {t('study.result.hintsLine', { used: r.hints.used, solutions: r.hints.solutionsViewed })}</p>}
          </div>
        </div>
      </Card>
      {extra?.total != null && <Banner tone={extra.understood ? 'success' : 'info'}>{t('study.result.noteCheck', { correct: extra.correct, total: extra.total })} {extra.understood && t('study.result.noteUnderstood')}</Banner>}
      {(r.typeChanges?.length > 0 || r.skillChanges?.length > 0) && (
        <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {r.typeChanges?.length > 0 && <Card><div className="stack-sm"><h2 className="t-heading-3">{t('study.result.typeChanges')}</h2><ul style={{ listStyle: 'none', padding: 0, margin: 0 }} className="stack-sm">{r.typeChanges.map((c) => <Delta key={c.typeKey} c={c} />)}</ul></div></Card>}
          {r.skillChanges?.length > 0 && <Card><div className="stack-sm"><h2 className="t-heading-3">{t('study.result.skillChanges')}</h2><ul style={{ listStyle: 'none', padding: 0, margin: 0 }} className="stack-sm">{r.skillChanges.map((c) => <Delta key={c.skillKey} c={c} />)}</ul></div></Card>}
        </div>
      )}
      <Card>
        <div className="stack-sm">
          <h2 className="t-heading-3">{t('study.result.items')}</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} className="stack-sm">
            {r.items.map((i) => (
              <li key={i.position} className="row">
                <span aria-hidden>{i.isCorrect === true ? <Check size={18} /> : i.isCorrect === false ? <X size={18} /> : <Minus size={18} />}</span>
                <span className="grow t-body-m"><strong>{i.position}.</strong> {i.typeName}{i.stemPreview ? ` · ${i.stemPreview}` : ''}</span>
                <span className="t-caption muted">{i.isCorrect === true ? t('study.session.correct') : i.isCorrect === false ? t('study.session.wrong') : t('study.result.blank')}</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
      <section className="stack-sm">
        <h2 className="t-heading-3">{t('study.result.next')}</h2>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {next.retryMistakes && tot.wrong > 0 && <Button loading={retry.isPending} onClick={() => retry.mutate()}>{t('study.result.retryMistakes')}</Button>}
          {next.similar && <Button variant="secondary" loading={start.isPending} onClick={() => start.mutate({ ...(next.similar.questionTypeKeys?.length ? { questionTypeKeys: next.similar.questionTypeKeys } : {}), ...(next.similar.skillKeys?.length ? { skillKeys: next.similar.skillKeys } : {}), count: next.similar.count || 10 })}>{t('study.result.similar')}</Button>}
          {next.noteItemCode && <Button variant="secondary" onClick={() => nav(path(Routes.note, { id: next.noteItemCode }))}>{t('study.result.note')}</Button>}
          <Button variant="tertiary" onClick={() => nav(Routes.study)}>{t('study.result.hub')}</Button>
        </div>
      </section>
    </div>
  );
}
