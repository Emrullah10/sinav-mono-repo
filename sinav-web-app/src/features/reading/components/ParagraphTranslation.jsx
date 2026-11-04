import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Languages, X } from 'lucide-react';
import { normalizeSentence, translateParagraph } from '@sinav/domain';
import api from '@api';
import { queryClient } from '@shared/providers/QueryProvider';
import { apiErrorCode, getApiErrorMessage } from '@shared/utils/apiError';
import Button from '@components/Button/Button';
import IconButton from '@components/IconButton/IconButton';
import Skeleton from '@components/Skeleton/Skeleton';
import styles from './Reading.module.scss';

const sentenceKey = (text) => ['content', 'lexiconSentence', normalizeSentence(text)];

/** Paragrafın altında açılan Türkçesi. Cümle çevirisiyle aynı uç ve aynı önbellek: basılı tutulan cümle yeniden istek atmaz. */
export default function ParagraphTranslation({ text, lang, bookCode, onClose }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['content', 'paragraphTranslation', String(bookCode), normalizeSentence(text)],
    queryFn: () => translateParagraph(text, async (sentences, index) => {
      const r = (await api.contentLexiconSentence(sentences, index, bookCode)).data.data;
      for (const x of r.translations) queryClient.setQueryData(sentenceKey(sentences[x.index]), x.text);
      return r;
    }, { lang }),
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });
  const parts = q.data || [];
  const missing = parts.some((p) => !p.translation);
  return (
    <div className={styles.trBox} aria-live="polite">
      <div className={styles.trHead}>
        <span className="row" style={{ gap: 6 }}><Languages size={14} aria-hidden />{t('read.reader.translation')}</span>
        <IconButton label={t('read.reader.hide')} onClick={onClose}><X size={16} /></IconButton>
      </div>
      {q.isPending ? <div className="stack-sm" aria-label={t('lex.translating')}><Skeleton height={14} /><Skeleton height={14} width="80%" /><Skeleton height={14} width="60%" /></div>
        : q.isError ? (
          <div className="stack-sm">
            <p>{getApiErrorMessage(q.error)}</p>
            {apiErrorCode(q.error) !== 'CONTENT_LEXICON_LIMIT' && <div className="row"><Button size="sm" variant="secondary" onClick={() => q.refetch()}>{t('lex.retry')}</Button></div>}
          </div>
        ) : (
          <>
            <p>{parts.map((p) => p.translation || p.text).join(' ')}</p>
            {missing && <p className="t-caption" style={{ marginTop: 6 }}>{t('read.reader.partial')}</p>}
          </>
        )}
    </div>
  );
}
