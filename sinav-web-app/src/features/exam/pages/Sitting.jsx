import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pause, Flag, X, ChevronLeft, ChevronRight, Check, Timer } from 'lucide-react';
import classNames from 'classnames';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import { apiErrorCode, getApiErrorMessage } from '@shared/utils/apiError';
import { notify } from '@shared/utils/notify';
import Routes, { path } from '@shared/constant/route-paths';
import { queryClient } from '@shared/providers/QueryProvider';
import Button from '@components/Button/Button';
import IconButton from '@components/IconButton/IconButton';
import OptionRow from '@components/OptionRow/OptionRow';
import Card from '@components/Card/Card';
import Modal from '@components/Modal/Modal';
import Banner from '@components/Banner/Banner';
import Markdown from '@components/Markdown/Markdown';
import Skeleton from '@components/Skeleton/Skeleton';
import ErrorState from '@components/ErrorState/ErrorState';
import BubbleLoader from '@components/BubbleLoader/BubbleLoader';
import useCountdown, { formatClock } from '../hooks/useCountdown';
import styles from './Sitting.module.scss';

const SLICE = 40;
const WARN = [600, 300, 60];

// EXAM-03/05/07/08/09: sınav ekranı. Sunucu zaman otoritesidir; cevaplar anında kaydedilir.
export default function Sitting() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { code } = useParams();
  const sittingQ = useApiQuery(['exam', 'sitting', code], () => api.learningExamSittingGet(code), { refetchOnWindowFocus: false, staleTime: 0 });
  const sitting = sittingQ.data;
  const formQ = useApiQuery(['exam', 'form', sitting?.formCode], () => api.learningExamFormGet(sitting.formCode), { enabled: !!sitting?.formCode });

  const [clock, setClock] = useState(null);
  const [status, setStatus] = useState(null);
  const [pos, setPos] = useState(null);
  const [cache, setCache] = useState({}); // position → soru
  const [passages, setPassages] = useState({});
  const [marks, setMarks] = useState({}); // position → { answered, flagged }
  const [loadError, setLoadError] = useState(null);
  const [finishing, setFinishing] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const [warn, setWarn] = useState(null);
  const warned = useRef(new Set());
  const enteredAt = useRef(Date.now());
  const loading = useRef(new Set());

  const syncClock = useCallback((seconds) => { if (seconds != null) setClock({ seconds, at: Date.now() }); }, []);

  useEffect(() => {
    if (!sitting) return;
    syncClock(sitting.remainingSeconds);
    setStatus(sitting.status);
    setPos((p) => p ?? sitting.currentPosition ?? 1);
    setMarks(Object.fromEntries(sitting.items.map((i) => [i.position, { answered: i.answered, flagged: i.flagged }])));
  }, [sitting, syncClock]);

  const running = status === 'in_progress';
  const remaining = useCountdown(clock, running);

  const loadSlice = useCallback(async (from) => {
    const start = Math.floor((from - 1) / SLICE) * SLICE + 1;
    if (loading.current.has(start)) return;
    loading.current.add(start);
    try {
      const res = await api.learningExamQuestionsGet(code, { from: start, to: start + SLICE - 1 });
      const d = res.data.data;
      setCache((c) => ({ ...c, ...Object.fromEntries(d.items.map((i) => [i.position, i])) }));
      setPassages((p) => ({ ...p, ...Object.fromEntries(d.passages.map((x) => [x.itemCode, x])) }));
      syncClock(d.remainingSeconds);
      setLoadError(null);
    } catch (e) {
      loading.current.delete(start);
      if (apiErrorCode(e) === 'EXAM_TIME_UP' || apiErrorCode(e) === 'EXAM_ALREADY_SUBMITTED') return nav(path(Routes.examResult, { code }), { replace: true });
      if (apiErrorCode(e) !== 'EXAM_PAUSED') setLoadError(e);
    }
  }, [code, nav, syncClock]);

  useEffect(() => { if (pos && running && !cache[pos]) loadSlice(pos); }, [pos, running, cache, loadSlice]);

  const q = pos ? cache[pos] : null;
  const passage = q?.passageItemCode ? passages[q.passageItemCode] : null;
  const total = sitting?.questionCount || 0;

  const put = useCallback(async (position, body) => {
    try {
      const res = await api.learningExamAnswerPut(code, position, body);
      const d = res.data.data;
      syncClock(d.remainingSeconds);
      return d;
    } catch (e) {
      const c = apiErrorCode(e);
      if (c === 'EXAM_TIME_UP' || c === 'EXAM_ALREADY_SUBMITTED') nav(path(Routes.examResult, { code }), { replace: true });
      else notify(getApiErrorMessage(e), 'error');
      return null;
    }
  }, [code, nav, syncClock]);

  const patchQ = (position, patch) => setCache((c) => ({ ...c, [position]: { ...c[position], ...patch } }));
  const elapsed = () => { const ms = Date.now() - enteredAt.current; enteredAt.current = Date.now(); return ms; };

  const choose = (label) => {
    if (!q || !running) return;
    const next = q.selectedLabel === label ? null : label;
    patchQ(pos, { selectedLabel: next });
    setMarks((m) => ({ ...m, [pos]: { ...m[pos], answered: next != null } }));
    put(pos, { selectedLabel: next, timeMs: elapsed() });
  };
  const toggleFlag = () => {
    if (!q || !running) return;
    const flagged = !q.isFlagged;
    patchQ(pos, { isFlagged: flagged });
    setMarks((m) => ({ ...m, [pos]: { ...m[pos], flagged } }));
    put(pos, { flagged });
  };
  const toggleEliminate = (label) => {
    if (!q) return;
    const set = new Set(q.eliminatedLabels || []);
    if (set.has(label)) set.delete(label); else set.add(label);
    const eliminatedLabels = [...set];
    patchQ(pos, { eliminatedLabels });
    put(pos, { eliminatedLabels });
  };
  const go = useCallback((n) => {
    if (!running || n < 1 || n > total || n === pos) return;
    if (q) put(pos, { timeMs: elapsed() }); // geçen süreyi bu soruya yaz
    enteredAt.current = Date.now();
    setPos(n);
    setShowNav(false);
  }, [running, total, pos, q, put]);

  const submit = useApiMutation(() => api.learningExamSubmit(code), {
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['exam'] }); nav(path(Routes.examResult, { code }), { replace: true }); },
    onError: (e) => { setFinishing(false); notify(getApiErrorMessage(e), 'error'); },
  });
  const pause = useApiMutation(() => api.learningExamPause(code), { onSuccess: (s) => { setStatus(s.status); syncClock(s.remainingSeconds); } });
  const resume = useApiMutation(() => api.learningExamResume(code), {
    onSuccess: (s) => { setStatus(s.status); syncClock(s.remainingSeconds); enteredAt.current = Date.now(); setCache({}); loading.current = new Set(); },
  });

  // Süre doldu: sunucu otomatik teslim eder; teslim isteği sonucu getirir.
  useEffect(() => {
    if (running && remaining === 0 && !submit.isPending && !submit.isSuccess) { setFinishing(false); submit.mutate(); }
  }, [running, remaining]); // eslint-disable-line react-hooks/exhaustive-deps
  // Süre uyarıları (EXAM-08): bir kez, canlı bölgede.
  useEffect(() => {
    if (!running || remaining == null) return;
    for (const w of WARN) {
      if (remaining <= w && remaining > 0 && !warned.current.has(w)) {
        warned.current.add(w);
        setWarn(w);
      }
    }
  }, [running, remaining]);
  // İlk açılışta zaten geçmiş eşikleri sessizce işaretle.
  useEffect(() => { if (sitting) for (const w of WARN) if (sitting.remainingSeconds <= w) warned.current.add(w); }, [sitting]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select, [role="dialog"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const hit = q?.options.find((o) => o.label.toLowerCase() === k);
      if (hit) choose(hit.label);
      else if (e.key === 'ArrowRight') go(pos + 1);
      else if (e.key === 'ArrowLeft') go(pos - 1);
      else if (k === 'f') toggleFlag();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const counts = useMemo(() => {
    const arr = Object.values(marks);
    const answered = arr.filter((m) => m.answered).length;
    return { answered, flagged: arr.filter((m) => m.flagged).length, blank: total - answered };
  }, [marks, total]);

  if (sittingQ.isError) return <div className={styles.center}><ErrorState error={sittingQ.error} onRetry={sittingQ.refetch} /><Button variant="tertiary" onClick={() => nav(Routes.exams)}>{t('common.back')}</Button></div>;
  if (sitting?.status === 'submitted') return <Navigate to={path(Routes.examResult, { code })} replace />;
  if (!sitting || pos == null) return <BubbleLoader fullscreen label={t('common.loading')} />;
  if (finishing && submit.isPending) return <BubbleLoader fullscreen label={t('exam.sitting.submitting')} />;

  const lowTime = remaining != null && remaining <= 300;
  const canPause = formQ.data?.rules?.canPause;
  const blankList = Object.entries(marks).filter(([, m]) => !m.answered).map(([n]) => Number(n));

  return (
    <>
      <header className={styles.top}>
        <div className="grow">
          <p className="t-label-m">{sitting.title}</p>
          <p className="t-caption muted tnum">{t('exam.sitting.progress', { answered: counts.answered, total })}</p>
        </div>
        <span className={classNames(styles.timer, lowTime && styles.low)} role="timer" aria-label={t('exam.sitting.timeLeft')}>
          <Timer size={18} aria-hidden /><span className="tnum">{formatClock(remaining)}</span>
        </span>
        {canPause && <Button variant="secondary" size="sm" startIcon={<Pause size={16} />} loading={pause.isPending} onClick={() => pause.mutate()}>{t('exam.sitting.pause')}</Button>}
        <Button size="sm" startIcon={<Check size={16} />} onClick={() => setFinishing(true)}>{t('exam.sitting.finish')}</Button>
        <IconButton label={t('exam.sitting.leave')} onClick={() => nav(Routes.exams)}><X size={20} /></IconButton>
      </header>
      <div className="sr-only" role="status" aria-live="assertive">{warn ? t('exam.sitting.warn', { min: Math.ceil(warn / 60) }) : ''}</div>
      {warn && <div className={styles.warn}><Banner tone="warning" onClose={() => setWarn(null)}>{t('exam.sitting.warn', { min: Math.ceil(warn / 60) })}{counts.blank > 0 && ` ${t('exam.sitting.warnBlank', { n: counts.blank })}`}</Banner></div>}

      <div className={styles.layout}>
        <div className="stack">
          {loadError && <ErrorState error={loadError} onRetry={() => { setLoadError(null); loadSlice(pos); }} />}
          {!q && !loadError && <Skeleton height={360} radius={16} />}
          {q && (
            <div className={classNames(styles.qgrid, passage && styles.withPassage)}>
              {passage && (
                <Card className={styles.passage}>
                  <p className="t-caption muted">{passage.title || t('exam.sitting.passage')}</p>
                  <div className="reading t-reading-m" lang="en"><Markdown source={passage.body} /></div>
                </Card>
              )}
              <div className="stack">
                <p className="t-caption muted tnum">{t('exam.sitting.questionOf', { n: pos, total })} · {q.type.name}</p>
                <div className="reading t-reading-m" lang="en">{q.stemFormat === 'plain' ? <p>{q.stem}</p> : <Markdown source={q.stem} />}</div>
                <div className="stack-sm" role="group" aria-label={t('exam.sitting.options')}>
                  {q.options.map((o) => (
                    <OptionRow key={o.label} letter={o.label} state={q.eliminatedLabels?.includes(o.label) ? 'eliminated' : q.selectedLabel === o.label ? 'selected' : 'default'} onClick={() => choose(o.label)} onEliminate={() => toggleEliminate(o.label)}>{o.text}</OptionRow>
                  ))}
                </div>
                <div className="row">
                  <Button variant="tertiary" size="sm" disabled={q.selectedLabel == null} onClick={() => choose(q.selectedLabel)}>{t('exam.sitting.clear')}</Button>
                  <Button variant={q.isFlagged ? 'secondary' : 'tertiary'} size="sm" startIcon={<Flag size={16} />} aria-pressed={q.isFlagged} onClick={toggleFlag}>{q.isFlagged ? t('exam.sitting.unflag') : t('exam.sitting.flag')}</Button>
                </div>
              </div>
            </div>
          )}
          <div className={styles.pager}>
            <Button variant="secondary" startIcon={<ChevronLeft size={18} />} disabled={pos <= 1} onClick={() => go(pos - 1)}>{t('exam.sitting.prev')}</Button>
            <Button variant="tertiary" className={styles.navToggle} onClick={() => setShowNav((v) => !v)} aria-expanded={showNav}>{t('exam.sitting.navigator')}</Button>
            <Button endIcon={<ChevronRight size={18} />} disabled={pos >= total} onClick={() => go(pos + 1)}>{t('exam.sitting.next')}</Button>
          </div>
        </div>

        <aside className={classNames(styles.navigator, showNav && styles.open)} aria-label={t('exam.sitting.navigator')}>
          <Card className="stack-sm">
            <h2 className="t-heading-3">{t('exam.sitting.navigator')}</h2>
            <p className="t-caption muted tnum">{t('exam.sitting.counts', { answered: counts.answered, flagged: counts.flagged, blank: counts.blank })}</p>
            <div className={styles.cells}>
              {sitting.items.map((it) => {
                const m = marks[it.position] || it;
                return (
                  <button key={it.position} type="button" onClick={() => go(it.position)} aria-current={it.position === pos ? 'true' : undefined}
                    aria-label={t('exam.sitting.cell', { n: it.position, state: m.flagged ? t('exam.sitting.stateFlagged') : m.answered ? t('exam.sitting.stateAnswered') : t('exam.sitting.stateBlank') })}
                    className={classNames(styles.cell, m.answered && styles.done, m.flagged && styles.flag, it.position === pos && styles.active)}>
                    {it.position}{m.flagged && <Flag size={10} aria-hidden className={styles.cellFlag} />}
                  </button>
                );
              })}
            </div>
            <p className="t-caption muted">{t('exam.sitting.legend')}</p>
          </Card>
        </aside>
      </div>

      <Modal open={status === 'paused'} onClose={() => {}} dismissible={false} title={t('exam.pause.title')}
        footer={<><Button variant="tertiary" onClick={() => nav(Routes.exams)}>{t('exam.sitting.leave')}</Button><Button loading={resume.isPending} onClick={() => resume.mutate()}>{t('exam.pause.resume')}</Button></>}>
        <p>{t('exam.pause.body')}</p>
        <p className="t-numeric-m tnum">{formatClock(remaining)}</p>
      </Modal>

      <Modal open={finishing && !submit.isPending} onClose={() => setFinishing(false)} title={t('exam.finish.title')}
        footer={<><Button variant="tertiary" onClick={() => setFinishing(false)}>{t('exam.finish.back')}</Button><Button onClick={() => submit.mutate()}>{t('exam.finish.confirm')}</Button></>}>
        <div className="stack-sm">
          <p className="tnum">{t('exam.sitting.counts', { answered: counts.answered, flagged: counts.flagged, blank: counts.blank })}</p>
          {counts.blank > 0 ? (
            <>
              <Banner tone="warning">{t('exam.finish.blankWarn', { n: counts.blank })}</Banner>
              <div className={styles.cells}>
                {blankList.slice(0, 40).map((n) => <button key={n} type="button" className={styles.cell} onClick={() => { setFinishing(false); go(n); }}>{n}</button>)}
              </div>
            </>
          ) : <p>{t('exam.finish.allDone')}</p>}
          <p className="muted t-body-s">{t('exam.finish.irreversible')}</p>
        </div>
      </Modal>
    </>
  );
}
