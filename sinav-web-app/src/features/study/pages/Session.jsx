import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { v4 as uuid } from 'uuid';
import { Bookmark, Flag, Lightbulb, BookOpenCheck, MessageSquareWarning } from 'lucide-react';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import Routes, { path } from '@shared/constant/route-paths';
import { notify } from '@shared/utils/notify';
import { queryClient } from '@shared/providers/QueryProvider';
import Button from '@components/Button/Button';
import Card from '@components/Card/Card';
import Chip from '@components/Chip/Chip';
import OptionRow from '@components/OptionRow/OptionRow';
import Markdown from '@components/Markdown/Markdown';
import Skeleton from '@components/Skeleton/Skeleton';
import ErrorState from '@components/ErrorState/ErrorState';
import BubbleLoader from '@components/BubbleLoader/BubbleLoader';
import Modal from '@components/Modal/Modal';
import SessionTop from '../components/SessionTop';
import QuestionNav from '../components/QuestionNav';
import TapText from '@features/lexicon/TapText';
import LexiconTip from '@features/lexicon/LexiconTip';
import useHeartbeat from '../hooks/useHeartbeat';
import useNow from '../hooks/useNow';
import styles from './Session.module.scss';

const MISTAKE_TYPES = ['knowledge_gap', 'attention', 'time', 'trap', 'vocabulary'];
const REPORT_REASONS = ['wrong_answer_key', 'typo', 'unclear'];
const sessionKey = (code) => ['learning', 'session', String(code)];
const itemKey = (code, n) => ['learning', 'session', String(code), 'item', n];
const clock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// STUDY-07..11: soru motoru (alıştırma, not kontrolü, hata tekrarı). Öğrenme modunda anında geri bildirim,
// 2 deneme, ipucu merdiveni ve çözüm; diğer modlarda tek deneme, geri bildirim oturum sonunda.
export default function Session() {
  const { code } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const [position, setPosition] = useState(null);
  const [sel, setSel] = useState(null);
  const [mistakes, setMistakes] = useState({});
  const [reportOpen, setReportOpen] = useState(false);
  const shownAt = useRef(Date.now());
  const refs = useRef({});

  const sessionQ = useApiQuery(sessionKey(code), () => api.learningSessionGet(code));
  const session = sessionQ.data?.session || sessionQ.data;
  useEffect(() => { if (session && position == null) setPosition(session.currentPosition || 1); }, [session, position]);

  const itemQ = useApiQuery(itemKey(code, position), () => api.learningSessionItemGet(code, position), { enabled: session != null && position != null });
  const view = itemQ.data;
  const st = view?.state;
  useEffect(() => { setSel(null); shownAt.current = Date.now(); }, [position, st?.tries]);

  // Duraklatılmış oturum açılınca devam ettirilir; aksi halde cevap/ipucu uçları 409 SESSION_NOT_IN_PROGRESS döner.
  const resumed = useRef(false);
  useEffect(() => {
    if (session?.status !== 'paused' || resumed.current) return;
    resumed.current = true;
    api.learningSessionResume(code).then(() => queryClient.invalidateQueries({ queryKey: sessionKey(code) })).catch(() => { resumed.current = false; });
  }, [session?.status, code]);

  const immediate = session?.feedbackMode === 'immediate';
  const inProgress = session?.status === 'in_progress';
  useHeartbeat(code, inProgress);
  const now = useNow(!!session?.config?.deadlineAt && inProgress);
  const deadline = session?.config?.deadlineAt ? new Date(session.config.deadlineAt).getTime() : null;
  const remainingMs = deadline ? deadline - now : null;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: sessionKey(code) });
  };
  const complete = useApiMutation(() => api.learningSessionComplete(code), {
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['learning'] });
      nav(path(Routes.sessionResult, { code }), { replace: true, state: { extra: r?.extra } });
    },
  });
  const pause = useApiMutation(() => api.learningSessionPause(code), { onSuccess: () => nav(Routes.study), onError: () => nav(Routes.study) });
  useEffect(() => { if (remainingMs != null && remainingMs <= 0 && inProgress && !complete.isPending && !complete.isSuccess) { notify(t('study.session.timeUp'), 'warning'); complete.mutate(); } }, [remainingMs, inProgress]); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = useApiMutation(
    (label) => {
      if (!refs.current[`${position}:${st?.tries}:${label}`]) refs.current[`${position}:${st?.tries}:${label}`] = uuid();
      return api.learningSessionAnswer(code, position, { selectedLabel: label, timeMs: Date.now() - shownAt.current, clientRef: refs.current[`${position}:${st?.tries}:${label}`] });
    },
    {
      onSuccess: (r) => {
        if (r.mistake?.added) setMistakes((m) => ({ ...m, [position]: r.mistake }));
        queryClient.invalidateQueries({ queryKey: itemKey(code, position) });
        refresh();
        if (r.outcome === 'recorded' || r.outcome === 'skipped') { if (r.next != null) setPosition(r.next); }
      },
    }
  );
  const hint = useApiMutation(() => api.learningSessionHintReveal(code, position), { onSuccess: () => { queryClient.invalidateQueries({ queryKey: itemKey(code, position) }); refresh(); } });
  const solution = useApiMutation(() => api.learningSessionSolutionReveal(code, position), {
    onSuccess: (r) => { if (r.mistake?.added) setMistakes((m) => ({ ...m, [position]: r.mistake })); queryClient.invalidateQueries({ queryKey: itemKey(code, position) }); refresh(); },
  });
  const flag = useApiMutation((v) => api.learningSessionItemFlag(code, position, v), { onSuccess: () => { queryClient.invalidateQueries({ queryKey: itemKey(code, position) }); refresh(); } });
  const mistakeType = useApiMutation((v) => api.learningSessionMistakeTypeSet(code, position, v), {
    successMessage: 'study.session.mistakeSaved',
    onSuccess: (r) => setMistakes((m) => ({ ...m, [position]: { ...m[position], mistakeType: r.mistakeType } })),
  });
  const bookmark = useApiMutation(() => api.learningBookmarkCreate({ itemCode: view.question.itemCode }), {
    successMessage: 'study.note.savedToast',
    onSuccess: () => queryClient.invalidateQueries({ queryKey: itemKey(code, position) }),
  });
  const report = useApiMutation((reason) => api.contentReportCreate({ itemCode: view.question.itemCode, reason, context: { sessionCode: Number(code), position } }), {
    onSuccess: () => { notify(t('study.session.reported'), 'success'); setReportOpen(false); },
  });

  const items = useMemo(() => session?.items || [], [session]);
  const openItems = useMemo(
    () => items.filter((i) => i.status === 'pending' || i.status === 'seen' || (immediate && i.status === 'skipped')),
    [items, immediate]
  );
  const goNext = useCallback(() => {
    const after = openItems.find((i) => i.position > position && i.position !== position) || openItems.find((i) => i.position !== position);
    if (after) setPosition(after.position);
  }, [openItems, position]);

  const final = st?.status === 'answered' || st?.solutionViewed;
  const busy = answer.isPending || hint.isPending || solution.isPending;
  const submit = useCallback((label) => { if (!busy && !final) answer.mutate(label); }, [busy, final, answer]);
  const options = view?.question?.options || [];

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey || !view) return;
      const k = e.key.toLowerCase();
      const hit = options.find((o) => o.label.toLowerCase() === k);
      if (hit && !final && !st?.eliminatedLabels?.includes(hit.label)) setSel(hit.label);
      else if (e.key === 'Enter' && sel && document.activeElement?.tagName !== 'BUTTON') submit(sel);
      else if (k === 'h' && immediate && session?.hintsEnabled && !final && !busy) hint.mutate();
      else if (k === 'f') flag.mutate(!st?.isFlagged);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, options, sel, final, st, immediate, session, busy, submit]); // eslint-disable-line react-hooks/exhaustive-deps

  if (sessionQ.isError) return <div className={styles.center}><ErrorState error={sessionQ.error} onRetry={sessionQ.refetch} /><Button variant="tertiary" onClick={() => nav(Routes.study)}>{t('common.back')}</Button></div>;
  if (session && ['completed', 'abandoned', 'expired'].includes(session.status)) return <Navigate to={path(Routes.sessionResult, { code })} replace />;
  if (complete.isPending) return <BubbleLoader fullscreen label={t('study.session.finishing')} />;

  const q = view?.question;
  const p = view?.passage;
  const fb = view?.feedback;
  const sol = view?.solution;
  const correct = fb?.correctLabel || sol?.correctLabel;
  const selected = final ? st?.selectedLabel : sel;
  const optState = (o) => {
    if (correct && o.label === correct) return 'correct';
    if (final && correct && o.label === st?.selectedLabel) return 'wrong';
    if (st?.eliminatedLabels?.includes(o.label)) return 'eliminated';
    if (selected === o.label) return 'selected';
    return 'default';
  };
  const statusLabel = (o) => (optState(o) === 'correct' ? t('study.session.correct') : optState(o) === 'wrong' ? t('study.session.wrong') : undefined);
  const hintSteps = (st?.hintSteps || []).filter((s) => s.kind !== 'solution');
  const hintsLeft = st ? st.hintsTotal - st.hintsRevealed : 0;
  const showHintBtn = immediate && session?.hintsEnabled && !final && hintsLeft > 0;
  const lastOutcomeCorrect = st?.isCorrect === true;
  const mistake = mistakes[position];
  const showFeedback = immediate && (final || (fb && !fb.isCorrect && st?.canRetry));
  const title = t(`study.mode.${session?.mode || 'learning'}`);
  // Dokun-çevir: kelimeler hep açık; cümle çevirisi ve şıklar cevaptan sonra (önceden açık olsa cevabı verir).
  const lex = { lang: 'en', sentences: Boolean(final), sentenceLock: 'lex.lock.answerFirst' };
  const lexAuto = { lang: 'auto' };

  return (
    <>
      <SessionTop title={title} done={session?.progress?.answered ?? 0} total={session?.plannedItemCount ?? 0} onExit={() => pause.mutate()} exiting={pause.isPending}
        right={remainingMs != null && <span className="t-label-m tnum" role="timer" aria-label={t('study.session.timeLeft', { time: clock(remainingMs) })}>{clock(remainingMs)}</span>} />
      <div className={styles.page}>
        {!view && <Skeleton height={260} />}
        {view && (
          <div className="stack">
            <LexiconTip />
            <div className={`${styles.grid} ${p ? styles.two : ''}`}>
              {p && (
                <Card className={styles.passage}>
                  <p className="t-caption muted">{p.title || t('study.session.passage')}{p.wordCount ? ` · ${t('study.session.words', { n: p.wordCount })}` : ''}</p>
                  <div className="reading t-reading-m" lang="en"><Markdown source={p.body} lexicon={lex} /></div>
                </Card>
              )}
              <div className="stack">
                <p className="t-caption muted">{t('study.session.questionOf', { n: view.position, total: view.total })} · {q.questionType.name}</p>
                <div className="reading t-reading-m" lang="en"><Markdown source={q.stem} lexicon={lex} /></div>
                <div className="stack-sm" role="group" aria-label={t('study.session.options')}>
                  {options.map((o) => (
                    <OptionRow key={o.label} letter={o.label} state={optState(o)} statusLabel={statusLabel(o)} disabled={final || busy || st?.eliminatedLabels?.includes(o.label)} readOnly={Boolean(final)} text={o.text} onClick={() => setSel(o.label)}>{final ? <TapText text={o.text} {...lex} /> : o.text}</OptionRow>
                  ))}
                </div>

                {hintSteps.map((s) => (
                  <div key={s.stepNo} className={styles.hint} role="status"><strong>{t('study.session.hintTitle', { n: s.stepNo, total: st.hintsTotal })}</strong> <Markdown source={s.body} /></div>
                ))}

                {showFeedback && (
                  <Card>
                    <div className={styles.panel} role="status" aria-live="polite">
                      {final ? (
                        <p className={`t-title ${lastOutcomeCorrect ? styles.ok : styles.bad}`}>{lastOutcomeCorrect ? (fb?.correctOnFirstTry === false ? t('study.session.correctRetry') : t('study.session.correct')) : t('study.session.wrong')}</p>
                      ) : <p className={`t-title ${styles.bad}`}>{t('study.session.wrongRetry')}</p>}
                      {final && correct && <p className="t-body-m">{t('study.session.correctIs', { label: correct })}</p>}
                      {final && (fb?.shortReason || sol?.shortReason) && <Markdown source={fb?.shortReason || sol?.shortReason} lexicon={lexAuto} />}
                      {sol && (
                        <>
                          <h3 className="t-heading-3">{t('study.session.solutionTitle')}</h3>
                          {sol.explanation && <Markdown source={sol.explanation} lexicon={lexAuto} />}
                          <ul className={styles.rationale}>
                            {sol.options.filter((o) => o.rationale).map((o) => <li key={o.label}><strong>{o.label}.</strong> <TapText text={o.rationale} lang="auto" /></li>)}
                          </ul>
                          {sol.noteLink && <Link to={path(Routes.note, { id: sol.noteLink.itemCode })}>{t('study.session.noteLink', { title: sol.noteLink.title })}</Link>}
                        </>
                      )}
                      {final && !lastOutcomeCorrect && mistake && (
                        <div className="stack-sm">
                          <p className="t-label-m">{t('study.session.mistakeType')}</p>
                          <div className="row" style={{ flexWrap: 'wrap' }}>
                            {MISTAKE_TYPES.map((m) => <Chip key={m} selected={mistake.mistakeType === m} onClick={() => mistakeType.mutate(m)}>{t(`study.mistakeType.${m}`)}</Chip>)}
                          </div>
                        </div>
                      )}
                      {final && !sol && immediate && fb?.solutionAvailable !== false && !lastOutcomeCorrect && (
                        <Button variant="tertiary" size="sm" onClick={() => solution.mutate()} loading={solution.isPending}>{t('study.session.solution')}</Button>
                      )}
                    </div>
                  </Card>
                )}

                <div className={styles.actions}>
                  <div className={styles.tools}>
                    <Button variant="tertiary" size="sm" startIcon={<Flag size={16} />} onClick={() => flag.mutate(!st.isFlagged)}>{st.isFlagged ? t('study.session.unflag') : t('study.session.flag')}</Button>
                    <Button variant="tertiary" size="sm" startIcon={<Bookmark size={16} />} disabled={q.bookmarked || bookmark.isSuccess} onClick={() => bookmark.mutate()}>{q.bookmarked || bookmark.isSuccess ? t('study.session.bookmarked') : t('study.session.bookmark')}</Button>
                    <Button variant="tertiary" size="sm" startIcon={<MessageSquareWarning size={16} />} onClick={() => setReportOpen(true)}>{t('study.session.report')}</Button>
                    {showHintBtn && <Button variant="secondary" size="sm" startIcon={<Lightbulb size={16} />} loading={hint.isPending} onClick={() => hint.mutate()}>{t('study.session.hint')} ({t('study.session.hintLeft', { n: hintsLeft })})</Button>}
                    {immediate && !final && st?.tries > 0 && !sol && <Button variant="tertiary" size="sm" startIcon={<BookOpenCheck size={16} />} loading={solution.isPending} onClick={() => solution.mutate()}>{t('study.session.solution')}</Button>}
                  </div>
                  <div className={styles.tools}>
                    {!final && <Button variant="tertiary" disabled={busy} onClick={() => submit(null)}>{t('study.session.skip')}</Button>}
                    {!final && <Button size="lg" disabled={!sel} loading={answer.isPending} onClick={() => submit(sel)}>{st?.canRetry ? t('study.session.retry') : t('study.session.answer')}</Button>}
                    {final && openItems.length > 0 && <Button size="lg" onClick={goNext}>{t('study.session.next')}</Button>}
                    {openItems.length === 0 && <Button size="lg" loading={complete.isPending} onClick={() => complete.mutate()}>{t('study.session.finish')}</Button>}
                  </div>
                </div>
                <p className="t-caption muted">{immediate ? `${t('study.session.keys')} ${t('study.session.eliminate')}` : t('study.modeHint.other')}</p>
              </div>
            </div>
            {items.length > 1 && <QuestionNav items={items} current={position} onGo={setPosition} label={t('study.session.navTitle')} />}
            {openItems.length > 0 && openItems.length < items.length && !final && (
              <div className="row"><Button variant="tertiary" size="sm" onClick={() => complete.mutate()}>{t('study.session.finish')}</Button></div>
            )}
          </div>
        )}
      </div>
      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title={t('study.session.report')}>
        <div className="stack-sm">
          {REPORT_REASONS.map((r) => <Button key={r} variant="secondary" block loading={report.isPending} onClick={() => report.mutate(r)}>{t(`study.report.${r}`)}</Button>)}
        </div>
      </Modal>
    </>
  );
}
