import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import Routes from '@shared/constant/route-paths';
import { queryClient } from '@shared/providers/QueryProvider';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import Chip from '@components/Chip/Chip';
import IconButton from '@components/IconButton/IconButton';
import ErrorState from '@components/ErrorState/ErrorState';
import Skeleton from '@components/Skeleton/Skeleton';

const List = ({ title, items }) => (items?.length > 0 ? (
  <div className="stack-sm"><p className="t-label-m">{title}</p><div className="row" style={{ flexWrap: 'wrap' }}>{items.map((x) => <Chip key={x} size="sm"><span lang="en">{x}</span></Chip>)}</div></div>
) : null);

// STUDY-15: GET /vocab/{itemCode} (content) + kart durumu (learning).
export default function VocabWord() {
  const { id } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const q = useApiQuery(['content', 'vocab', id], () => api.contentVocabGet(id));
  const cardKey = ['learning', 'vocab', 'card', id];
  const card = useApiQuery(cardKey, () => api.learningVocabCardByItemGet(id));
  const add = useApiMutation(() => api.learningVocabCardAdd(id), { successMessage: 'study.vocab.word.added', onSuccess: () => queryClient.invalidateQueries({ queryKey: cardKey }) });
  if (q.isLoading) return <Skeleton height={320} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const w = q.data.entry || q.data;
  const has = card.data?.card;
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <PageHeader back={<IconButton label={t('common.back')} onClick={() => nav(Routes.vocab)}><ArrowLeft size={20} /></IconButton>}
        eyebrow={t('study.vocab.word.title')} title={w.headword} subtitle={`${w.partOfSpeech || ''}${w.pronunciationIpa ? ` · /${w.pronunciationIpa.replace(/^\/|\/$/g, '')}/` : ''}`}
        actions={has ? <Chip tone="success">{t('study.vocab.word.hasCard')}</Chip> : <Button loading={add.isPending} onClick={() => add.mutate()}>{t('study.vocab.word.addCard')}</Button>} />
      <Card>
        <div className="stack">
          <ul style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>{(w.meanings || []).map((m, i) => <li key={i} className="t-body-l">{m.tr}{m.note && <span className="muted t-body-s"> ({m.note})</span>}</li>)}</ul>
          {w.examples?.length > 0 && <div className="stack-sm"><p className="t-label-m">{t('study.vocab.review.examples')}</p>{w.examples.map((e, i) => <div key={i}><p className="reading t-reading-m" lang="en">{e.en}</p><p className="muted t-body-s">{e.tr}</p></div>)}</div>}
          <List title={t('study.vocab.review.collocations')} items={w.collocations} />
          <List title={t('study.vocab.review.synonyms')} items={w.synonyms} />
          <List title={t('study.vocab.word.antonyms')} items={w.antonyms} />
          <List title={t('study.vocab.word.confusables')} items={w.confusables} />
          {has && <p className="t-caption muted">{t('study.vocab.word.state', { state: has.state })}</p>}
        </div>
      </Card>
    </div>
  );
}
