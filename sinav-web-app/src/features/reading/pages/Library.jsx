import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowLeft, ChevronRight, FileText, Hourglass, Plus, ScanLine } from 'lucide-react';
import classNames from 'classnames';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import Routes, { path } from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Chip from '@components/Chip/Chip';
import Button from '@components/Button/Button';
import IconButton from '@components/IconButton/IconButton';
import Segmented from '@components/Segmented/Segmented';
import ProgressBar from '@components/ProgressBar/ProgressBar';
import EmptyState from '@components/EmptyState/EmptyState';
import ErrorState from '@components/ErrorState/ErrorState';
import Skeleton from '@components/Skeleton/Skeleton';
import BookCover from '../components/BookCover';
import UploadModal from '../components/UploadModal';
import { durationLabel, isBusy, readingKeys } from '../hooks/readingKeys';
import styles from '../components/Reading.module.scss';

const LEVELS = ['A2', 'B1', 'B2', 'C1'];
const TOPICS = ['story', 'classic', 'academic', 'health', 'science', 'social'];

export function BookTile({ book }) {
  const { t } = useTranslation();
  return (
    <Link to={path(Routes.book, { code: book.code })} className={styles.book}>
      <BookCover book={book} />
      <span className={`t-title ${styles.clamp2}`}>{book.title}</span>
      {book.author && <span className={`t-caption muted ${styles.clamp1}`}>{book.author}</span>}
      <span className={styles.bookMeta}>
        {book.level && <Chip size="sm" tone="accent">{book.level}</Chip>}
        <span className="t-caption muted">{durationLabel(t, book.readingMinutes)}</span>
      </span>
      {book.progress && <ProgressBar value={book.progress.percent} size="sm" label={t('read.reader.percent', { n: Math.round(book.progress.percent) })} />}
    </Link>
  );
}

function ContinueTile({ book }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const percent = Math.round(book.progress?.percent || 0);
  return (
    <Card>
      <div className={styles.continueCard}>
        <BookCover book={book} />
        <div className={styles.continueBody}>
          <span className={`t-title ${styles.clamp2}`}>{book.title}</span>
          <span className="t-body-s muted">{t('read.continue.line', { section: (book.progress?.sectionPosition || 0) + 1, percent })}</span>
          <ProgressBar value={percent} size="sm" label={t('read.reader.percent', { n: percent })} />
          <div className="row"><Button size="sm" variant="secondary" onClick={() => nav(path(Routes.reader, { code: book.code }))}>{t('read.continue.cta')}</Button></div>
        </div>
      </div>
    </Card>
  );
}

function UploadRow({ book }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const go = () => nav(path(Routes.book, { code: book.code }));
  const ocr = book.status === 'ocr_queued' || book.status === 'ocr_running';
  let icon = <FileText size={22} aria-hidden />;
  let iconClass;
  let line = [t('read.meta.pages', { n: book.pageCount }), book.progress ? t('read.meta.percent', { n: Math.round(book.progress.percent) }) : null].filter(Boolean).join(' · ');
  if (book.status === 'processing') { icon = <Hourglass size={22} aria-hidden />; line = t('read.status.processing'); }
  if (ocr) { icon = <Hourglass size={22} aria-hidden />; line = book.status === 'ocr_queued' ? t('read.status.ocrQueued') : t('read.status.ocr', { done: book.ocr.done, total: book.ocr.total }); }
  if (book.status === 'scanned') { icon = <ScanLine size={22} aria-hidden />; iconClass = styles.rowIconWarn; }
  if (book.status === 'failed') { icon = <AlertCircle size={22} aria-hidden />; iconClass = styles.rowIconDanger; line = t(`apiErrors.${book.errorCode || 'READING_PDF_INVALID'}`); }
  return (
    <button type="button" className={styles.row} onClick={go}>
      <span className={classNames(styles.rowIcon, iconClass)}>{icon}</span>
      <span className={styles.rowBody}>
        <span className={`t-title ${styles.clamp1}`}>{book.title}</span>
        {book.status === 'scanned'
          ? <span className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}><span className={styles.tag}>{t('read.status.scanned')}</span><span className="t-caption muted">{t('read.status.scannedHint')}</span></span>
          : <span className={classNames('t-body-s', book.status === 'failed' ? styles.rowDanger : 'muted')}>{line}</span>}
        {ocr && book.ocr.total > 0 && <ProgressBar value={(book.ocr.done / book.ocr.total) * 100} size="sm" label={line} />}
      </span>
      <ChevronRight size={18} className="muted" aria-hidden />
    </button>
  );
}

