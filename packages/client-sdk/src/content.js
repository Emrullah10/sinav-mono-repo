// content servisi uçları (docs/api/content.md). `http` axios benzeri örnek. Gövde: { success, data }.
export const createContentApi = (http, { api = '/api' } = {}) => {
  const B = `${api}/sinav-service-content/v1`;
  return {
    // ── Herkese açık katalog (oturumsuz) ──
    contentPublicExamsList: () => http.get(`${B}/public/exams`),
    contentPublicTrackGet: (key) => http.get(`${B}/public/exam-tracks/${key}`),
    /** Takvime ekle: tarayıcıda açılacak .ics adresi (oturum anahtarı "2026-YDS/1" gibi eğik çizgi içerir). */
    contentPublicSessionIcsUrl: (key) => `${B}/public/exam-sessions/${encodeURIComponent(key)}.ics`,
    contentPublicFeaturedGet: (placement) => http.get(`${B}/public/featured/${placement}`),
    contentPublicArticlesList: (params) => http.get(`${B}/public/articles`, { params }),
    contentPublicArticlesSearch: (params) => http.get(`${B}/public/articles/search`, { params }),
    contentPublicArticleGet: (type, slug) => http.get(`${B}/public/articles/${type}/${slug}`),
    contentPublicArticleCategoriesList: (params) => http.get(`${B}/public/article-categories`, { params }),
    // ── Öğrenci okumaları ──
    contentVocabLookup: (word, lang = 'en') => http.get(`${B}/vocab/lookup`, { params: { word, lang } }),
    contentVocabGet: (itemCode) => http.get(`${B}/vocab/${itemCode}`),
    contentNoteGet: (itemCode) => http.get(`${B}/notes/${itemCode}`),
    /** Dokun-çevir: kelime kaydı (küratörlü sözlük → önbellek → AI). body: { word } */
    contentLexiconWord: (word) => http.post(`${B}/lexicon/word`, { word }),
    /** Kelimeyi kartlara eklenebilir sözlük kaydına çevirir → { itemCode }; ardından learningVocabCardAdd(itemCode). */
    contentLexiconWordItem: (word) => http.post(`${B}/lexicon/word/item`, { word }),
    /** Cümle çevirisi: sentences = aynı metnin cümleleri (sırayla), index = basılı tutulan → { translation, translations[] }. bookCode: kitap okuyucudan (kişisel kitap çevirisi kitapla silinir). */
    contentLexiconSentence: (sentences, index, bookCode) => http.post(`${B}/lexicon/sentence`, { sentences, index, ...(bookCode ? { bookCode } : {}) }),
    // ── Kitap okuma ──
    contentReadingLibrary: () => http.get(`${B}/reading/library`),
    contentReadingCatalog: (params) => http.get(`${B}/reading/catalog`, { params }),
    contentReadingBookGet: (code) => http.get(`${B}/reading/books/${code}`),
    contentReadingSectionGet: (code, position) => http.get(`${B}/reading/books/${code}/sections/${position}`),
    contentReadingProgressSave: (code, body) => http.put(`${B}/reading/books/${code}/progress`, body),
    /** form: FormData { file, rightsConfirmed:'true' }. opts: { onUploadProgress, signal } → 202 kitap (status: processing) */
    contentReadingUpload: (form, opts = {}) => http.post(`${B}/reading/books`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 15 * 60 * 1000, ...opts }),
    contentReadingBookUpdate: (code, body) => http.patch(`${B}/reading/books/${code}`, body),
    contentReadingBookDelete: (code) => http.delete(`${B}/reading/books/${code}`),
    /** Orijinal PDF için süreli bağlantı → { url (gateway köküne göre), expiresAt } */
    contentReadingFileUrl: (code) => http.post(`${B}/reading/books/${code}/file-url`),
    /** Sesli okuma: bölümün süreli ses tabanı → { url (gateway köküne göre; cümle sesi `${url}/<blok>/<cümle>`), expiresAt }. read_aloud kapalıysa 402 */
    contentReadingSpeechUrl: (code, position) => http.post(`${B}/reading/books/${code}/sections/${position}/speech-url`),
    /** Taranmış PDF: OCR'ı başlatır (Premium + aylık sayfa hakkı) */
    contentReadingOcrStart: (code) => http.post(`${B}/reading/books/${code}/ocr`),
    contentReportCreate: (body) => http.post(`${B}/content-reports`, body),
    // ── CMS: kitaplar ──
    contentCmsBooksList: (params) => http.get(`${B}/cms/books`, { params }),
    /** form: FormData { file, title, author, description, level, topic, license, attribution, sourceUrl, accessTier } */
    contentCmsBookCreate: (form, opts = {}) => http.post(`${B}/cms/books`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 15 * 60 * 1000, ...opts }),
    contentCmsBookUpdate: (code, body) => http.put(`${B}/cms/books/${code}`, body),
    contentCmsBookPublish: (code, published = true) => http.post(`${B}/cms/books/${code}/publish`, { published }),
    // ── CMS: maddeler ──
    contentCmsItemsList: (params) => http.get(`${B}/cms/items`, { params }),
    contentCmsItemCreate: (body) => http.post(`${B}/cms/items`, body),
    contentCmsItemsBulk: (body) => http.post(`${B}/cms/items/bulk`, body),
    contentCmsItemGet: (code) => http.get(`${B}/cms/items/${code}`),
    contentCmsItemDraftSave: (code, body) => http.put(`${B}/cms/items/${code}/draft`, body),
    contentCmsItemSubmit: (code, body) => http.post(`${B}/cms/items/${code}/submit`, body || {}),
    contentCmsItemRevisionCreate: (code, body) => http.post(`${B}/cms/items/${code}/revisions`, body || {}),
    contentCmsItemRetire: (code, body) => http.post(`${B}/cms/items/${code}/retire`, body || {}),
    contentCmsItemSimilarList: (code, params) => http.get(`${B}/cms/items/${code}/similar`, { params }),
    contentCmsTaxonomyGet: () => http.get(`${B}/cms/taxonomy`),
    contentCmsAutofillGet: (params) => http.get(`${B}/cms/exam-forms/autofill`, { params }),
    // ── CMS: inceleme ──
    contentCmsReviewQueueList: (params) => http.get(`${B}/cms/review-queue`, { params }),
    contentCmsRevisionGet: (code) => http.get(`${B}/cms/revisions/${code}`),
    contentCmsRevisionDiffGet: (code, params) => http.get(`${B}/cms/revisions/${code}/diff`, { params }),
    contentCmsCommentsList: (code) => http.get(`${B}/cms/revisions/${code}/comments`),
    contentCmsCommentCreate: (code, body) => http.post(`${B}/cms/revisions/${code}/comments`, body),
    contentCmsRevisionAssign: (code, body) => http.post(`${B}/cms/revisions/${code}/assign`, body),
    contentCmsRevisionDecide: (code, body) => http.post(`${B}/cms/revisions/${code}/decision`, body),
    contentCmsCommentResolve: (commentCode, body) => http.post(`${B}/cms/comments/${commentCode}/resolve`, body || {}),
    // ── CMS: hata bildirimleri ──
    contentCmsReportsList: (params) => http.get(`${B}/cms/reports`, { params }),
    contentCmsReportGet: (code) => http.get(`${B}/cms/reports/${code}`),
    contentCmsReportResolve: (code, body) => http.post(`${B}/cms/reports/${code}/resolve`, body),
    // ── CMS: yapay zekâ taslakları ──
    contentCmsGenerationJobCreate: (body) => http.post(`${B}/cms/generation-jobs`, body),
    contentCmsGenerationJobsList: (params) => http.get(`${B}/cms/generation-jobs`, { params }),
    contentCmsGenerationJobGet: (code) => http.get(`${B}/cms/generation-jobs/${code}`),
    contentCmsGenerationJobCancel: (code) => http.post(`${B}/cms/generation-jobs/${code}/cancel`, {}),
    contentCmsDraftAccept: (jobCode, itemCode) => http.post(`${B}/cms/generation-jobs/${jobCode}/drafts/${itemCode}/accept`, {}),
    contentCmsDraftReject: (jobCode, itemCode, body) => http.post(`${B}/cms/generation-jobs/${jobCode}/drafts/${itemCode}/reject`, body || {}),
    // ── CMS: ÖSYM sınav takvimi içe aktarma ──
    contentCmsCalendarImportsList: (params) => http.get(`${B}/cms/calendar-imports`, { params }),
    contentCmsCalendarImportGet: (code) => http.get(`${B}/cms/calendar-imports/${code}`),
    contentCmsCalendarScan: () => http.post(`${B}/cms/calendar-imports/scan`, {}),
    contentCmsCalendarUpload: (body) => http.post(`${B}/cms/calendar-imports/upload`, body),
    contentCmsCalendarImportApply: (code, body) => http.post(`${B}/cms/calendar-imports/${code}/apply`, body || {}),
    contentCmsCalendarImportReject: (code, body) => http.post(`${B}/cms/calendar-imports/${code}/reject`, body || {}),
    // ── CMS: istatistik ──
    contentCmsItemStatsRefresh: () => http.post(`${B}/cms/item-stats/refresh`, {}),
  };
};
