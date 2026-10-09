import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import api from '@api';
import useApiMutation from '@hooks/useApiMutation';
import Button from '@components/Button/Button';
import Chip from '@components/Chip/Chip';
import TextInput from '@components/TextInput/TextInput';
import Routes from '@shared/constant/route-paths';
import { queryClient } from '@shared/providers/QueryProvider';
import { useOnboardingStore } from '@store/onboardingStore';
import useEnrollment, { ENROLLMENT_KEY } from '../hooks/useEnrollment';
import OnbShell from '../components/OnbShell';
import o from '../components/Onb.module.scss';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const MINUTES = [15, 30, 45, 60, 90, 120];
const PRESETS = { weekdays: [1, 2, 3, 4, 5], all: WEEKDAYS, weekend: [6, 7] };

// ONB-04: müsaitlik. PUT /availability planı yeniden üretir; hatırlatma saati bildirim tercihine yazılır.
export default function Availability() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { availability, reminderTime, patch } = useOnboardingStore();
  const { isLoading, enrollment } = useEnrollment();
  const { days, minutes } = availability;
  const setAv = (p) => patch({ availability: { ...availability, ...p } });
  const toggle = (d) => setAv({ days: days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort() });

  const save = useApiMutation(
    async () => {
      const res = await api.learningAvailabilitySave(WEEKDAYS.map((weekday) => ({ weekday, minutes: days.includes(weekday) ? minutes : 0 })));
      try {
        await api.identityNotificationPrefsUpdate({ dailyReminderEnabled: !!reminderTime, dailyReminderTime: reminderTime || null });
      } catch {
        /* hatırlatma tercihi plan için zorunlu değil; sonra Ayarlar'dan yazılır */
      }
      return res;
    },
    { onSuccess: () => { queryClient.invalidateQueries({ queryKey: ENROLLMENT_KEY }); nav(Routes.onbDiagnostic); } }
  );

  if (!isLoading && !enrollment) return <Navigate to={Routes.onbExam} replace />;
  const weekly = days.length * minutes;

  return (
    <OnbShell
      step="availability"
      backTo={Routes.onbDate}
      title={t('onb.av.title')}
      subtitle={t('onb.av.subtitle')}
      footer={<Button size="lg" disabled={days.length === 0} loading={save.isPending} onClick={() => save.mutate()}>{t('common.continue')}</Button>}
    >
      <section className="stack-sm" aria-labelledby="av-days">
        <h2 id="av-days" className="t-heading-3">{t('onb.av.days')}</h2>
        <div className={o.chips}>
          {Object.entries(PRESETS).map(([k, v]) => (
            <Chip key={k} selected={days.length === v.length && v.every((d) => days.includes(d))} onClick={() => setAv({ days: v })}>{t(`onb.av.preset.${k}`)}</Chip>
          ))}
        </div>
        <div className={o.days} role="group" aria-label={t('onb.av.days')}>
          {WEEKDAYS.map((d) => (
            <button key={d} type="button" aria-pressed={days.includes(d)} className={classNames(o.day, days.includes(d) && o.on)} onClick={() => toggle(d)}>{t(`onb.av.wd.${d}`)}</button>
          ))}
        </div>
      </section>
      <section className="stack-sm" aria-labelledby="av-min">
        <h2 id="av-min" className="t-heading-3">{t('onb.av.minutes')}</h2>
        <div className={o.chips}>
          {MINUTES.map((m) => <Chip key={m} selected={minutes === m} onClick={() => setAv({ minutes: m })}>{t('onb.av.min', { n: m })}</Chip>)}
        </div>
        <p className="t-body-s muted">{t('onb.av.weekly', { n: weekly })}</p>
      </section>
      <section className="stack-sm">
        <h2 className="t-heading-3">{t('onb.av.reminder')}</h2>
        <TextInput label={t('onb.av.reminderLabel')} helper={t('onb.av.reminderHelper')} type="time" value={reminderTime || ''} onChange={(e) => patch({ reminderTime: e.target.value || null })} />
      </section>
    </OnbShell>
  );
}
