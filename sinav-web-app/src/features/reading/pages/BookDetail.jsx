import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BookOpen, Check, FileText, Pencil, ScanLine, Trash2 } from 'lucide-react';
import classNames from 'classnames';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import { queryClient } from '@shared/providers/QueryProvider';
import { notify } from '@shared/utils/notify';
import Routes, { path } from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import Chip from '@components/Chip/Chip';
import Button from '@components/Button/Button';
import Banner from '@components/Banner/Banner';
import IconButton from '@components/IconButton/IconButton';
import Modal from '@components/Modal/Modal';
import TextInput from '@components/TextInput/TextInput';
import ProgressBar from '@components/ProgressBar/ProgressBar';
import ErrorState from '@components/ErrorState/ErrorState';
import Skeleton from '@components/Skeleton/Skeleton';
import BookCover from '../components/BookCover';
import { durationLabel, isBusy, readingKeys, sectionTitle } from '../hooks/readingKeys';
import styles from '../components/Reading.module.scss';
import { formatNumber } from '@shared/utils/locale';

function OcrPanel({ book, quota, onChange }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const start = useApiMutation(() => api.contentReadingOcrStart(book.code), {
    successMessage: 'read.ocr.started',
    onSuccess: () => { onChange(); },
  });
  const left = quota ? Math.max(0, quota.ocrPages.limit - quota.ocrPages.used) : 0;
  const pages = book.ocr.textlessPages;
  const premium = quota?.tier === 'premium';
  const enough = left >= pages;
  return (
    <div className="stack-sm">
      <Banner tone="warning" title={t('read.ocr.title')}>{t('read.ocr.body')}</Banner>
      {book.errorCode && <Banner tone="danger">{t(`apiErrors.${book.errorCode}`)}</Banner>}
      {!premium ? <p className="t-body-s muted">{t('read.ocr.premium')}</p>
        : !enough ? <p className="t-body-s muted">{t('read.ocr.notEnough', { left, pages })}</p>
          : <p className={`t-body-s ${styles.infoBox}`}>{t('read.ocr.info', { pages, left })}</p>}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {!premium ? <Button onClick={() => nav(Routes.premium)}>{t('read.detail.upgrade')}</Button>
          : <Button startIcon={<ScanLine size={16} />} disabled={!enough} loading={start.isPending} onClick={() => start.mutate()}>{t('read.ocr.cta')}</Button>}
        {book.hasFile && <Button variant="secondary" startIcon={<FileText size={16} />} onClick={() => nav(path(Routes.readerPdf, { code: book.code }))}>{t('read.ocr.later')}</Button>}
      </div>
    </div>
  );
}

