import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import classNames from 'classnames';
import { Calendar } from 'lucide-react';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import Button from '@components/Button/Button';
import Banner from '@components/Banner/Banner';
import Segmented from '@components/Segmented/Segmented';
import Skeleton from '@components/Skeleton/Skeleton';
import ErrorState from '@components/ErrorState/ErrorState';
import EmptyState from '@components/EmptyState/EmptyState';
import Routes from '@shared/constant/route-paths';
import { ensureSession } from '@shared/auth/session';
import { useOnboardingStore } from '@store/onboardingStore';
import OnbShell from '../components/OnbShell';
import o from '../components/Onb.module.scss';

const FALLBACK_TRACK = 'yds-en';

// ONB-01: sınav seçimi. Veri: GET /public/exams. Seçim onboardingStore'da kalır.
export default function ExamSelect() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { trackKey, requestedTrackKey, patch } = useOnboardingStore();
  // Doğrudan bağlantıyla gelene misafir oturumu aç.
  useEffect(() => { ensureSession().catch(() => {}); }, []);
  const { data, isLoading, error, refetch } = useApiQuery(['content', 'public', 'exams'], () => api.contentPublicExamsList());
  const exams = data?.items || [];

  const select = (track) => {
    if (track.status === 'coming_soon') patch({ requestedTrackKey: track.key, trackKey: FALLBACK_TRACK, targetScore: null });
    else patch({ requestedTrackKey: null, trackKey: track.key, targetScore: null });
  };
  const activeExamKey = (e) => e.tracks.some((tr) => tr.key === (requestedTrackKey || trackKey));
  const comingSoon = exams.flatMap((e) => e.tracks).find((tr) => tr.key === requestedTrackKey);

  return (
    <OnbShell step="exam" title={t('onb.exam.title')} subtitle={t('onb.exam.subtitle')} footer={<Button size="lg" disabled={!trackKey} onClick={() => nav(Routes.onbGoal)}>{t('common.continue')}</Button>}>
      {isLoading && <Skeleton height={160} />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {!isLoading && !error && exams.length === 0 && <EmptyState title={t('onb.exam.empty')} />}
      <div className={o.grid}>
        {exams.map((e) => {
          const soon = e.status === 'coming_soon';
          const selected = activeExamKey(e);
          const sel = (requestedTrackKey || trackKey);
          const fallbackExam = soon && selected;
          return (
            <div key={e.key} className={classNames(o.choice, selected && o.on)} role="group" aria-label={e.shortName}>
              <div className={o.head}>
                <h2 className="t-heading-2">{e.shortName}</h2>
                {soon && <span className={o.tag}>{t('onb.exam.soon')}</span>}
              </div>
              <p className="t-body-m muted">{e.name}</p>
              {e.description && <p className="t-body-s muted">{e.description}</p>}
              {e.nextSession && (
                <p className="t-caption muted row"><Calendar size={14} aria-hidden /> {e.nextSession.name} · {dayjs(e.nextSession.examDate).format('D MMMM YYYY')}{e.nextSession.isEstimated ? ` (${t('onb.exam.estimated')})` : ''}</p>
              )}
              {e.tracks.length > 1 ? (
                <Segmented
                  label={e.shortName}
                  fullWidth
                  value={e.tracks.some((tr) => tr.key === sel) ? sel : null}
                  onChange={(v) => select(e.tracks.find((tr) => tr.key === v))}
                  options={e.tracks.map((tr) => ({ value: tr.key, label: tr.name }))}
                />
              ) : null}
              {e.tracks.length === 1 || !e.tracks.some((tr) => tr.key === sel) ? (
                <Button variant={selected ? 'primary' : 'secondary'} onClick={() => select(e.tracks.find((tr) => tr.isDefault) || e.tracks[0])}>
                  {selected ? t('onb.exam.selected') : t('onb.exam.select')}
                </Button>
              ) : null}
              {fallbackExam && comingSoon?.notice && <Banner tone="warning">{comingSoon.notice}. {t('onb.exam.fallback')}</Banner>}
            </div>
          );
        })}
      </div>
    </OnbShell>
  );
}
