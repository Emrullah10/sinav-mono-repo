import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import Button from '@components/Button/Button';
import Chip from '@components/Chip/Chip';
import TextInput from '@components/TextInput/TextInput';
import Banner from '@components/Banner/Banner';
import Skeleton from '@components/Skeleton/Skeleton';
import ErrorState from '@components/ErrorState/ErrorState';
import Routes from '@shared/constant/route-paths';
import { useOnboardingStore } from '@store/onboardingStore';
import OnbShell from '../components/OnbShell';
import o from '../components/Onb.module.scss';

const round2 = (n) => Math.round(n * 100) / 100;

// ONB-02: hedef puan. Veri: GET /public/exam-tracks/{key}; gereken doğru sayısı blueprint puanlamasından istemcide hesaplanır.
export default function GoalSelect() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { trackKey, targetScore, reasonKeys, patch } = useOnboardingStore();
  const { data, isLoading, error, refetch } = useApiQuery(['content', 'public', 'track', trackKey], () => api.contentPublicTrackGet(trackKey), { enabled: !!trackKey });
  const [custom, setCustom] = useState('');
  const bp = data?.blueprint;
  const per = bp?.scoringParams?.perCorrect || 1;

  // Varsayılan hedef: önerilen ön ayar.
  useEffect(() => {
    if (data && targetScore == null) patch({ targetScore: (data.goalPresets.find((g) => g.isDefault) || data.goalPresets[0])?.targetScore ?? null });
  }, [data, targetScore, patch]);

  if (!trackKey) return <Navigate to={Routes.onbExam} replace />;

  const required = (score) => Math.ceil(round2(score / per));
  const isPreset = data?.goalPresets.some((g) => g.targetScore === targetScore);
  const setCustomScore = (raw) => {
    setCustom(raw);
    const n = Number(String(raw).replace(',', '.'));
    if (Number.isFinite(n) && n >= (bp?.scoreMin ?? 0) && n <= (bp?.scoreMax ?? 100) && n > 0) patch({ targetScore: round2(required(n) * per) });
  };
  const toggleReason = (k) => patch({ reasonKeys: reasonKeys.includes(k) ? reasonKeys.filter((x) => x !== k) : [...reasonKeys, k] });
  const num = (v) => v.toLocaleString('tr-TR');

  return (
    <OnbShell
      step="goal"
      backTo={Routes.onbExam}
      title={t('onb.goal.title')}
      subtitle={t('onb.goal.subtitle')}
      footer={<Button size="lg" disabled={targetScore == null} onClick={() => nav(Routes.onbDate)}>{t('common.continue')}</Button>}
    >
      {isLoading && <Skeleton height={200} />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {data && (
        <>
          {data.track.notice && <Banner tone="warning">{data.track.notice}</Banner>}
          <div className={o.grid} role="radiogroup" aria-label={t('onb.goal.title')}>
            {data.goalPresets.map((g) => (
              <button key={g.targetScore} type="button" role="radio" aria-checked={targetScore === g.targetScore} className={classNames(o.choice, targetScore === g.targetScore && o.on)} onClick={() => { setCustom(''); patch({ targetScore: g.targetScore }); }}>
                <div className={o.head}>
                  <span className="t-heading-2 tnum">{t('onb.goal.points', { n: num(g.targetScore) })}</span>
                  {g.isDefault && <span className={o.tag}>{t('onb.goal.recommended')}</span>}
                </div>
                <strong className="t-body-m">{g.label}</strong>
                <span className="t-body-s muted">{g.description}</span>
                <span className="t-caption muted tnum">{t('onb.goal.required', { n: required(g.targetScore), total: bp.questionCount })}</span>
              </button>
            ))}
          </div>
          <TextInput
            label={t('onb.goal.custom')}
            helper={t('onb.goal.customHelper', { step: num(per) })}
            type="number"
            inputMode="decimal"
            min={bp.scoreMin}
            max={bp.scoreMax}
            step={per}
            value={custom !== '' ? custom : !isPreset && targetScore != null ? String(targetScore) : ''}
            onChange={(e) => setCustomScore(e.target.value)}
          />
          {targetScore != null && (
            <Banner tone="accent" title={t('onb.goal.summary', { score: num(targetScore) })}>
              {t('onb.goal.summaryBody', { n: required(targetScore), total: bp.questionCount })}
              {bp.scoringParams?.wrongPenalty === 0 ? ` ${t('onb.goal.noPenalty')}` : ''}
            </Banner>
          )}
          <div className="stack-sm">
            <h2 className="t-heading-3">{t('onb.goal.reasons')}</h2>
            <div className={o.chips}>
              {data.goalReasons.map((r) => <Chip key={r.key} selected={reasonKeys.includes(r.key)} onClick={() => toggleReason(r.key)}>{r.label}</Chip>)}
            </div>
          </div>
        </>
      )}
    </OnbShell>
  );
}
