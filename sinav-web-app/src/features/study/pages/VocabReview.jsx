import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { v4 as uuid } from 'uuid';
import { Undo2 } from 'lucide-react';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import Routes, { path } from '@shared/constant/route-paths';
import { queryClient } from '@shared/providers/QueryProvider';
import Button from '@components/Button/Button';
import Card from '@components/Card/Card';
import Chip from '@components/Chip/Chip';
import EmptyState from '@components/EmptyState/EmptyState';
import ErrorState from '@components/ErrorState/ErrorState';
import BubbleLoader from '@components/BubbleLoader/BubbleLoader';
import SessionTop from '../components/SessionTop';
import useHeartbeat from '../hooks/useHeartbeat';
import TapText from '@features/lexicon/TapText';
import styles from './Session.module.scss';

const RATINGS = ['again', 'hard', 'good', 'easy'];

// STUDY-14: kelime oturumu (FSRS). review-sessions → next → cards/{code}/reviews → complete.
export default function VocabReview() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [code, setCode] = useState(null);
  const [empty, setEmpty] = useState(false);
  const [shown, setShown] = useState(false);
  const [summary, setSummary] = useState(null);
  const shownAt = useRef(Date.now());
  const completing = useRef(false);

  const start = useApiMutation(() => api.learningVocabReviewStart({ limit: 20 }), {
    onSuccess: (r) => { if (r.empty || !r.session) setEmpty(true); else setCode(r.session.code); },
    onError: () => {},
  });
  useEffect(() => { start.mutate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useHeartbeat(code, !!code && !summary);

  const nextKey = ['learning', 'vocab', 'review', code, 'next'];
  const nextQ = useApiQuery(nextKey, () => api.learningVocabReviewNext(code), { enabled: !!code && !summary });
  const card = nextQ.data?.card;
  const sess = nextQ.data?.session;
  useEffect(() => { setShown(false); shownAt.current = Date.now(); }, [card?.code]);

  const complete = useApiMutation(() => api.learningVocabReviewComplete(code), {
    onSuccess: (r) => { setSummary(r.summary); queryClient.invalidateQueries({ queryKey: ['learning'] }); },
  });
  useEffect(() => {
    if (nextQ.data?.done && !completing.current && !summary) { completing.current = true; complete.mutate(); }
  }, [nextQ.data?.done]); // eslint-disable-line react-hooks/exhaustive-deps

  const rate = useApiMutation(
    (rating) => api.learningVocabCardReview(card.code, { rating, durationMs: Date.now() - shownAt.current, sessionCode: code, clientRef: uuid() }),
    { onSuccess: () => queryClient.invalidateQueries({ queryKey: nextKey }) }
  );
  const undo = useApiMutation(() => api.learningVocabReviewUndo(code), { onSuccess: () => queryClient.invalidateQueries({ queryKey: nextKey }) });
  const exit = () => { if (code && !summary && !completing.current) { completing.current = true; complete.mutate(undefined, { onSettled: () => nav(Routes.vocab) }); } else nav(Routes.vocab); };

  const onKey = useCallback((e) => {
    if (e.target.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey || !card) return;
    if (!shown && (e.key === ' ' || e.key === 'Enter') && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); setShown(true); }
    else if (shown && !rate.isPending && '1234'.includes(e.key) && e.key) rate.mutate(RATINGS[Number(e.key) - 1]);
  }, [card, shown, rate]);
  useEffect(() => { window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onKey]);

  if (start.isError) return <div className={styles.center}><ErrorState error={start.error} onRetry={() => start.mutate()} /><Button variant="tertiary" onClick={() => nav(Routes.vocab)}>{t('common.back')}</Button></div>;
  if (empty) return <div className={styles.center}><EmptyState title={t('study.vocab.review.empty')} body={t('study.vocab.review.emptyBody')} action={<Button onClick={() => nav(Routes.vocab)}>{t('study.vocab.review.back')}</Button>} /></div>;
  if (summary) {
    return (
      <div className={styles.center}>
        <h1 className="t-heading-1">{t('study.vocab.review.doneTitle')}</h1>
        <p className="t-body-m">{t('study.vocab.review.summary', { n: summary.reviewed, new: summary.newLearned })}</p>
        <p className="muted">{t('study.vocab.review.accuracy', { n: Math.round(summary.accuracy <= 1 ? summary.accuracy * 100 : summary.accuracy) })} · {t('study.vocab.review.dueNow', { n: summary.dueNow })}</p>
        <p className="muted t-body-s">{t('study.vocab.review.ratings', summary.ratings)}</p>
        <Button size="lg" onClick={() => nav(Routes.vocab)}>{t('study.vocab.review.back')}</Button>
      </div>
    );
  }
  if (!code || nextQ.isLoading || complete.isPending || nextQ.data?.done) return <BubbleLoader fullscreen label={t('common.loading')} />;
  if (nextQ.isError) return <div className={styles.center}><ErrorState error={nextQ.error} onRetry={nextQ.refetch} /></div>;

  const w = card.word;
  const iv = card.intervals || {};
  const ivLabel = (r) => (r === 'again' ? t('study.vocab.review.minutes', { n: iv.again?.minutes ?? 10 }) : iv[r]?.days != null ? t('study.vocab.review.days', { n: iv[r].days }) : '');
  const total = (sess?.progress?.reviewed ?? 0) + (sess?.progress?.remaining ?? 0);
  return (
    <>
      <SessionTop title={t('study.vocab.review.title')} done={sess?.progress?.reviewed ?? 0} total={total} onExit={exit} exiting={complete.isPending}
        right={<Button variant="tertiary" size="sm" startIcon={<Undo2 size={16} />} loading={undo.isPending} onClick={() => undo.mutate()}>{t('study.vocab.review.undo')}</Button>} />
      <div className={styles.page} style={{ maxWidth: 720 }}>
        <Card>
          <div className="stack" aria-live="polite">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              {card.isNew ? <Chip tone="accent" size="sm">{t('study.vocab.review.new')}</Chip> : <span />}
              <span className="t-caption muted">{t('study.vocab.review.remaining', { n: sess?.progress?.remaining ?? 0 })}</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p className="t-display-m" lang="en">{w.headword}</p>
              <p className="muted">{w.partOfSpeech}{w.pronunciationIpa ? ` · /${w.pronunciationIpa.replace(/^\/|\/$/g, '')}/` : ''}</p>
            </div>
            {!shown ? (
              <Button size="lg" block onClick={() => setShown(true)}>{t('study.vocab.review.show')}</Button>
            ) : (
              <div className="stack">
                <ul style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
                  {w.meanings.map((m, i) => <li key={i} className="t-body-l">{m.tr}{m.note && <span className="muted t-body-s"> ({m.note})</span>}</li>)}
                </ul>
                {w.examples?.length > 0 && (
                  <div className="stack-sm">
                    <p className="t-label-m">{t('study.vocab.review.examples')}</p>
                    {w.examples.slice(0, 2).map((e, i) => <div key={i}><p className="reading t-reading-m" lang="en"><TapText text={e.en} /></p><p className="muted t-body-s">{e.tr}</p></div>)}
                  </div>
                )}
                {w.synonyms?.length > 0 && <p className="t-body-s"><strong>{t('study.vocab.review.synonyms')}:</strong> <span lang="en">{w.synonyms.join(', ')}</span></p>}
                {w.itemCode && <p className="t-body-s"><Link to={path(Routes.vocabWord, { id: w.itemCode })}>{t('study.vocab.word.details')}</Link></p>}
                <div className={styles.tools} style={{ justifyContent: 'stretch' }} role="group" aria-label={t('study.vocab.review.title')}>
                  {RATINGS.map((r, i) => (
                    <Button key={r} variant={r === 'good' ? 'primary' : 'secondary'} disabled={rate.isPending} onClick={() => rate.mutate(r)} style={{ flex: 1, flexDirection: 'column' }}>
                      {t(`study.vocab.review.${r}`)} <span className="t-caption">{ivLabel(r)} · {i + 1}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
