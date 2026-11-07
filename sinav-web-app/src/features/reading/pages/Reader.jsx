import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, Headphones, Languages, List, Type } from 'lucide-react';
import classNames from 'classnames';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import { useAuthStore, isGuestUser } from '@store/authStore';
import { queryClient } from '@shared/providers/QueryProvider';
import { notify } from '@shared/utils/notify';
import Routes, { path } from '@shared/constant/route-paths';
import Button from '@components/Button/Button';
import IconButton from '@components/IconButton/IconButton';
import Modal from '@components/Modal/Modal';
import ProgressBar from '@components/ProgressBar/ProgressBar';
import ErrorState from '@components/ErrorState/ErrorState';
import Skeleton from '@components/Skeleton/Skeleton';
import TapText from '@features/lexicon/TapText';
import { useLexicon } from '@features/lexicon/LexiconProvider';
import useHeartbeat from '@features/study/hooks/useHeartbeat';
import ParagraphTranslation from '../components/ParagraphTranslation';
import ReadAloudBar from '../components/ReadAloudBar';
import ReaderSettings from '../components/ReaderSettings';
import useReaderPrefs from '../hooks/useReaderPrefs';
import useReadAloud, { readAloudSupported } from '../hooks/useReadAloud';
import { readingKeys, sectionTitle } from '../hooks/readingKeys';
import styles from '../components/Reading.module.scss';

const SAVE_EVERY_MS = 4000;

const Block = memo(function Block({ block, index, lang, bookCode, speaking }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (block.t === 'h') return <h2 className={styles.heading} data-block={index} lang="en"><TapText text={block.x} lang={lang} bookCode={bookCode} speaking={speaking} /></h2>;
  return (
    <div className={styles.block} data-block={index}>
      <p className={styles.para} lang={lang === 'en' ? 'en' : undefined}><TapText text={block.x} lang={lang} bookCode={bookCode} speaking={speaking} /></p>
      {open
        ? <ParagraphTranslation text={block.x} lang={lang} bookCode={bookCode} onClose={() => setOpen(false)} />
        : <button type="button" className={styles.trBtn} onClick={() => setOpen(true)}><Languages size={14} aria-hidden />{t('read.reader.translate')}</button>}
    </div>
  );
});

function Toc({ book, position, onPick }) {
  const { t } = useTranslation();
  return (
    <div className={styles.toc}>
      {book.sections.map((s) => (
        <button key={s.position} type="button" aria-current={s.position === position ? 'true' : undefined} className={classNames(styles.tocRow, s.position === position && styles.tocCurrent)} onClick={() => onPick(s.position)}>
          <span className={`t-body-s ${styles.clamp2}`}>{sectionTitle(t, s)}</span>
        </button>
      ))}
    </div>
  );
}