function Mine({ lib, onUpload, onDiscover }) {
  const { t } = useTranslation();
  const { continue: cont, personal, quota } = lib;
  if (!cont.length && !personal.length) {
    return <EmptyState title={t('read.mine.emptyTitle')} body={t('read.mine.emptyBody')} action={<Button variant="secondary" onClick={onDiscover}>{t('read.mine.discoverCta')}</Button>} />;
  }
  return (
    <div className="stack">
      {cont.length > 0 && (
        <section className="stack-sm" aria-labelledby="cont-h">
          <h2 id="cont-h" className="t-heading-2">{t('read.continue.title')}</h2>
          <div className={styles.continueRow}>{cont.map((b) => <ContinueTile key={b.code} book={b} />)}</div>
        </section>
      )}
      <section className="stack-sm" aria-labelledby="up-h">
        <div className={styles.sectionHead}>
          <h2 id="up-h" className="t-heading-2">{t('read.uploads.title')}</h2>
          <Chip size="sm" tone="accent">{t('read.uploads.quota', { used: quota.books.used, limit: quota.books.limit })}</Chip>
        </div>
        {personal.length
          ? <div className={styles.rows}>{personal.map((b) => <UploadRow key={b.code} book={b} />)}</div>
          : <Card><div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}><p className="t-body-s muted">{t('read.uploads.empty')}</p><Button size="sm" variant="secondary" onClick={onUpload}>{t('read.upload.cta')}</Button></div></Card>}
      </section>
    </div>
  );
}

function Discover() {
  const { t } = useTranslation();
  const [level, setLevel] = useState(null);
  const [topic, setTopic] = useState(null);
  const params = useMemo(() => ({ ...(level ? { level } : {}), ...(topic ? { topic } : {}), pageSize: 60 }), [level, topic]);
  const q = useApiQuery(readingKeys.catalog(params), () => api.contentReadingCatalog(params));
  return (
    <div className="stack">
      <div className="stack-sm">
        <div className={styles.chips}>
          <Chip selected={!level} onClick={() => setLevel(null)}>{t('read.discover.all')}</Chip>
          {LEVELS.map((l) => <Chip key={l} selected={level === l} onClick={() => setLevel(level === l ? null : l)}>{l}</Chip>)}
        </div>
        <div className={styles.chips}>
          {TOPICS.map((x) => <Chip key={x} size="sm" selected={topic === x} onClick={() => setTopic(topic === x ? null : x)}>{t(`enums.book_topic.${x}`)}</Chip>)}
        </div>
      </div>
      {q.isLoading ? <div className={styles.grid}>{Array.from({ length: 6 }, (_x, i) => <Skeleton key={i} height={220} />)}</div>
        : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} />
          : q.data.items.length === 0 ? <EmptyState title={t('read.discover.empty')} />
            : <div className={styles.grid}>{q.data.items.map((b) => <BookTile key={b.code} book={b} />)}</div>}
    </div>
  );
}

// READ-02/03: Kitaplık. Kitaplarım (devam edenler, yüklenenler) + Keşfet (hazır kitaplar).
export default function Library() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [upload, setUpload] = useState(false);
  const lib = useApiQuery(readingKeys.library, () => api.contentReadingLibrary(), {
    refetchInterval: (query) => (query.state.data?.personal?.some(isBusy) ? 4000 : false),
  });
  const hasOwn = lib.data && (lib.data.continue.length > 0 || lib.data.personal.length > 0);
  const tab = sp.get('sekme') || (lib.data && !hasOwn ? 'discover' : 'mine');
  const setTab = (v) => setSp(v === 'mine' ? { sekme: 'mine' } : { sekme: v }, { replace: true });
  return (
    <div className="stack" style={{ maxWidth: 1120 }}>
      <PageHeader
        back={<IconButton label={t('common.back')} onClick={() => nav(Routes.study)}><ArrowLeft size={20} /></IconButton>}
        title={t('read.library.title')} subtitle={t('read.library.subtitle')}
        actions={<Button startIcon={<Plus size={16} />} onClick={() => setUpload(true)}>{t('read.upload.cta')}</Button>}
      />
      <div style={{ maxWidth: 360 }}><Segmented fullWidth label={t('read.library.title')} value={tab} onChange={setTab} options={[{ value: 'mine', label: t('read.tab.mine') }, { value: 'discover', label: t('read.tab.discover') }]} /></div>
      {tab === 'discover' ? <Discover />
        : lib.isLoading ? <div className="stack"><Skeleton height={140} /><Skeleton height={220} /></div>
          : lib.isError ? <ErrorState error={lib.error} onRetry={lib.refetch} />
            : <Mine lib={lib.data} onUpload={() => setUpload(true)} onDiscover={() => setTab('discover')} />}
      <UploadModal open={upload} onClose={() => setUpload(false)} quota={lib.data?.quota} />
    </div>
  );
}
