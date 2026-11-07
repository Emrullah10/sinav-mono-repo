import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Layers } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@sinav/client-sdk';
import api from '@api';
import Button from '@components/Button/Button';
import Routes from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import IconButton from '@components/IconButton/IconButton';
import SavedWords from '../components/SavedWords';

/** Kaydettiğin kelimelerin tam listesi (kelimeler sayfasındaki karttan "Tümünü gör"; dokun-çeviride "Kaydettiklerim"). */
export default function SavedWordsPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  // Sayı önizleme kartıyla aynı sorgudan (önbellekte): kelime yoksa "Kartlarla çalış" gösterilmez.
  const pre = useQuery({ queryKey: [...queryKeys.learning.vocabMyWords(), 'preview'], queryFn: async () => (await api.learningVocabMyWords({ limit: 6 }))?.data?.data });
  return (
    <div className="stack">
      <PageHeader
        back={<IconButton label={t('common.back')} onClick={() => nav(Routes.vocab)}><ArrowLeft size={20} /></IconButton>}
        title={t('study.vocab.saved.title')}
        subtitle={t('study.vocab.saved.body')}
        actions={pre.data?.total ? <Button startIcon={<Layers size={16} />} onClick={() => nav(`${Routes.vocabReview}?source=saved`)}>{t('study.vocab.saved.study')}</Button> : undefined}
      />
      <SavedWords />
    </div>
  );
}
