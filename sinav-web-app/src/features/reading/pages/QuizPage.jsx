import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BookOpen, ListChecks, Lock, RotateCcw } from 'lucide-react';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import Routes, { path } from '@shared/constant/route-paths';
import Button from '@components/Button/Button';
import IconButton from '@components/IconButton/IconButton';
import Chip from '@components/Chip/Chip';
import OptionRow from '@components/OptionRow/OptionRow';
import ProgressBar from '@components/ProgressBar/ProgressBar';
import ErrorState from '@components/ErrorState/ErrorState';
import EmptyState from '@components/EmptyState/EmptyState';
import BubbleLoader from '@components/BubbleLoader/BubbleLoader';
import Skeleton from '@components/Skeleton/Skeleton';
import { readingKeys } from '../hooks/readingKeys';
import styles from '../components/Reading.module.scss';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

function Activities({ items }) {
  const { t } = useTranslation();
  if (!items?.length) return null;
  return (
    <section className="stack-sm" aria-labelledby="quiz-acts">
      <h2 id="quiz-acts" className="t-heading-3">{t('read.quiz.activities')}</h2>
      <p className="t-body-s muted">{t('read.quiz.activitiesBody')}</p>
      <ol className={styles.quizActs}>
        {items.map((a, i) => <li key={i} className="reading t-reading-s" lang="en">{a}</li>)}
      </ol>
    </section>
  );
}

function Result({ score, total, onRetry, onBack, activities }) {
  const { t } = useTranslation();
  const ratio = total ? score / total : 0;
  const note = ratio >= 0.8 ? 'read.quiz.resultGreat' : ratio >= 0.5 ? 'read.quiz.resultGood' : 'read.quiz.resultLow';
  return (
    <div className="stack">
      <div className={styles.quizResult}>
        <p className="t-display-m tnum">{`${score}/${total}`}</p>
        <p className="t-title">{t('read.quiz.result', { n: score, total })}</p>
        <p className="t-body-m muted">{t(note)}</p>
        <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button startIcon={<RotateCcw size={16} />} onClick={onRetry}>{t('read.quiz.retry')}</Button>
          <Button variant="secondary" startIcon={<BookOpen size={16} />} onClick={onBack}>{t('read.quiz.backToBook')}</Button>
        </div>
      </div>
      <Activities items={activities} />
    </div>
  );
}

/** Kitap soruları: tek tek çözülür, seçimden sonra doğru cevap ve kısa açıklama görünür; sonda puan ve kitabın etkinlikleri. */
export default function QuizPage() {
  const { code } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const bookQ = useApiQuery(readingKeys.book(code), () => api.contentReadingBookGet(code));
  const quizQ = useApiQuery([...readingKeys.book(code), 'quiz'], () => api.contentReadingQuizGet(code), {
    // İlk açılışta sorular sunucuda hazırlanır: hazır olana dek kısa aralıkla sorulur.
    refetchInterval: (q) => (q.state.data?.status === 'generating' ? 2500 : false),
    refetchOnWindowFocus: false,
    retry: false,
  });
  const [at, setAt] = useState(0);
  const [picks, setPicks] = useState({});
  const [done, setDone] = useState(false);
  const back = () => nav(path(Routes.book, { code }));
  const errCode = quizQ.error?.response?.data?.error?.code;

  const header = (
    <header className={styles.topBar}>
      <IconButton label={t('read.quiz.backToBook')} onClick={back}><ArrowLeft size={20} /></IconButton>
      <div className={styles.topTitle}>
        <span className={`t-title ${styles.clamp1}`}>{t('read.quiz.title')}</span>
        {bookQ.data?.title && <span className={`t-caption muted ${styles.clamp1}`}>{bookQ.data.title}</span>}
      </div>
    </header>
  );
  const shell = (body) => <div className={styles.reader}>{header}<main className={styles.page}>{body}</main></div>;

  if (quizQ.isLoading) return shell(<div className="stack"><Skeleton height={28} width="50%" /><Skeleton height={220} /></div>);
  if (errCode === 'READING_QUIZ_LOCKED') {
    return shell(<EmptyState icon={<Lock size={28} />} title={t('read.quiz.locked')} body={t('read.quiz.lockedBody')} action={<Button onClick={() => nav(Routes.premium)}>{t('read.quiz.upgrade')}</Button>} />);
  }
  if (quizQ.isError) return shell(<ErrorState error={quizQ.error} onRetry={quizQ.refetch} />);
  const quiz = quizQ.data;
  if (quiz.status === 'generating') {
    return shell(<div className={styles.quizResult}><BubbleLoader label={t('read.quiz.generating')} /><p className="t-title">{t('read.quiz.generating')}</p><p className="t-body-m muted">{t('read.quiz.generatingBody')}</p></div>);
  }
  if (quiz.status === 'failed') {
    const busy = quiz.errorCode === 'READING_QUIZ_BUSY';
    return shell(<EmptyState icon={<ListChecks size={28} />} title={busy ? t('read.quiz.busy') : t('read.quiz.failed')} body={busy ? undefined : t('read.quiz.failedBody')} action={<Button variant="secondary" onClick={back}>{t('read.quiz.backToBook')}</Button>} />);
  }
  const questions = quiz.questions || [];
  if (!questions.length) {
    return shell(quiz.activities?.length ? <Activities items={quiz.activities} /> : <EmptyState icon={<ListChecks size={28} />} title={t('read.quiz.empty')} action={<Button variant="secondary" onClick={back}>{t('read.quiz.backToBook')}</Button>} />);
  }
  const total = questions.length;
  const score = questions.filter((q) => picks[q.id] === q.answer).length;
  const retry = () => { setPicks({}); setAt(0); setDone(false); };
  if (done) return shell(<Result score={score} total={total} onRetry={retry} onBack={back} activities={quiz.activities} />);

  const q = questions[at];
  const picked = picks[q.id];
  const answered = picked !== undefined;
  const last = at === total - 1;
  const stateOf = (i) => (!answered ? 'default' : i === q.answer ? 'correct' : i === picked ? 'wrong' : 'disabled');
  const labelOf = (i) => (!answered ? undefined : i === q.answer ? (i === picked ? t('read.quiz.correct') : t('read.quiz.rightAnswer')) : i === picked ? t('read.quiz.wrong') : undefined);
  return shell(
    <div className="stack">
      <ProgressBar value={((at + (answered ? 1 : 0)) / total) * 100} label={t('read.quiz.progress', { n: at + 1, total })} />
      <div className={styles.chips}>
        <span className="t-caption muted tnum">{t('read.quiz.progress', { n: at + 1, total })}</span>
        <Chip size="sm" tone={q.source === 'book' ? 'accent' : undefined}>{q.source === 'book' ? t('read.quiz.fromBook') : t('read.quiz.fromAi')}</Chip>
      </div>
      <p className="reading t-reading-m" lang="en">{q.stem}</p>
      <div className="stack-sm" role="group" aria-label={q.stem}>
        {q.options.map((o, i) => (
          <OptionRow key={i} letter={LETTERS[i]} text={o} state={stateOf(i)} statusLabel={labelOf(i)} disabled={answered} onClick={() => setPicks((p) => ({ ...p, [q.id]: i }))}>{o}</OptionRow>
        ))}
      </div>
      {answered && q.explanation && <p className={`t-body-m ${styles.quizWhy}`}>{q.explanation}</p>}
      {answered && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button onClick={() => (last ? setDone(true) : setAt(at + 1))}>{last ? t('read.quiz.seeResult') : t('read.quiz.next')}</Button>
        </div>
      )}
    </div>,
  );
}
