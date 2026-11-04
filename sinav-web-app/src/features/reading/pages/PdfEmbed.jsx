import { useCallback, useMemo } from 'react';
import PdfViewer from '../components/PdfViewer';
import styles from '../components/Reading.module.scss';

const post = (msg) => window.ReactNativeWebView?.postMessage(JSON.stringify(msg));

// Mobil WebView için sade görüntüleyici: /pdf-goruntule#u=<süreli yol>&p=<sayfa>. Bağlantı # içinde: sunucu loglarına ve Referer'a düşmez. Yalnız aynı kökenden yol kabul edilir.
export default function PdfEmbed() {
  const { url, page } = useMemo(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const u = h.get('u') || '';
    return { url: u.startsWith('/api/') ? u : null, page: Number(h.get('p')) || 1 };
  }, []);
  const onPage = useCallback((n, total) => post({ type: 'page', page: n, total }), []);
  const onError = useCallback(() => post({ type: 'error' }), []);
  return <div className={styles.pdfRoot}><PdfViewer url={url} startPage={page} onPage={onPage} onError={onError} /></div>;
}
