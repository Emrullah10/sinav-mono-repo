import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Lock } from 'lucide-react';
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
import EmptyState from '@components/EmptyState/EmptyState';
import MasteryBadge from '../components/MasteryBadge';
import usePracticeStart from '../hooks/usePracticeStart';

// STUDY-03: GET /study/skills/{key}.
export default function StudySkill() {
  const { key } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const start = usePracticeStart();
  const q = useApiQuery(['learning', 'study', 'skill', key], () => api.learningStudySkillGet(key));
  if (q.isLoading) return <div className="stack"><Skeleton height={48} width="40%" /><Skeleton height={240} /></div>;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const d = q.data;
  return (
    <div className="stack">
      <PageHeader
        back={<IconButton label={t('common.back')} onClick={() => nav(-1)}><ArrowLeft size={20} /></IconButton>}
        eyebrow={d.skill.parent?.name || t('study.skill.title')} title={d.skill.name} subtitle={d.skill.description}
        actions={<Button disabled={!d.availableQuestions} loading={start.isPending} onClick={() => start.mutate({ skillKeys: [key], count: 10 })}>{t('study.skill.practice')}</Button>}
      />
      <Card>
        <div className="stack-sm">
          <MasteryBadge level={d.level} mastery={d.mastery} change7d={d.change7d} label={d.skill.name} />
          <p className="t-body-s muted">{t('study.skill.available', { n: d.availableQuestions })}</p>
        </div>
      </Card>
      {d.children?.length > 0 && (
        <section className="stack-sm">
          <h2 className="t-heading-2">{t('study.skill.children')}</h2>
          {d.children.map((c) => (
            <Card key={c.key}><ListRow title={c.name} onClick={() => nav(path(Routes.studySkill, { key: c.key }))}><div style={{ marginTop: 'var(--space-2)' }}><MasteryBadge level={c.level} mastery={c.mastery} change7d={c.change7d} label={c.name} /></div></ListRow></Card>
          ))}
        </section>
      )}
      <section className="stack-sm">
        <h2 className="t-heading-2">{t('study.skill.notes')}</h2>
        {d.notes.length === 0 ? <EmptyState title={t('study.skill.noNotes')} /> : d.notes.map((n) => (
          <Card key={n.itemCode}>
            <ListRow title={n.title} subtitle={n.summary} onClick={() => nav(path(Routes.note, { id: n.itemCode }))}
              value={n.locked ? <Chip size="sm" icon={<Lock size={12} />}>{t('study.skill.locked')}</Chip> : n.progress ? t(`study.note.status.${n.progress}`) : t('study.skill.seconds', { n: n.readingSeconds })} />
          </Card>
        ))}
      </section>
    </div>
  );
}
