import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import classNames from 'classnames';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import Button from '@components/Button/Button';
import TextInput from '@components/TextInput/TextInput';
import Skeleton from '@components/Skeleton/Skeleton';
import ErrorState from '@components/ErrorState/ErrorState';
import Routes from '@shared/constant/route-paths';
import { ensureSession } from '@shared/auth/session';
import { queryClient } from '@shared/providers/QueryProvider';
import { useOnboardingStore } from '@store/onboardingStore';
import { ENROLLMENT_KEY } from '../hooks/useEnrollment';
import OnbShell from '../components/OnbShell';
import o from '../components/Onb.module.scss';

// ONB-03: sınav tarihi. Veri: GET /public/exam-tracks/{key} (oturumlar). "Devam"da POST /enrollments yazılır.
export default function DateSelect() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { trackKey, targetScore, reasonKeys, dateMode, sessionKey, customDate, patch } = useOnboardingStore();
  const [dateError, setDateError] = useState('');
  const { data, isLoading, error, refetch } = useApiQuery(['content', 'public', 'track', trackKey], () => api.contentPublicTrackGet(trackKey), { enabled: !!trackKey });
  const save = useApiMutation(
    async () => {
      await ensureSession();
      return api.learningEnrollmentCreate({
        trackKey,
        ...(targetScore != null ? { targetScore } : {}),
        dateMode,
        ...(dateMode === 'session' ? { examSessionKey: sessionKey } : {}),
        ...(dateMode === 'custom' ? { customExamDate: customDate } : {}),
        ...(reasonKeys.length ? { goalReasonKeys: reasonKeys } : {}),
      });
    },
    { onSuccess: () => { queryClient.invalidateQueries({ queryKey: ENROLLMENT_KEY }); nav(Routes.onbAvailability); } }
  );
  if (!trackKey) return <Navigate to={Routes.onbExam} replace />;

  const sessions = (data?.sessions || []).filter((s) => s.status !== 'held' && !dayjs(s.examDate).isBefore(dayjs(), 'day'));
  const today = dayjs();
  const ready = dateMode === 'unknown' || (dateMode === 'session' && sessionKey) || (dateMode === 'custom' && customDate && !dateError);
  const pickCustom = (v) => {
    patch({ customDate: v });
    const d = dayjs(v);
    setDateError(!v || !d.isValid() || !d.isAfter(today, 'day') || d.isAfter(today.add(2, 'year')) ? t('onb.date.customInvalid') : '');
  };

  return (
    <OnbShell
      step="date"
      backTo={Routes.onbGoal}
      title={t('onb.date.title')}
      subtitle={t('onb.date.subtitle')}
      footer={<Button size="lg" disabled={!ready} loading={save.isPending} onClick={() => save.mutate()}>{t('common.continue')}</Button>}
    >
      {isLoading && <Skeleton height={160} />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {data && (
        <div className="stack-sm" role="radiogroup" aria-label={t('onb.date.title')}>
          {sessions.map((s) => {
            const days = dayjs(s.examDate).diff(today.startOf('day'), 'day');
            const on = dateMode === 'session' && sessionKey === s.key;
            return (
              <button key={s.key} type="button" role="radio" aria-checked={on} className={classNames(o.choice, on && o.on)} onClick={() => patch({ dateMode: 'session', sessionKey: s.key })}>
                <div className={o.head}>
                  <strong className="t-heading-3">{s.name}</strong>
                  <span className={o.tag}>{s.isEstimated ? t('onb.date.estimatedIn', { n: Math.max(1, Math.round(days / 30)) }) : t('onb.date.daysLeft', { n: days })}</span>
                </div>
                <span className="t-body-m">{dayjs(s.examDate).format('D MMMM YYYY, dddd')}{s.examTime ? ` · ${s.examTime}` : ''}{s.isEstimated ? ` (${t('onb.exam.estimated')})` : ''}</span>
                {s.applicationStart && s.applicationEnd && (
                  <span className="t-caption muted">{t('onb.date.application', { from: dayjs(s.applicationStart).format('D MMMM'), to: dayjs(s.applicationEnd).format('D MMMM YYYY') })}</span>
                )}
              </button>
            );
          })}
          <button type="button" role="radio" aria-checked={dateMode === 'custom'} className={classNames(o.choice, dateMode === 'custom' && o.on)} onClick={() => patch({ dateMode: 'custom' })}>
            <strong className="t-heading-3">{t('onb.date.custom')}</strong>
            <span className="t-body-s muted">{t('onb.date.customBody')}</span>
          </button>
          {dateMode === 'custom' && (
            <TextInput label={t('onb.date.customLabel')} type="date" min={today.add(1, 'day').format('YYYY-MM-DD')} value={customDate || ''} error={customDate ? dateError : ''} onChange={(e) => pickCustom(e.target.value)} />
          )}
          <button type="button" role="radio" aria-checked={dateMode === 'unknown'} className={classNames(o.choice, dateMode === 'unknown' && o.on)} onClick={() => patch({ dateMode: 'unknown' })}>
            <strong className="t-heading-3">{t('onb.date.unknown')}</strong>
            <span className="t-body-s muted">{t('onb.date.unknownBody')}</span>
          </button>
        </div>
      )}
    </OnbShell>
  );
}
