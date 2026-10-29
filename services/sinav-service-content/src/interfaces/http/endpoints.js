import { defineEndpoints, PERMISSIONS as P } from 'app-shared';
import container from '../../container.js';

const uc = () => container.useCases;
const q = (req) => req.query || {};
const b = (req) => req.body || {};

export default defineEndpoints([
  // ── Public katalog (MKT / ONB) ──
  { method: 'get', path: '/v1/public/ping', isPublic: true, handler: () => 'pong' },
  { method: 'get', path: '/v1/public/exams', isPublic: true, handler: () => uc().catalog.listExams() },
  { method: 'get', path: '/v1/public/exam-tracks/{key}', isPublic: true, handler: (req) => uc().catalog.getTrack({ key: req.params.key }) },
  {
    method: 'get', path: '/v1/public/exam-sessions/{key}.ics', isPublic: true,
    handler: async (req, _c, res) => {
      const { filename, text } = await uc().catalog.sessionIcs({ key: req.params.key });
      res.status(200).set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'public, max-age=3600' }).send(text);
    },
  },
  { method: 'get', path: '/v1/public/featured/{placement}', isPublic: true, handler: (req) => uc().catalog.featured({ placement: req.params.placement }) },
  { method: 'get', path: '/v1/public/articles', isPublic: true, handler: (req) => uc().catalog.listArticles({ query: q(req) }) },
  { method: 'get', path: '/v1/public/articles/search', isPublic: true, handler: (req) => uc().catalog.searchArticles({ query: q(req) }) },
  { method: 'get', path: '/v1/public/articles/{type}/{slug}', isPublic: true, handler: (req) => uc().catalog.getArticle({ type: req.params.type, slug: req.params.slug }) },
  { method: 'get', path: '/v1/public/article-categories', isPublic: true, handler: (req) => uc().catalog.listArticleCategories({ query: q(req) }) },

  // ── Öğrenci okumaları ──
  { method: 'get', path: '/v1/vocab/lookup', permission: P.studyContentRead, handler: (req) => uc().study.vocabLookup({ word: q(req).word, lang: q(req).lang || 'en' }) },
  { method: 'get', path: '/v1/vocab/{itemCode}', permission: P.studyContentRead, handler: (req) => uc().study.vocabDetail({ itemCode: req.params.itemCode }) },
  { method: 'get', path: '/v1/notes/{itemCode}', permission: P.studyContentRead, handler: (req, caller) => uc().study.getNote({ caller, itemCode: req.params.itemCode }) },
  { method: 'post', path: '/v1/content-reports', permission: P.contentReportCreate, body: true, handler: (req, caller) => uc().study.createReport({ caller, ...b(req) }) },

  // ── CMS: maddeler ──
  { method: 'get', path: '/v1/cms/items', permission: P.contentRead, handler: (req, caller) => uc().items.list({ caller, query: q(req) }) },
  { method: 'post', path: '/v1/cms/items', permission: P.contentWrite, body: true, handler: (req, caller) => uc().items.createItem({ caller, ...b(req) }) },
  { method: 'post', path: '/v1/cms/items/bulk', permission: P.contentWrite, body: true, handler: (req, caller) => uc().items.bulk({ caller, ...b(req) }) },
  { method: 'get', path: '/v1/cms/items/{code}', permission: P.contentRead, handler: (req) => uc().items.getItem({ code: req.params.code }) },
  { method: 'put', path: '/v1/cms/items/{code}/draft', permission: P.contentWrite, body: true, handler: (req, caller) => uc().items.updateDraft({ caller, code: req.params.code, ...b(req) }) },
  { method: 'post', path: '/v1/cms/items/{code}/submit', permission: P.contentWrite, body: true, handler: (req, caller) => uc().items.submit({ caller, code: req.params.code, ...b(req) }) },
  { method: 'post', path: '/v1/cms/items/{code}/revisions', permission: P.contentWrite, body: true, handler: (req, caller) => uc().items.newRevision({ caller, code: req.params.code, ...b(req) }) },
  { method: 'post', path: '/v1/cms/items/{code}/retire', permission: P.contentRead, body: true, handler: (req, caller) => uc().items.retire({ caller, code: req.params.code, note: b(req).note }) },
  { method: 'get', path: '/v1/cms/items/{code}/similar', permission: P.contentRead, handler: (req) => uc().items.similar({ code: req.params.code, stem: q(req).stem, limit: Number(q(req).limit) || 10 }) },
  { method: 'get', path: '/v1/cms/taxonomy', permission: P.contentRead, handler: () => uc().misc.taxonomy() },
  { method: 'get', path: '/v1/cms/exam-forms/autofill', permission: P.contentRead, handler: (req) => uc().misc.autofill({ query: q(req) }) },

  // ── CMS: inceleme ──
  { method: 'get', path: '/v1/cms/review-queue', permission: P.contentReview, handler: (req, caller) => uc().review.queue({ caller, query: q(req) }) },
  { method: 'get', path: '/v1/cms/revisions/{code}', permission: P.contentRead, handler: (req) => uc().review.getRevision({ code: req.params.code }) },
  { method: 'get', path: '/v1/cms/revisions/{code}/diff', permission: P.contentRead, handler: (req) => uc().review.diff({ code: req.params.code, against: q(req).against }) },
  { method: 'get', path: '/v1/cms/revisions/{code}/comments', permission: P.contentRead, handler: (req) => uc().review.listComments({ code: req.params.code }) },
  { method: 'post', path: '/v1/cms/revisions/{code}/comments', permission: P.contentRead, body: true, handler: (req, caller) => uc().review.addComment({ caller, code: req.params.code, ...b(req) }) },
  { method: 'post', path: '/v1/cms/revisions/{code}/assign', permission: P.contentReview, body: true, handler: (req, caller) => uc().review.assign({ caller, code: req.params.code, reviewerCode: b(req).reviewerCode }) },
  { method: 'post', path: '/v1/cms/revisions/{code}/decision', permission: P.contentReview, body: true, handler: (req, caller) => uc().review.decide({ caller, code: req.params.code, decision: b(req).decision, note: b(req).note }) },
  { method: 'post', path: '/v1/cms/comments/{code}/resolve', permission: P.contentRead, body: true, handler: (req, caller) => uc().review.resolveComment({ caller, commentCode: req.params.code, resolved: b(req).resolved !== false }) },

  // ── CMS: hata bildirimleri ──
  { method: 'get', path: '/v1/cms/reports', permission: P.contentReportManage, handler: (req) => uc().misc.listReports({ query: q(req) }) },
  { method: 'get', path: '/v1/cms/reports/{code}', permission: P.contentReportManage, handler: (req) => uc().misc.getReport({ code: req.params.code }) },
  { method: 'post', path: '/v1/cms/reports/{code}/resolve', permission: P.contentReportManage, body: true, handler: (req, caller) => uc().misc.resolveReport({ caller, code: req.params.code, ...b(req) }) },

  // ── CMS: yapay zekâ taslakları ──
  { method: 'post', path: '/v1/cms/generation-jobs', permission: P.contentGenerate, body: true, handler: (req, caller) => uc().generation.createJob({ caller, ...b(req) }) },
  { method: 'get', path: '/v1/cms/generation-jobs', permission: P.contentRead, handler: (req) => uc().generation.listJobs({ query: q(req) }) },
  { method: 'get', path: '/v1/cms/generation-jobs/{code}', permission: P.contentRead, handler: (req) => uc().generation.getJob({ code: req.params.code }) },
  { method: 'post', path: '/v1/cms/generation-jobs/{code}/cancel', permission: P.contentGenerate, body: true, handler: (req, caller) => uc().generation.cancelJob({ caller, code: req.params.code }) },
  { method: 'post', path: '/v1/cms/generation-jobs/{code}/drafts/{itemCode}/accept', permission: P.contentGenerate, body: true, handler: (req, caller) => uc().generation.acceptDraft({ caller, jobCode: req.params.code, itemCode: req.params.itemCode }) },
  { method: 'post', path: '/v1/cms/generation-jobs/{code}/drafts/{itemCode}/reject', permission: P.contentGenerate, body: true, handler: (req, caller) => uc().generation.rejectDraft({ caller, jobCode: req.params.code, itemCode: req.params.itemCode, note: b(req).note }) },

  // ── CMS: ÖSYM sınav takvimi içe aktarma ──
  { method: 'get', path: '/v1/cms/calendar-imports', permission: P.contentRead, handler: (req) => uc().calendar.list({ query: q(req) }) },
  { method: 'post', path: '/v1/cms/calendar-imports/scan', permission: P.contentWrite, body: true, handler: (req, caller) => uc().calendar.scan({ caller }) },
  { method: 'post', path: '/v1/cms/calendar-imports/upload', permission: P.contentWrite, body: true, handler: (req, caller) => uc().calendar.upload({ caller, pdfBase64: b(req).pdfBase64, sourceUrl: b(req).sourceUrl }) },
  { method: 'get', path: '/v1/cms/calendar-imports/{code}', permission: P.contentRead, handler: (req) => uc().calendar.get({ code: req.params.code }) },
  { method: 'post', path: '/v1/cms/calendar-imports/{code}/apply', permission: P.contentReview, body: true, handler: (req, caller) => uc().calendar.apply({ caller, code: req.params.code, keys: b(req).keys }) },
  { method: 'post', path: '/v1/cms/calendar-imports/{code}/reject', permission: P.contentReview, body: true, handler: (req, caller) => uc().calendar.reject({ caller, code: req.params.code, note: b(req).note }) },

  // ── CMS: istatistik ──
  { method: 'post', path: '/v1/cms/item-stats/refresh', permission: P.contentReview, body: true, handler: () => uc().misc.refreshItemStats() },
], { tag: 'content' });
