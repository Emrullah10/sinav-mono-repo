import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import Button from '@components/Button/Button';
import IconButton from '@components/IconButton/IconButton';
import BubbleLoader from '@components/BubbleLoader/BubbleLoader';
import styles from './Reading.module.scss';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const ZOOMS = [0.75, 1, 1.25, 1.5, 2];

/**
 * Orijinal PDF: sayfalar görünür oldukça çizilir, uzaklaşınca bellekten atılır. Dosya parça parça gelir (Range).
 * url: süreli bağlantı. onPage(sayfa, toplam). startPage: açılışta gidilecek sayfa. Web sayfası ve mobil WebView aynı bileşeni kullanır.
 */
export default function PdfViewer({ url, startPage = 1, onPage, onError, toolbar = true }) {
  const { t } = useTranslation();
  const wrap = useRef(null);
  const [doc, setDoc] = useState(null);
  const [size, setSize] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const onPageRef = useRef(onPage);
  useEffect(() => { onPageRef.current = onPage; }, [onPage]);

  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;
    setFailed(false);
    setDoc(null);
    const task = pdfjs.getDocument({ url, rangeChunkSize: 1024 * 1024, disableAutoFetch: true, disableStream: true, isEvalSupported: false });
    task.promise.then(async (d) => {
      if (cancelled) return;
      const first = await d.getPage(1);
      const vp = first.getViewport({ scale: 1 });
      if (cancelled) return;
      setSize({ w: vp.width, h: vp.height });
      setDoc(d);
    }).catch((e) => {
      if (cancelled) return;
      setFailed(true);
      onError?.(e);
    });
    return () => { cancelled = true; task.destroy().catch(() => {}); };
  }, [url, attempt, onError]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const canvasFor = useRef(new Map());
  const pageW = Math.max(200, Math.min(width - 32, 900)) * zoom;
  const scale = size ? pageW / size.w : 1;

  const draw = useCallback(async (n) => {
    if (!doc || canvasFor.current.has(n)) return;
    const host = wrap.current?.querySelector(`[data-page="${n}"]`);
    if (!host) return;
    const canvas = document.createElement('canvas');
    canvasFor.current.set(n, canvas);
    try {
      const page = await doc.getPage(n);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = page.getViewport({ scale: scale * dpr });
      canvas.width = vp.width;
      canvas.height = vp.height;
      await page.render({ canvas, viewport: vp }).promise;
      if (canvasFor.current.get(n) === canvas) host.replaceChildren(canvas);
      page.cleanup();
    } catch { canvasFor.current.delete(n); }
  }, [doc, scale]);
  const erase = useCallback((n) => {
    const host = wrap.current?.querySelector(`[data-page="${n}"]`);
    host?.replaceChildren();
    const c = canvasFor.current.get(n);
    if (c) { c.width = 0; c.height = 0; }
    canvasFor.current.delete(n);
  }, []);

  // Görünür sayfalar çizilir; ekrandan iki ekran uzaklaşanlar silinir. Üst kenara en yakın sayfa o anki sayfadır.
  useEffect(() => {
    if (!doc || !width) return undefined;
    canvasFor.current.forEach((_c, n) => erase(n));
    const seen = new Set();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const n = Number(e.target.dataset.page);
        if (e.isIntersecting) { seen.add(n); draw(n); } else { seen.delete(n); erase(n); }
      }
      if (seen.size) {
        const near = [...seen].sort((a, b) => a - b);
        const center = wrap.current.getBoundingClientRect().top + 80;
        const cur = near.find((n) => wrap.current.querySelector(`[data-page="${n}"]`).getBoundingClientRect().bottom > center) ?? near[0];
        onPageRef.current?.(cur, doc.numPages);
      }
    }, { root: wrap.current, rootMargin: '150% 0px' });
    wrap.current.querySelectorAll('[data-page]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [doc, width, scale, draw, erase]);

  const jumped = useRef(false);
  useEffect(() => {
    if (!doc || !width || jumped.current) return;
    jumped.current = true;
    if (startPage > 1) wrap.current?.querySelector(`[data-page="${Math.min(startPage, doc.numPages)}"]`)?.scrollIntoView({ block: 'start' });
    onPageRef.current?.(Math.min(startPage, doc.numPages), doc.numPages);
  }, [doc, width, startPage]);

  if (failed) {
    return (
      <div className={styles.center}>
        <p className="t-body-m">{t('read.pdf.error')}</p>
        <Button variant="secondary" size="sm" onClick={() => setAttempt((a) => a + 1)}>{t('read.pdf.retry')}</Button>
      </div>
    );
  }
  const step = (dir) => {
    const i = ZOOMS.indexOf(zoom) + dir;
    if (i >= 0 && i < ZOOMS.length) setZoom(ZOOMS[i]);
  };
  return (
    <>
      {toolbar && doc && (
        <div className={styles.pdfTools} style={{ justifyContent: 'center', padding: 'var(--space-2)' }}>
          <IconButton label={t('read.pdf.zoomOut')} disabled={zoom === ZOOMS[0]} onClick={() => step(-1)}><Minus size={18} /></IconButton>
          <span className="t-caption tnum muted">{`%${Math.round(zoom * 100)}`}</span>
          <IconButton label={t('read.pdf.zoomIn')} disabled={zoom === ZOOMS[ZOOMS.length - 1]} onClick={() => step(1)}><Plus size={18} /></IconButton>
        </div>
      )}
      <div ref={wrap} className={styles.pdfWrap} tabIndex={0} aria-label={t('read.reader.original')}>
        {!doc && <div className={styles.center}><BubbleLoader /><p className="t-body-s muted">{t('read.pdf.loading')}</p></div>}
        {doc && size && Array.from({ length: doc.numPages }, (_x, i) => (
          <div key={i} data-page={i + 1} className={styles.pdfPage} style={{ width: pageW, height: pageW * (size.h / size.w), flex: 'none' }} />
        ))}
      </div>
    </>
  );
}