// READ-04: kitap ayrıntısı. Kişisel kitapta işleniyor / taranmış / hata durumları burada anlatılır.
export default function BookDetail() {
  const { code } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const q = useApiQuery(readingKeys.book(code), () => api.contentReadingBookGet(code), { refetchInterval: (query) => (isBusy(query.state.data) ? 4000 : false) });
  const lib = useApiQuery(readingKeys.library, () => api.contentReadingLibrary());
  const [rename, setRename] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: readingKeys.book(code) });
    queryClient.invalidateQueries({ queryKey: readingKeys.library });
  };
  const save = useApiMutation((b) => api.contentReadingBookUpdate(code, b), { onSuccess: () => { setRename(null); refresh(); } });
  const del = useApiMutation(() => api.contentReadingBookDelete(code), {
    onSuccess: () => { notify(t('read.detail.deleted'), 'success'); queryClient.invalidateQueries({ queryKey: readingKeys.library }); nav(Routes.library, { replace: true }); },
  });

  if (q.isLoading) return <div className="stack"><Skeleton height={48} width="40%" /><Skeleton height={320} /></div>;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const b = q.data;
  const personal = b.kind === 'personal';
  const current = b.progress?.sectionPosition ?? -1;
  const open = (position) => nav(`${path(Routes.reader, { code: b.code })}${position != null ? `?bolum=${position}` : ''}`);

  return (
    <div className="stack">
      <PageHeader
        back={<IconButton label={t('common.back')} onClick={() => nav(Routes.library)}><ArrowLeft size={20} /></IconButton>}
        title={b.title} subtitle={b.author || undefined}
        actions={personal ? (
          <>
            <IconButton label={t('read.detail.rename')} onClick={() => setRename({ title: b.title, author: b.author || '' })}><Pencil size={18} /></IconButton>
            <IconButton label={t('read.detail.delete')} onClick={() => setConfirmDelete(true)}><Trash2 size={18} /></IconButton>
          </>
        ) : undefined}
      />
      <div className={styles.detail}>
        <div className={styles.detailCover}><BookCover book={b} /></div>
        <div className="stack">
          <div className={styles.chips}>
            {b.level && <Chip size="sm" tone="accent">{b.level}</Chip>}
            {b.topic && <Chip size="sm">{t(`enums.book_topic.${b.topic}`)}</Chip>}
            {b.wordCount > 0 && <Chip size="sm">{durationLabel(t, b.readingMinutes)}</Chip>}
            {b.wordCount > 0 && <Chip size="sm">{t('read.meta.words', { n: formatNumber(b.wordCount) })}</Chip>}
            {b.pageCount > 0 && <Chip size="sm">{t('read.meta.pages', { n: b.pageCount })}</Chip>}
          </div>
          {b.description && <p className="t-body-m">{b.description}</p>}
          {b.language === 'other' && b.status === 'ready' && <Banner tone="info">{t('read.detail.otherLang')}</Banner>}

          {b.status === 'processing' && <div className="stack-sm"><ProgressBar value={35} label={t('read.status.processing')} /><p className="t-body-s muted">{t('read.detail.processingBody')}</p></div>}
          {(b.status === 'ocr_queued' || b.status === 'ocr_running') && (
            <div className="stack-sm">
              <ProgressBar value={b.ocr.total ? (b.ocr.done / b.ocr.total) * 100 : 0} label={t('read.status.ocr', { done: b.ocr.done, total: b.ocr.total })} />
              <p className="t-title">{b.status === 'ocr_queued' ? t('read.status.ocrQueued') : t('read.status.ocr', { done: b.ocr.done, total: b.ocr.total })}</p>
              <p className="t-body-s muted">{t('read.ocr.progressBody')}</p>
            </div>
          )}
          {b.status === 'failed' && <Banner tone="danger" title={t(`apiErrors.${b.errorCode || 'READING_PDF_INVALID'}`)}>{t('read.detail.failedBody')}</Banner>}
          {b.status === 'scanned' && <OcrPanel book={b} quota={lib.data?.quota} onChange={refresh} />}
          {b.locked && <Banner tone="warning" title={t('read.detail.locked')} action={<Button size="sm" onClick={() => nav(Routes.premium)}>{t('read.detail.upgrade')}</Button>} />}

          {b.status === 'ready' && !b.locked && (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <Button startIcon={<BookOpen size={16} />} onClick={() => open(null)}>{b.progress ? t('read.detail.continue') : t('read.detail.start')}</Button>
              {b.hasFile && <Button variant="secondary" startIcon={<FileText size={16} />} onClick={() => nav(path(Routes.readerPdf, { code: b.code }))}>{t('read.detail.original')}</Button>}
            </div>
          )}

          {b.status === 'ready' && b.sections.length > 0 && (
            <section className="stack-sm" aria-labelledby="toc-h">
              <h2 id="toc-h" className="t-heading-3">{t('read.detail.toc')}</h2>
              <div className={styles.toc}>
                {b.sections.map((s) => (
                  <button key={s.position} type="button" disabled={b.locked} className={classNames(styles.tocRow, s.position === current && styles.tocCurrent)} onClick={() => open(s.position)}>
                    <span className={`t-body-m ${styles.clamp1}`}>{sectionTitle(t, s)}</span>
                    {s.position < current
                      ? <span className={styles.tocDone}><Check size={14} aria-hidden />{t('read.section.read')}</span>
                      : <span className="t-caption muted" style={{ flex: 'none' }}>{durationLabel(t, Math.max(1, Math.round(s.wordCount / 180)))}</span>}
                  </button>
                ))}
              </div>
            </section>
          )}
          {b.attribution && <p className="t-caption muted">{t('read.meta.source', { source: b.attribution, license: b.license || '' })}</p>}
          {!b.attribution && b.license && <p className="t-caption muted">{b.license}</p>}
        </div>
      </div>

      <Modal open={!!rename} onClose={() => setRename(null)} title={t('read.detail.rename')} footer={<Button loading={save.isPending} disabled={!rename?.title?.trim()} onClick={() => save.mutate(rename)}>{t('read.detail.save')}</Button>}>
        <div className="stack-sm">
          <TextInput label={t('read.detail.titleLabel')} value={rename?.title || ''} onChange={(e) => setRename((r) => ({ ...r, title: e.target.value }))} maxLength={300} />
          <TextInput label={t('read.detail.authorLabel')} value={rename?.author || ''} onChange={(e) => setRename((r) => ({ ...r, author: e.target.value }))} maxLength={200} />
        </div>
      </Modal>
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title={t('read.detail.deleteTitle')} footer={(
        <>
          <Button variant="tertiary" onClick={() => setConfirmDelete(false)}>{t('read.detail.cancel')}</Button>
          <Button variant="destructive" loading={del.isPending} onClick={() => del.mutate()}>{t('read.detail.delete')}</Button>
        </>
      )}>
        <p className="t-body-m">{t('read.detail.deleteBody')}</p>
      </Modal>
    </div>
  );
}
