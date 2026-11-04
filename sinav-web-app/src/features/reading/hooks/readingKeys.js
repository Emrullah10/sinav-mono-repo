// React Query anahtarları (client-sdk queryKeys ile aynı).
export const readingKeys = {
  library: ['content', 'reading', 'library'],
  catalog: (params) => ['content', 'reading', 'catalog', params],
  book: (code) => ['content', 'reading', 'book', String(code)],
  section: (code, position) => ['content', 'reading', 'book', String(code), 'section', Number(position)],
};

/** Metni henüz hazır olmayan kişisel kitap: liste ve ayrıntı kısa aralıkla yenilenir. */
export const isBusy = (book) => ['processing', 'ocr_queued', 'ocr_running'].includes(book?.status);

export const sectionTitle = (t, s) => s?.title
  || (s?.pageStart ? t('read.section.pages', { from: s.pageStart, to: s.pageEnd ?? s.pageStart }) : t('read.section.untitled', { n: (s?.position ?? 0) + 1 }));

export const durationLabel = (t, minutes) => (minutes >= 90 ? t('read.meta.hours', { n: Math.round(minutes / 60) }) : t('read.meta.minutes', { n: minutes }));
