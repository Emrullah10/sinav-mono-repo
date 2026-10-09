import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import Chip from '@components/Chip/Chip';
import Segmented from '@components/Segmented/Segmented';
import ErrorState from '@components/ErrorState/ErrorState';
import Skeleton from '@components/Skeleton/Skeleton';
import usePracticeStart from '../hooks/usePracticeStart';

const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

// STUDY-06: GET /practice/options → POST /practice-sessions.
export default function PracticeSetup() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const q = useApiQuery(['learning', 'practice', 'options'], () => api.learningPracticeOptionsGet());
  const start = usePracticeStart();
  const [types, setTypes] = useState(() => (params.get('type') ? [params.get('type')] : []));
  const [skills, setSkills] = useState([]);
  const [count, setCount] = useState(null);
  const [mode, setMode] = useState(null);
  const [difficulty, setDifficulty] = useState(null);
  if (q.isLoading) return <div className="stack"><Skeleton height={48} width="40%" /><Skeleton height={360} /></div>;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const o = q.data;
  const c = count ?? o.defaults.count;
  const m = mode ?? o.defaults.mode;
  const d = difficulty ?? o.defaults.difficulty;
  const u = o.usage;
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <PageHeader title={t('study.setup.title')} subtitle={t('study.setup.subtitle')} />
      <Card>
        <div className="stack">
          <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="t-title">{t('study.setup.types')}</legend>
            <p className="t-body-s muted">{t('study.setup.typesHint')}</p>
            <div className="row" style={{ flexWrap: 'wrap' }}>{o.types.map((ty) => <Chip key={ty.key} selected={types.includes(ty.key)} onClick={() => setTypes(toggle(types, ty.key))}>{ty.name}</Chip>)}</div>
          </fieldset>
          {o.skills?.length > 0 && (
            <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="t-title">{t('study.setup.skills')}</legend>
              <div className="row" style={{ flexWrap: 'wrap' }}>{o.skills.map((s) => <Chip key={s.key} size="sm" selected={skills.includes(s.key)} onClick={() => setSkills(toggle(skills, s.key))}>{s.name}</Chip>)}</div>
            </fieldset>
          )}
          <div className="stack-sm"><p className="t-title">{t('study.setup.count')}</p><Segmented label={t('study.setup.count')} value={c} onChange={setCount} options={o.counts.map((n) => ({ value: n, label: String(n) }))} /></div>
          <div className="stack-sm">
            <p className="t-title">{t('study.setup.mode')}</p>
            <Segmented label={t('study.setup.mode')} value={m} onChange={setMode} options={o.modes.map((x) => ({ value: x, label: t(`study.mode.${x}`) }))} />
            <p className="t-body-s muted">{m === 'learning' ? t('study.modeHint.learning') : t('study.modeHint.other')}</p>
          </div>
          <div className="stack-sm"><p className="t-title">{t('study.setup.difficulty')}</p><Segmented label={t('study.setup.difficulty')} value={d} onChange={setDifficulty} options={o.difficulties.map((x) => ({ value: x, label: t(`study.difficulty.${x}`) }))} /></div>
          <p className="t-body-s muted">{u.limit == null ? t('study.setup.usageUnlimited') : t('study.setup.usage', { remaining: u.remaining, used: u.used, limit: u.limit })}</p>
          <div className="row"><Button size="lg" loading={start.isPending} onClick={() => start.mutate({ ...(types.length ? { questionTypeKeys: types } : {}), ...(skills.length ? { skillKeys: skills } : {}), count: c, mode: m, difficulty: d })}>{t('study.setup.start')}</Button></div>
        </div>
      </Card>
    </div>
  );
}
