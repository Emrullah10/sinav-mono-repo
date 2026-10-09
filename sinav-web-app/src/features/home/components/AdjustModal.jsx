import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import Modal from '@components/Modal/Modal';
import Button from '@components/Button/Button';
import Chip from '@components/Chip/Chip';
import Segmented from '@components/Segmented/Segmented';
import { notify } from '@shared/utils/notify';
import { queryClient } from '@shared/providers/QueryProvider';
import { TODAY_KEY } from '../hooks/useToday';

const SHORT = [15, 30, 45, 60];

// HOME-03: POST /plan/adjust { shortDay | skipDay | reset | focus }.
export default function AdjustModal({ open, onClose, defaultMinutes }) {
  const { t } = useTranslation();
  const [minutes, setMinutes] = useState(SHORT.includes(defaultMinutes) ? defaultMinutes : 30);
  const [focus, setFocus] = useState(null);
  const overview = useApiQuery(['learning', 'study', 'overview'], () => api.learningStudyOverviewGet(), { enabled: open });
  const adjust = useApiMutation((body) => api.learningPlanAdjust(body), {
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: TODAY_KEY });
      if (r.freeze?.freezeUsed) notify(t('home.adjust.freezeUsed'), 'success');
      else if (r.freeze?.streakAtRisk) notify(t('home.adjust.atRisk'), 'warning');
      else notify(t('home.adjust.done'), 'success');
      onClose();
    },
  });
  const run = (body) => adjust.mutate(body);
  return (
    <Modal open={open} onClose={onClose} title={t('home.adjust.title')}>
      <div className="stack">
        <section className="stack-sm">
          <h3 className="t-title">{t('home.adjust.shortTitle')}</h3>
          <p className="muted t-body-s">{t('home.adjust.shortBody')}</p>
          <Segmented label={t('home.adjust.shortTitle')} value={minutes} onChange={setMinutes} options={SHORT.map((m) => ({ value: m, label: t('home.adjust.minutes', { n: m }) }))} />
          <Button loading={adjust.isPending} onClick={() => run({ shortDay: { minutes } })}>{t('home.adjust.apply')}</Button>
        </section>
        {(overview.data?.types || []).length > 0 && (
          <section className="stack-sm">
            <h3 className="t-title">{t('home.adjust.focusTitle')}</h3>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {overview.data.types.map((ty) => <Chip key={ty.key} selected={focus === ty.key} onClick={() => setFocus(ty.key)}>{ty.shortName}</Chip>)}
            </div>
            <Button variant="secondary" disabled={!focus} loading={adjust.isPending} onClick={() => run({ focus: { questionTypeKey: focus } })}>{t('home.adjust.focusCta')}</Button>
          </section>
        )}
        <section className="stack-sm">
          <h3 className="t-title">{t('home.adjust.skipTitle')}</h3>
          <p className="muted t-body-s">{t('home.adjust.skipBody')}</p>
          <Button variant="secondary" loading={adjust.isPending} onClick={() => run({ skipDay: true })}>{t('home.adjust.skipCta')}</Button>
        </section>
        <section className="stack-sm">
          <h3 className="t-title">{t('home.adjust.resetTitle')}</h3>
          <p className="muted t-body-s">{t('home.adjust.resetBody')}</p>
          <Button variant="tertiary" loading={adjust.isPending} onClick={() => run({ reset: true })}>{t('home.adjust.resetCta')}</Button>
        </section>
      </div>
    </Modal>
  );
}
