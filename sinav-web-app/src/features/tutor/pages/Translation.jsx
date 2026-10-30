import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { v4 as uuid } from 'uuid';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import { apiErrorCode } from '@sinav/client-sdk';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import Chip from '@components/Chip/Chip';
import Banner from '@components/Banner/Banner';
import ProgressBar from '@components/ProgressBar/ProgressBar';
import TextInput from '@components/TextInput/TextInput';
import ErrorState from '@components/ErrorState/ErrorState';
import { SkeletonList } from '@components/Skeleton/Skeleton';
import styles from './Home.module.scss';

const DIRECTIONS = ['en_tr', 'tr_en'];

// Çeviri koçu: bir cümle gelir, çevirini yazarsın, ölçütlerle değerlendirilirsin (mobildeki ekranın karşılığı).
export default function Translation() {
  const { t } = useTranslation();
  const [direction, setDirection] = useState('en_tr');
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const ref = useRef(uuid());

  const prompt = useApiQuery(['tutor', 'translation-prompt', direction], () => api.tutorTranslationPromptNext({ direction }), { staleTime: 0, gcTime: 0, refetchOnWindowFocus: false });
  const evaluate = useApiMutation(
    () => api.tutorTranslationEvaluate({ promptCode: prompt.data.promptCode, userText: answer.trim(), clientRef: ref.current }),
    {
      onSuccess: (res) => (res.status === 'failed' ? setError(t('tutor.tr.failed')) : setResult(res)),
      onError: (e) => setError(apiErrorCode(e) === 'QUOTA_EXCEEDED' ? t('tutor.tr.quota') : null),
    },
  );
  const reset = () => { setResult(null); setAnswer(''); setError(null); };
  const next = () => { reset(); ref.current = uuid(); prompt.refetch(); };
  const pick = (d) => { setDirection(d); reset(); ref.current = uuid(); };

  const noPrompt = prompt.isError && apiErrorCode(prompt.error) === 'TUTOR_TRANSLATION_PROMPT_NOT_FOUND';
  return (
    <div className={styles.page}>
      <PageHeader title={t('tutor.tr.title')} subtitle={t('tutor.tr.subtitle')} />
      <div className={styles.chips} role="group" aria-label={t('tutor.tr.direction')}>
        {DIRECTIONS.map((d) => <Chip key={d} selected={direction === d} onClick={() => pick(d)}>{t(`tutor.tr.direction.${d}`)}</Chip>)}
      </div>
      {error && <Banner tone="danger" onClose={() => setError(null)}>{error}</Banner>}
      {prompt.isLoading && <SkeletonList rows={2} />}
      {noPrompt && <Banner tone="info">{t('tutor.tr.noPrompt')}</Banner>}
      {prompt.isError && !noPrompt && <ErrorState error={prompt.error} onRetry={prompt.refetch} />}
      {prompt.data && (
        <div className="stack">
          {prompt.data.usage?.limit != null && <p className="muted t-caption">{t('tutor.tr.usage', { n: prompt.data.usage.remaining })}</p>}
          <Card><p className="reading t-reading-l" lang={direction === 'en_tr' ? 'en' : 'tr'}>{prompt.data.sourceText}</p></Card>
          {result ? (
            <div className="stack">
              <Card className="stack-sm">
                <p className="t-numeric-xl tnum">{t('tutor.tr.score', { score: result.totalScore, max: result.maxScore })}</p>
                <ProgressBar value={result.maxScore ? result.totalScore / result.maxScore : 0} label={t('tutor.tr.score', { score: result.totalScore, max: result.maxScore })} />
              </Card>
              <Card className="stack-sm">
                <h2 className="t-heading-3">{t('tutor.tr.criteria')}</h2>
                {result.scores.map((s) => (
                  <div key={s.key}>
                    <p className="t-label-m">{`${s.name}: ${s.points}/${s.maxPoints}`}</p>
                    {s.comment && <p className="muted t-body-s">{s.comment}</p>}
                  </div>
                ))}
              </Card>
              <Card className="stack-sm">
                <h2 className="t-heading-3">{t('tutor.tr.suggested')}</h2>
                <p className="t-body-l">{result.suggestedTranslation}</p>
              </Card>
              {result.feedback?.parts?.length > 0 && (
                <Card className="stack-sm">
                  <h2 className="t-heading-3">{t('tutor.tr.diff')}</h2>
                  <p className="t-body-l">
                    {result.feedback.parts.map((p, i) => (
                      <span key={i} style={p.kind === 'added' ? { color: 'var(--color-success-fg)', textDecoration: 'underline' } : p.kind === 'deleted' ? { color: 'var(--color-danger-fg)', textDecoration: 'line-through' } : undefined}>{`${p.text} `}</span>
                    ))}
                  </p>
                  <p className="muted t-caption">{`${t('tutor.tr.legend.added')} · ${t('tutor.tr.legend.deleted')}`}</p>
                </Card>
              )}
              {result.feedback?.summary && <p className="t-body-m">{result.feedback.summary}</p>}
              {result.feedback?.notes?.length > 0 && <ul className="t-body-s muted">{result.feedback.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
              <div><Button onClick={next}>{t('tutor.tr.next')}</Button></div>
            </div>
          ) : (
            <div className="stack">
              <TextInput label={t('tutor.tr.yourTranslation')} multiline rows={5} maxLength={2000} value={answer} onChange={(e) => setAnswer(e.target.value)} />
              <div><Button loading={evaluate.isPending} disabled={!answer.trim()} onClick={() => { setError(null); evaluate.mutate(); }}>{t('tutor.tr.evaluate')}</Button></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
