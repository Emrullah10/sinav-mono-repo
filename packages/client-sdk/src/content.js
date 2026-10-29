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
    contentReportCreate: (body) => http.post(`${B}/content-reports`, body),
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
