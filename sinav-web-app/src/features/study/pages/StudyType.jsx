import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import Routes, { path } from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import Chip from '@components/Chip/Chip';
import ListRow from '@components/ListRow/ListRow';
import IconButton from '@components/IconButton/IconButton';
import ErrorState from '@components/ErrorState/ErrorState';
import Skeleton from '@components/Skeleton/Skeleton';
import { ArrowLeft } from 'lucide-react';
import MasteryBadge from '../components/MasteryBadge';
import usePracticeStart from '../hooks/usePracticeStart';

// STUDY-02: GET /study/question-types/{key}.
export default function StudyType() {
  const { type } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const start = usePracticeStart();
  const q = useApiQuery(['learning', 'study', 'type', type], () => api.learningStudyQuestionTypeGet(type));
  if (q.isLoading) return <div className="stack"><Skeleton height={48} width="40%" /><Skeleton height={240} /></div>;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const d = q.data;
  const note = d.strategyNote;
  return (
    <div className="stack">
      <PageHeader
        back={<IconButton label={t('common.back')} onClick={() => nav(Routes.study)}><ArrowLeft size={20} /></IconButton>}
        eyebrow={t('study.type.title')} title={d.type.name} subtitle={d.type.description}
        actions={<Button variant={d.topicPractice ? 'secondary' : 'primary'} loading={start.isPending && !start.variables?.skillKeys} onClick={() => start.mutate({ questionTypeKeys: [type], count: 10 })}>{t(d.topicPractice ? 'study.type.mixed' : 'study.type.practice')}</Button>}
      />
      <Card>
        <div className="stack-sm">
          <MasteryBadge level={d.level} mastery={d.mastery} change7d={d.change7d} label={d.type.name} />
          <p className="t-body-s muted">
            {t('study.hub.questionsInExam', { n: d.type.questionCountInExam })} · {t('study.type.perQuestion', { n: d.type.targetSecondsPerQuestion })} · {t('study.type.available', { n: d.availableQuestions })}
            {d.openMistakes > 0 && <> · {t('study.type.openMistakes', { n: d.openMistakes })}</>}
          </p>
        </div>
      </Card>
      {note && (
        <Card tone="accent">
          <div className="stack-sm">
            <p className="t-caption muted">{t('study.type.strategy')}</p>
            <h2 className="t-heading-3">{note.title}</h2>
            {note.summary && <p className="t-body-m">{note.summary}</p>}
            <div className="row">
              <Button size="sm" variant="secondary" onClick={() => nav(path(Routes.note, { id: note.itemCode }))}>{t('study.type.readNote')}</Button>
              {note.progress && <Chip tone="success" size="sm">{t(`study.type.${note.progress === 'understood' ? 'noteUnderstood' : 'noteRead'}`)}</Chip>}
            </div>
          </div>
        </Card>
      )}
      {d.topicPractice ? (
        <section className="stack-sm" aria-labelledby="topics-h">
          <h2 id="topics-h" className="t-heading-2">{t('study.type.topics')}</h2>
          <p className="t-body-s muted">{t('study.type.topicsHint')}</p>
          {d.skills.map((s) => (
            <Card key={s.key}>
              <div className="stack-sm">
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <h3 className="t-title">{s.name}</h3>
                  <span className="t-caption muted">{s.availableQuestions ? t('study.type.topicQuestions', { n: s.availableQuestions }) : t('study.type.topicEmpty')}</span>
                </div>
                <MasteryBadge level={s.level} mastery={s.mastery} change7d={s.change7d} label={s.name} />
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <Button size="sm" disabled={!s.availableQuestions} loading={start.isPending && start.variables?.skillKeys?.[0] === s.key}
                    onClick={() => start.mutate({ questionTypeKeys: [type], skillKeys: [s.key], count: 10 })}>{t('study.type.solveTopic')}</Button>
                  {s.note && (
                    <Button size="sm" variant="tertiary" onClick={() => nav(path(Routes.note, { id: s.note.itemCode }))}>
                      {s.note.locked ? t('study.type.topicNoteLocked') : t('study.type.topicNote')}
                    </Button>
                  )}
                  {s.note?.progress && <Chip tone="success" size="sm">{t(`study.type.${s.note.progress === 'understood' ? 'noteUnderstood' : 'noteRead'}`)}</Chip>}
                </div>
              </div>
            </Card>
          ))}
        </section>
      ) : (
      <section className="stack-sm">
        <h2 className="t-heading-2">{t('study.type.skills')}</h2>
        {d.skills.length === 0 ? <p className="muted">{t('study.type.noSkills')}</p> : d.skills.map((s) => (
          <Card key={s.key}>
            <ListRow title={s.name} onClick={() => nav(path(Routes.studySkill, { key: s.key }))}>
              <div style={{ marginTop: 'var(--space-2)' }}><MasteryBadge level={s.level} mastery={s.mastery} change7d={s.change7d} label={s.name} /></div>
            </ListRow>
          </Card>
        ))}
      </section>
      )}
    </div>
  );
}
