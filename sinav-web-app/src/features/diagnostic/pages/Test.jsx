import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { v4 as uuid } from 'uuid';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import Button from '@components/Button/Button';
import OptionRow from '@components/OptionRow/OptionRow';
import Card from '@components/Card/Card';
import Markdown from '@components/Markdown/Markdown';
import Skeleton from '@components/Skeleton/Skeleton';
import ErrorState from '@components/ErrorState/ErrorState';
import BubbleLoader from '@components/BubbleLoader/BubbleLoader';
import Routes from '@shared/constant/route-paths';
import { queryClient } from '@shared/providers/QueryProvider';
import { ENROLLMENT_KEY } from '@features/onboarding/hooks/useEnrollment';
import Top from '../components/Top';
import styles from './Test.module.scss';

// DIAG-01: soru ekranı. POST /diagnostics (başlat/sürdür) → GET /diagnostics/{code}?position → POST …/answers.
export default function Test() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [code, setCode] = useState(null);
  const [position, setPosition] = useState(null);
  const [selected, setSelected] = useState(null);
  const startedAt = useRef(Date.now());
  const refs = useRef({}); // position → clientRef (yeniden denemede aynı anahtar)

  const start = useApiMutation(() => api.learningDiagnosticStart(), {
    onSuccess: (d) => {
      const s = d.session;
      if (s.status === 'completed') return nav(Routes.diagnosticResult, { replace: true });
      setCode(s.code);
      setPosition(s.currentPosition);
    },
    onError: () => {},
  });
  useEffect(() => { start.mutate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const item = useApiQuery(['learning', 'diagnostic', code, position], () => api.learningDiagnosticGet(code, { position }), { enabled: !!code && position != null });
  const view = item.data?.current;
  const session = item.data?.session;

  useEffect(() => { setSelected(view?.state?.selectedLabel ?? null); startedAt.current = Date.now(); }, [view?.position, view?.state?.selectedLabel]);

  const finish = useApiMutation(() => api.learningDiagnosticComplete(code), {
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ENROLLMENT_KEY }); nav(Routes.diagnosticResult, { replace: true }); },
  });
  const answer = useApiMutation(
    (label) => {
      if (!refs.current[position]) refs.current[position] = uuid();
      return api.learningDiagnosticAnswer(code, { position, selectedLabel: label, timeMs: Date.now() - startedAt.current, clientRef: refs.current[position] });
    },
    {
      onSuccess: (r) => {
        queryClient.invalidateQueries({ queryKey: ['learning', 'diagnostic', code] });
        if (r.halfway) return nav(Routes.diagnosticBreak);
        if (r.next == null) return finish.mutate();
        setPosition(r.next);
      },
    }
  );
  const pause = useApiMutation(() => api.learningDiagnosticPause(code), {
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ENROLLMENT_KEY }); nav(Routes.onbDiagnostic); },
  });
  const exit = () => (code ? pause.mutate() : nav(Routes.onbDiagnostic));

  const submit = useCallback((label) => { if (!answer.isPending) answer.mutate(label); }, [answer]);

  // Klavye: A–E seçer, Enter gönderir.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
      const opts = view?.question?.options || [];
      const hit = opts.find((o) => o.label.toLowerCase() === e.key.toLowerCase());
      if (hit) setSelected(hit.label);
      else if (e.key === 'Enter' && selected && document.activeElement?.tagName !== 'BUTTON') submit(selected);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, selected, submit]);

  if (start.isError) {
    return <div className={styles.center}><ErrorState error={start.error} onRetry={() => start.mutate()} /><Button variant="tertiary" onClick={() => nav(Routes.onbDiagnostic)}>{t('common.back')}</Button></div>;
  }
  if (finish.isPending) return <BubbleLoader fullscreen label={t('diag.finishing')} />;
  if (item.isError && !view) return <div className={styles.center}><ErrorState error={item.error} onRetry={item.refetch} /></div>;
  if (view?.sessionStatus === 'completed') return <Navigate to={Routes.diagnosticResult} replace />;

  const q = view?.question;
  const p = view?.passage;
  const progress = session?.progress;

  return (
    <>
      <Top title={t('diag.title')} answered={progress?.answered ?? 0} total={session?.plannedItemCount ?? view?.total ?? 0} onExit={exit} exiting={pause.isPending} />
      <div className={styles.page}>
        {!view && <Skeleton height={240} />}
        {view && (
          <div className={styles.grid}>
            {p && (
              <Card className={styles.passage}>
                <p className="t-caption muted">{p.title || t('diag.passage')}{p.wordCount ? ` · ${t('diag.words', { n: p.wordCount })}` : ''}</p>
                <div className="reading t-reading-m" lang="en"><Markdown source={p.body} /></div>
              </Card>
            )}
            <div className="stack">
              <p className="t-caption muted">{t('diag.questionOf', { n: view.position, total: view.total })} · {q.questionType.name}</p>
              <div className="reading t-reading-m" lang="en"><Markdown source={q.stem} /></div>
              <div className="stack-sm" role="group" aria-label={t('diag.options')}>
                {q.options.map((o) => (
                  <OptionRow key={o.label} letter={o.label} state={selected === o.label ? 'selected' : 'default'} onClick={() => setSelected(o.label)} disabled={answer.isPending}>{o.text}</OptionRow>
                ))}
              </div>
              <div className={styles.actions}>
                <Button variant="tertiary" disabled={answer.isPending} onClick={() => submit(null)}>{t('diag.dontKnow')}</Button>
                <Button size="lg" disabled={!selected} loading={answer.isPending} onClick={() => submit(selected)}>{t('diag.answer')}</Button>
              </div>
              <p className="t-caption muted">{t('diag.noHints')}</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
