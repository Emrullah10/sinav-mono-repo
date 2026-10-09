import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@api';
import useApiMutation from '@hooks/useApiMutation';
import Routes, { path } from '@shared/constant/route-paths';
import Button from '@components/Button/Button';
import EmptyState from '@components/EmptyState/EmptyState';
import ErrorState from '@components/ErrorState/ErrorState';
import BubbleLoader from '@components/BubbleLoader/BubbleLoader';
import styles from './Session.module.scss';

// STUDY-18: POST /mistake-reviews → error_review oturumu (oturum ekranı ortak).
export default function MistakeReview() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const start = useApiMutation(() => api.learningMistakeReviewStart({}), {
    onSuccess: (r) => { if (!r.empty) nav(path(Routes.session, { code: r.code }), { replace: true }); },
    onError: () => {},
  });
  useEffect(() => { start.mutate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (start.isError) return <div className={styles.center}><ErrorState error={start.error} onRetry={() => start.mutate()} /><Button variant="tertiary" onClick={() => nav(Routes.mistakes)}>{t('common.back')}</Button></div>;
  if (start.data?.empty) return <div className={styles.center}><EmptyState title={t('study.mistakes.reviewEmpty')} body={t('study.mistakes.reviewEmptyBody')} action={<Button onClick={() => nav(Routes.mistakes)}>{t('study.mistakes.backToList')}</Button>} /></div>;
  return <BubbleLoader fullscreen label={t('study.mistakes.starting')} />;
}
