import { useCallback, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BookOpen } from 'lucide-react';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import Routes, { path } from '@shared/constant/route-paths';
import Button from '@components/Button/Button';
import IconButton from '@components/IconButton/IconButton';
import ErrorState from '@components/ErrorState/ErrorState';
import Skeleton from '@components/Skeleton/Skeleton';
import PdfViewer from '../components/PdfViewer';
import { readingKeys } from '../hooks/readingKeys';
import styles from '../components/Reading.module.scss';

// READ-08: orijinal PDF. Okuma modu aynı sayfanın metnine götürür (hazırsa).
export default function PdfPage() {
  const { code } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const start = Number(sp.get('sayfa')) || 1;
  const [cur, setCur] = useState({ page: start, total: 0 });
  const bookQ = useApiQuery(readingKeys.book(code), () => api.contentReadingBookGet(code));
  const urlQ = useApiQuery(['content', 'reading', 'fileUrl', code], () => api.contentReadingFileUrl(code), { staleTime: 10 * 60 * 1000, gcTime: 10 * 60 * 1000, refetchOnWindowFocus: false });
  const onPage = useCallback((page, total) => setCur({ page, total }), []);
  const book = bookQ.data;
  const toReading = () => {
    const s = book?.sections?.find((x) => x.pageStart && x.pageStart <= cur.page && (x.pageEnd ?? x.pageStart) >= cur.page);
    nav(`${path(Routes.reader, { code })}${s ? `?bolum=${s.position}` : ''}`);
  };
  if (urlQ.isError) return <div style={{ padding: 'var(--space-6)' }}><ErrorState error={urlQ.error} onRetry={urlQ.refetch} /></div>;
  return (
    <div className={styles.pdfRoot}>
      <header className={styles.topBar}>
        <IconButton label={t('read.reader.back')} onClick={() => nav(path(Routes.book, { code }))}><ArrowLeft size={20} /></IconButton>
        <div className={styles.topTitle}>
          <span className={`t-title ${styles.clamp1}`}>{book?.title || ''}</span>
          {cur.total > 0 && <span className="t-caption muted tnum">{t('read.pdf.pageOf', { n: cur.page, total: cur.total })}</span>}
        </div>
        {book?.status === 'ready' && <Button size="sm" variant="secondary" startIcon={<BookOpen size={16} />} onClick={toReading}>{t('read.pdf.readingMode')}</Button>}
      </header>
      {urlQ.data ? <PdfViewer url={urlQ.data.url} startPage={start} onPage={onPage} /> : <div style={{ padding: 'var(--space-6)' }}><Skeleton height={480} /></div>}
    </div>
  );
}
