import { lazy } from 'react';
import Routes from '@shared/constant/route-paths';

const Library = lazy(() => import('./pages/Library'));
const BookDetail = lazy(() => import('./pages/BookDetail'));
const Reader = lazy(() => import('./pages/Reader'));
const PdfPage = lazy(() => import('./pages/PdfPage'));
const PdfEmbed = lazy(() => import('./pages/PdfEmbed'));

export default [
  { path: Routes.library, element: <Library />, layout: 'app', access: 'learner' },
  { path: Routes.book, element: <BookDetail />, layout: 'app', access: 'learner' },
  { path: Routes.reader, element: <Reader />, layout: 'focus', access: 'learner' },
  { path: Routes.readerPdf, element: <PdfPage />, layout: 'focus', access: 'learner' },
  // Mobil WebView'ın açtığı sade görüntüleyici; dosya süreli imzalı bağlantıyla gelir, oturum istemez.
  { path: Routes.pdfEmbed, element: <PdfEmbed />, layout: 'bare', access: 'public' },
];
