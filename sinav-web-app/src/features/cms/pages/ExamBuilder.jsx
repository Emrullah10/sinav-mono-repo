import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import Routes, { path } from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import Select from '@components/Select/Select';
import Card from '@components/Card/Card';
import Banner from '@components/Banner/Banner';
import Skeleton from '@components/Skeleton/Skeleton';
import ErrorState from '@components/ErrorState/ErrorState';
import useTaxonomy from '../hooks/useTaxonomy';
import s from '../components/Cms.module.scss';

const FORMS = ['full', 'mini', 'question_type_drill'];
const Dist = ({ title, map }) => (
  <div><p className="muted t-caption">{title}</p><p className="t-body-s tnum">{Object.entries(map || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'}</p></div>
);

// CMS-09: deneme oluşturucu — planlanan dağılımın otomatik taslağı. GET /cms/exam-forms/autofill
export default function ExamBuilder() {
  const { t } = useTranslation();
  const tax = useTaxonomy();
  const [track, setTrack] = useState('yds-en');
  const [formType, setFormType] = useState('mini');
  const { data, isLoading, error, refetch } = useApiQuery(['content', 'cms', 'autofill', track, formType], () => api.contentCmsAutofillGet({ track, formType }));
  const mins = data ? Math.round(data.durationSeconds / 60) : 0;
  return (
    <div className={s.page}>
      <PageHeader title={t('cmsx.exam.title')} subtitle={t('cmsx.exam.subtitle')} />
      <div className={s.toolbar}>
        <Select label={t('cmsx.exam.track')} value={track} onChange={(e) => setTrack(e.target.value)} options={(tax.data?.tracks || [{ key: 'yds-en', name: 'yds-en' }]).map((x) => ({ value: x.key, label: x.name }))} />
        <Select label={t('cmsx.exam.formType')} value={formType} onChange={(e) => setFormType(e.target.value)} options={FORMS.map((v) => ({ value: v, label: t(`cmsx.exam.f.${v}`) }))} />
      </div>
      {isLoading && <Skeleton height={300} />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {data && (
        <>
          <Card>
            <h2 className="t-heading-3">{data.title}</h2>
            <p className="muted t-body-s tnum">{t('cmsx.exam.summary', { count: data.questionCount, target: data.targetQuestionCount, minutes: mins })}</p>
            <div className={s.grid2} style={{ marginTop: 'var(--space-3)' }}>
              <Dist title={t('cmsx.exam.byType')} map={data.balance?.byType} />
              <Dist title={t('cmsx.exam.byDifficulty')} map={data.balance?.byDifficulty} />
              <Dist title={t('cmsx.exam.byTier')} map={data.balance?.byTier} />
              <Dist title={t('cmsx.exam.correctLabels')} map={data.balance?.correctLabelCounts} />
            </div>
          </Card>
          {!data.complete && <Banner tone="warning" title={t('cmsx.exam.incomplete')}>{(data.shortfalls || []).map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' · ')}</Banner>}
          <div className={s.wrap}>
            <table className={s.table}>
              <thead><tr><th>#</th><th>{t('cmsx.col.code')}</th><th>{t('cmsx.q.type')}</th><th>{t('cmsx.q.difficulty')}</th><th>{t('cmsx.col.tier')}</th><th>{t('cmsx.q.stem')}</th></tr></thead>
              <tbody>
                {data.questions.map((q) => (
                  <tr key={q.position}>
                    <td className="tnum">{q.position}</td>
                    <td className="tnum"><Link className={s.link} to={path(Routes.cmsItem, { code: q.questionItemCode })}>{q.questionItemCode}</Link></td>
                    <td>{q.questionTypeKey}</td><td className="tnum">{q.difficulty}</td><td>{t(`enums.access_tier.${q.accessTier}`, { defaultValue: q.accessTier })}</td><td>{q.stem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
