import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, Clock, HelpCircle } from 'lucide-react';
import classNames from 'classnames';
import Button from '@components/Button/Button';
import Chip from '@components/Chip/Chip';
import ProgressBar from '@components/ProgressBar/ProgressBar';
import styles from './TaskCard.module.scss';

export const taskTitle = (t, task) => {
  if (task.kind === 'practice' && task.questionType?.name) return t('home.kindDetail.practice', { type: task.questionType.name });
  return t(`home.kind.${task.kind}`);
};

export const taskReason = (t, task) => {
  const p = task.reasonParams || {};
  if (task.reason === 'weak_skill' && p.typeName == null) return t('home.reason.weak_skill_plain');
  const key = `home.reason.${task.reason}`;
  return t(key, { count: p.count ?? 0, typeName: p.typeName ?? p.skillName ?? '', mastery: Math.round(p.mastery ?? 0) });
};

// Tek plan görevi: durum, neden, süre; sıradaki göreve vurgu.
export default function TaskCard({ task, index, isNext, busy, onStart, onPostpone, onSkip }) {
  const { t } = useTranslation();
  const done = task.status === 'completed';
  const closed = done || task.status === 'skipped' || task.status === 'postponed';
  const questions = task.params?.count;
  return (
    <article className={classNames(styles.card, isNext && styles.next, closed && styles.closed)} aria-label={taskTitle(t, task)}>
      {isNext && <span className={styles.badge}>{t('home.nextBadge')}</span>}
      <div className={styles.head}>
        <span className={classNames(styles.num, done && styles.numDone)} aria-hidden>{done ? <Check size={16} /> : index + 1}</span>
        <div className="grow stack-sm" style={{ gap: 'var(--space-2)' }}>
          <h3 className={classNames('t-title', task.status === 'skipped' && styles.strike)}>{taskTitle(t, task)}</h3>
          <p className="t-body-s muted"><strong>{t('home.reasonLabel')}</strong> {taskReason(t, task)}</p>
          <p className="t-caption tertiary row" style={{ gap: 'var(--space-3)' }}>
            <span className="row" style={{ gap: 4 }}><Clock size={14} aria-hidden />{questions ? t('home.taskMetaQ', { min: task.estimatedMinutes, n: questions }) : t('home.taskMeta', { min: task.estimatedMinutes })}</span>
            {task.skill?.name && <span className="row" style={{ gap: 4 }}><HelpCircle size={14} aria-hidden />{task.skill.name}</span>}
          </p>
          {task.status === 'in_progress' && task.progressPct > 0 && <ProgressBar value={task.progressPct} size="sm" label={taskTitle(t, task)} />}
        </div>
        <div className={styles.actions}>
          {done && <Chip tone="success" size="sm">{t('home.done')}</Chip>}
          {task.status === 'skipped' && <Chip size="sm">{t('home.skipped')}</Chip>}
          {task.status === 'postponed' && <Chip size="sm">{t('home.postponed')}</Chip>}
          {!closed && (
            <>
              <Button variant={isNext ? 'primary' : 'secondary'} size="sm" loading={busy} endIcon={<ArrowRight size={16} />} onClick={() => onStart(task)}>
                {task.status === 'in_progress' ? t('home.resume') : t('home.start')}
              </Button>
              <span className={styles.links}>
                <button type="button" onClick={() => onPostpone(task)}>{t('home.postpone')}</button>
                <button type="button" onClick={() => onSkip(task)}>{t('home.skip')}</button>
              </span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