// READ-06/07: okuyucu. Kelimeye dokun → sözlük, cümleye basılı tut → çeviri, paragraf altında Türkçesi. Kaldığı yer sunucuda (cihazlar arası).
export default function Reader() {
  const { code } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const { prefs, update, style } = useReaderPrefs();
  const [tocOpen, setTocOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const bookQ = useApiQuery(readingKeys.book(code), () => api.contentReadingBookGet(code));
  const book = bookQ.data;
  useHeartbeat(null, Boolean(book));

  const asked = sp.get('bolum');
  const position = asked !== null ? Number(asked) : (book?.progress?.sectionPosition ?? 0);
  const sectionQ = useQuery({
    queryKey: readingKeys.section(code, position),
    queryFn: async () => (await api.contentReadingSectionGet(code, position)).data.data,
    enabled: Boolean(book) && book.status === 'ready' && !book.locked,
    staleTime: Infinity,
  });
  const section = sectionQ.data;
  const lang = book?.language === 'en' ? 'en' : 'auto';
  const bodyRef = useRef(null);
  const [visible, setVisible] = useState(0);

  const totals = useMemo(() => {
    const list = book?.sections || [];
    const total = list.reduce((n, s) => n + s.wordCount, 0) || 1;
    const before = list.filter((s) => s.position < position).reduce((n, s) => n + s.wordCount, 0);
    return { total, before, cur: list.find((s) => s.position === position) };
  }, [book, position]);
  const blockCount = section?.blocks?.length || 1;
  const percent = Math.min(100, ((totals.before + (totals.cur?.wordCount || 0) * (visible / blockCount)) / totals.total) * 100);

  // Kaldığı yere dön: bölüm ilk açıldığında, kitaptan gelen blok konumuna kaydır.
  const restored = useRef(null);
  useEffect(() => {
    if (!section || restored.current === position) return;
    restored.current = position;
    const target = asked === null && book?.progress?.sectionPosition === position ? book.progress.blockIndex : 0;
    setVisible(target);
    requestAnimationFrame(() => {
      if (target > 0) bodyRef.current?.querySelector(`[data-block="${target}"]`)?.scrollIntoView({ block: 'start' });
      else window.scrollTo({ top: 0 });
    });
  }, [section, position, asked, book]);

  // Görünen ilk blok kaldığı yerdir.
  useEffect(() => {
    if (!section || !bodyRef.current) return undefined;
    const seen = new Set();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const i = Number(e.target.dataset.block);
        if (e.isIntersecting) seen.add(i); else seen.delete(i);
      }
      if (seen.size) setVisible(Math.min(...seen));
    }, { rootMargin: '-80px 0px -40% 0px' });
    bodyRef.current.querySelectorAll('[data-block]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [section]);

  const latest = useRef(null);
  useEffect(() => {
    latest.current = book && section ? { sectionPosition: position, blockIndex: visible, pageNo: section.blocks?.[visible]?.pg ?? null, percent: Math.round(percent * 100) / 100 } : null;
  }, [book, section, position, visible, percent]);
  const lastSaved = useRef('');
  const save = useCallback((force) => {
    const body = latest.current;
    if (!body) return;
    const key = JSON.stringify(body);
    if (!force && key === lastSaved.current) return;
    lastSaved.current = key;
    api.contentReadingProgressSave(code, body).then(() => queryClient.invalidateQueries({ queryKey: readingKeys.library })).catch(() => {});
  }, [code]);
  useEffect(() => {
    const id = setInterval(() => save(false), SAVE_EVERY_MS);
    const onHide = () => document.visibilityState === 'hidden' && save(false);
    document.addEventListener('visibilitychange', onHide);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onHide); save(false); };
  }, [save]);

  // Sesli okuma (abonelik): tarayıcının konuşma motoru. Bölüm bitince sonraki bölüme geçip sürer.
  const guest = useAuthStore((s) => isGuestUser(s.user));
  const entQ = useApiQuery(['pay', 'entitlements'], () => api.billingEntitlementsGet(), { enabled: !guest, meta: { suppressGlobalErrorNotification: true } });
  const canListen = Boolean(entQ.data?.features?.read_aloud?.enabled);
  const continueNext = useRef(false);
  const onAloudEnd = useCallback(() => {
    const list = book?.sections || [];
    const at = list.findIndex((s) => s.position === position);
    const n = at >= 0 ? list[at + 1] : null;
    if (!n) return;
    save(false);
    continueNext.current = true;
    setVisible(0);
    setSp({ bolum: String(n.position) }, { replace: false });
  }, [book, position, save, setSp]);
  const aloud = useReadAloud({ blocks: section?.blocks, lang, onEnd: onAloudEnd });
  const lex = useLexicon();
  // Sözlük/çeviri açılınca okuma duraklar.
  useEffect(() => {
    if (lex?.active && aloud.status === 'playing') aloud.pause();
  }, [lex?.active]); // eslint-disable-line react-hooks/exhaustive-deps
  // Yeni bölüm yüklendi ve önceki bölüm sesli okunarak bittiyse baştan sürer.
  useEffect(() => {
    if (!section || !continueNext.current) return;
    continueNext.current = false;
    aloud.playFrom(0);
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps
  // Okunan blok ekranda kalsın.
  const speakingBlock = aloud.current?.block ?? null;
  useEffect(() => {
    if (speakingBlock == null || aloud.status !== 'playing') return;
    bodyRef.current?.querySelector(`[data-block="${speakingBlock}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [speakingBlock]); // eslint-disable-line react-hooks/exhaustive-deps
  const listen = () => {
    if (!readAloudSupported()) { notify(t('read.aloud.unsupported'), 'warning'); return; }
    if (!canListen) { notify(t('read.aloud.locked'), 'info'); nav(Routes.premium); return; }
    if (aloud.status === 'idle') aloud.playFrom(visible);
    else aloud.toggle();
  };

  const goSection = (n) => {
    save(false);
    setTocOpen(false);
    aloud.stop();
    setVisible(0);
    setSp({ bolum: String(n) }, { replace: false });
  };
  const finish = async () => {
    await api.contentReadingProgressSave(code, { sectionPosition: position, blockIndex: visible, percent: 100 }).catch(() => {});
    lastSaved.current = '';
    latest.current = null;
    queryClient.invalidateQueries({ queryKey: readingKeys.library });
    queryClient.invalidateQueries({ queryKey: readingKeys.book(code) });
    notify(t('read.reader.finished'), 'success');
    nav(path(Routes.book, { code }));
  };

  if (bookQ.isLoading) return <div className="stack" style={{ padding: 'var(--space-6)' }}><Skeleton height={48} /><Skeleton height={320} /></div>;
  if (bookQ.isError) return <div style={{ padding: 'var(--space-6)' }}><ErrorState error={bookQ.error} onRetry={bookQ.refetch} /></div>;
  if (book.status !== 'ready' || book.locked) return <Navigate to={path(Routes.book, { code })} replace />;
  const pos = book.sections.findIndex((s) => s.position === position);
  const prev = book.sections[pos - 1];
  const next = book.sections[pos + 1];
  const title = sectionTitle(t, totals.cur || section);

  return (
    <div className={styles.reader}>
      <header className={styles.topBar}>
        <IconButton label={t('read.reader.back')} onClick={() => nav(path(Routes.book, { code }))}><ArrowLeft size={20} /></IconButton>
        <div className={styles.topTitle}>
          <span className={`t-title ${styles.clamp1}`}>{book.title}</span>
          <span className={`t-caption muted ${styles.clamp1}`}>{title}</span>
        </div>
        <div className={styles.topProgress}><ProgressBar value={percent} size="sm" label={t('read.reader.percent', { n: Math.round(percent) })} /></div>
        <span className="t-caption muted tnum">{t('read.meta.percent', { n: Math.round(percent) })}</span>
        <IconButton tone={aloud.status === 'idle' ? 'plain' : 'tonal'} label={t('read.aloud.listen')} onClick={listen}><Headphones size={20} /></IconButton>
        <span className={styles.tocHint}><IconButton label={t('read.reader.toc')} onClick={() => setTocOpen(true)}><List size={20} /></IconButton></span>
        <IconButton label={t('read.reader.settings')} onClick={() => setSettings(true)}><Type size={20} /></IconButton>
        {book.hasFile && <IconButton label={t('read.reader.original')} onClick={() => { save(false); nav(`${path(Routes.readerPdf, { code })}${section?.blocks?.[visible]?.pg ? `?sayfa=${section.blocks[visible].pg}` : ''}`); }}><FileText size={20} /></IconButton>}
      </header>
      <div className={styles.topLine}><i style={{ width: `${percent}%` }} /></div>
      <div className={styles.readerBody}>
        <aside className={styles.tocPanel} aria-label={t('read.reader.toc')}>
          <p className="t-label-m">{t('read.reader.toc')}</p>
          <p className="t-caption muted">{t('read.reader.percent', { n: Math.round(percent) })}</p>
          <Toc book={book} position={position} onPick={goSection} />
        </aside>
        <main className={styles.page}>
          <p className="t-caption muted" style={{ marginBottom: 'var(--space-5)' }}>{t('read.reader.tip')}</p>
          {sectionQ.isLoading ? <div className="stack-sm"><Skeleton height={24} width="60%" /><Skeleton height={200} /><Skeleton height={200} /></div>
            : sectionQ.isError ? <ErrorState error={sectionQ.error} onRetry={sectionQ.refetch} /> : (
              <div style={style}>
                {section.title && section.blocks[0]?.t !== 'h' && <h1 className={styles.sectionTitle}>{section.title}</h1>}
                <div ref={bodyRef} className={styles.body}>
                  {section.blocks.map((b, i) => <Block key={`${position}.${i}`} block={b} index={i} lang={lang} bookCode={book.code} speaking={speakingBlock === i ? aloud.current.sentence : null} />)}
                </div>
              </div>
            )}
          <nav className={styles.pager} aria-label={t('read.reader.toc')}>
            {prev && <Button variant="secondary" startIcon={<ChevronLeft size={16} />} onClick={() => goSection(prev.position)}>{t('read.reader.prev')}</Button>}
            {next
              ? <Button className={styles.pagerNext} endIcon={<ChevronRight size={16} />} onClick={() => goSection(next.position)}>{t('read.reader.next')}</Button>
              : <Button className={styles.pagerNext} onClick={finish}>{t('read.reader.finish')}</Button>}
          </nav>
        </main>
      </div>
      {aloud.status !== 'idle' && <ReadAloudBar aloud={aloud} />}
      <Modal open={tocOpen} onClose={() => setTocOpen(false)} title={t('read.reader.toc')}><Toc book={book} position={position} onPick={goSection} /></Modal>
      <ReaderSettings open={settings} onClose={() => setSettings(false)} prefs={prefs} update={update} />
    </div>
  );
}
