import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, X, Minus, MessagesSquare } from 'lucide-react';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import Routes, { path } from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import Segmented from '@components/Segmented/Segmented';
import OptionRow from '@components/OptionRow/OptionRow';
import Markdown from '@components/Markdown/Markdown';
import EmptyState from '@components/EmptyState/EmptyState';
import ErrorState from '@components/ErrorState/ErrorState';
import { SkeletonList } from '@components/Skeleton/Skeleton';
import styles from './Review.module.scss';

const FILTERS = ['all', 'wrong', 'blank', 'correct', 'flagged'];
const ICON = { correct: Check, wrong: X, blank: Minus };

function Detail({ code, n }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { data: d, isLoading, isError, error, refetch } = useApiQuery(['exam', 'review', code, n], () => api.learningExamReviewItemGet(code, n));
  if (isError) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !d) return <SkeletonList rows={3} height={80} />;
  const rv = d.review;
  const sol = d.solution;
  const stateOf = (o) => {
    if (o.label === rv.correctLabel) return rv.result === 'correct' ? 'correct' : rv.result === 'wrong' ? 'missed' : 'missed';
    if (o.label === rv.selectedLabel) return 'wrong';
    return 'default';
  };
  return (
    <Card className="stack">
      <p className="t-caption muted tnum">{t('exam.sitting.questionOf', { n: d.position, total: d.total })} · {d.question.questionType.name}</p>
      {d.passage && <div className={styles.passage}><div className="reading t-reading-s" lang="en"><Markdown source={d.passage.body} /></div></div>}
      <div className="reading t-reading-m" lang="en">{d.question.stemFormat === 'plain' ? <p>{d.question.stem}</p> : <Markdown source={d.question.stem} />}</div>
      <div className="stack-sm">
        {d.question.options.map((o) => {
          const s = stateOf(o);
          return <OptionRow key={o.label} letter={o.label} state={s} disabled statusLabel={o.label === rv.correctLabel ? t('exam.review.correctOption') : o.label === rv.selectedLabel ? t('exam.review.yourOption') : undefined}>{o.text}</OptionRow>;
        })}
      </div>
      <p className="t-title">{t(`exam.review.result.${rv.result}`)}</p>
      {sol?.explanation && <div className="stack-sm"><h3 className="t-heading-3">{t('exam.review.explanation')}</h3><Markdown source={sol.explanation} />{sol.options?.filter((o) => o.rationale).map((o) => <p key={o.label} className="t-body-s muted"><strong>{o.label}.</strong> {o.rationale}</p>)}</div>}
      <Button variant="secondary" startIcon={<MessagesSquare size={16} />} onClick={() => nav(`${Routes.tutorChat.replace(':code', 'yeni')}?kind=mock_review&sessionCode=${code}&position=${n}`)}>{t('exam.review.askTutor')}</Button>
    </Card>
  );
}

// EXAM-12: soru soru inceleme. GET /review?filter= ve /review/{n}
export default function Review() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { code } = useParams();
  const [sp, setSp] = useSearchParams();
  const filter = sp.get('filter') || 'all';
  const n = sp.get('n');
  const { data, isLoading, isError, error, refetch } = useApiQuery(['exam', 'reviewList', code, filter], () => api.learningExamReviewList(code, filter));
  const set = (patch) => setSp((p) => { const x = new URLSearchParams(p); Object.entries(patch).forEach(([k, v]) => (v == null ? x.delete(k) : x.set(k, v))); return x; }, { replace: true });

  return (
    <div className={styles.page}>
      <PageHeader title={t('exam.review.title')} actions={<Button variant="tertiary" onClick={() => nav(path(Routes.examResult, { code }))}>{t('exam.analysis.back')}</Button>} />
      <Segmented label={t('exam.review.filter')} value={filter} onChange={(v) => set({ filter: v === 'all' ? null : v, n: null })} options={FILTERS.map((f) => ({ value: f, label: t(`exam.review.filters.${f}`) }))} />
      <div className={styles.grid}>
        <div>
          {isError && <ErrorState error={error} onRetry={refetch} />}
          {isLoading && <SkeletonList rows={6} height={56} />}
          {data && data.items.length === 0 && <EmptyState title={t('exam.review.empty')} />}
          {data && (
            <ul className={styles.list}>
              {data.items.map((it) => {
                const Icon = ICON[it.result];
                return (
                  <li key={it.position}>
                    <button type="button" className={styles.item} aria-current={String(it.position) === n ? 'true' : undefined} onClick={() => set({ n: it.position })}>
                      <span className={styles[it.result]}><Icon size={16} aria-hidden /> <span className="sr-only">{t(`exam.review.result.${it.result}`)}</span></span>
                      <span className="grow"><span className="t-label-m tnum">{it.position}. {it.type.name}</span><span className="t-body-s muted" style={{ display: 'block' }}>{it.stemPreview}</span></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div>{n ? <Detail code={code} n={n} /> : data?.items.length > 0 && <p className="muted">{t('exam.review.pick')}</p>}</div>
      </div>
    </div>
  );
}
