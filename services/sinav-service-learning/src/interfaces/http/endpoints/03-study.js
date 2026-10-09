import { PERMISSIONS as P } from 'app-shared';
import container from '../../../container.js';

const uc = () => container.useCases;
const b = (req) => req.body || {};
const S = P.learningStudy;

export default [
  // ── Çalış merkezi ──
  { method: 'get', path: '/v1/study/overview', permission: S, handler: (req, caller) => uc().study.overview({ caller }) },
  { method: 'get', path: '/v1/study/question-types/{key}', permission: S, handler: (req, caller) => uc().study.questionType({ caller, key: req.params.key }) },
  { method: 'get', path: '/v1/study/skills/{key}', permission: S, handler: (req, caller) => uc().study.skill({ caller, key: req.params.key }) },
  { method: 'get', path: '/v1/practice/options', permission: S, handler: (req, caller) => uc().study.practiceOptions({ caller }) },
  { method: 'post', path: '/v1/practice-sessions', permission: S, body: true, handler: (req, caller) => uc().study.create({ caller, ...b(req) }) },

  // ── Oturum (alıştırma, not kontrolü, hata tekrarı, deneme dışı) ──
  { method: 'get', path: '/v1/sessions/current', permission: S, handler: (req, caller) => uc().study.current({ caller }) },
  { method: 'get', path: '/v1/sessions/{code}', permission: S, handler: (req, caller) => uc().study.getSession({ caller, code: req.params.code }) },
  { method: 'get', path: '/v1/sessions/{code}/items/{n}', permission: S, handler: (req, caller) => uc().study.getItem({ caller, code: req.params.code, position: req.params.n }) },
  { method: 'post', path: '/v1/sessions/{code}/items/{n}/answer', permission: S, body: true, handler: (req, caller) => uc().study.answer({ caller, code: req.params.code, position: req.params.n, ...b(req) }) },
  { method: 'post', path: '/v1/sessions/{code}/items/{n}/flag', permission: S, body: true, handler: (req, caller) => uc().study.flag({ caller, code: req.params.code, position: req.params.n, flagged: b(req).flagged }) },
  { method: 'post', path: '/v1/sessions/{code}/items/{n}/eliminate', permission: S, body: true, handler: (req, caller) => uc().study.eliminate({ caller, code: req.params.code, position: req.params.n, labels: b(req).labels }) },
  { method: 'post', path: '/v1/sessions/{code}/items/{n}/hints', permission: S, body: true, handler: (req, caller) => uc().study.hint({ caller, code: req.params.code, position: req.params.n }) },
  { method: 'post', path: '/v1/sessions/{code}/items/{n}/solution', permission: S, body: true, handler: (req, caller) => uc().study.solution({ caller, code: req.params.code, position: req.params.n }) },
  { method: 'post', path: '/v1/sessions/{code}/items/{n}/mistake-type', permission: S, body: true, handler: (req, caller) => uc().study.mistakeType({ caller, code: req.params.code, position: req.params.n, mistakeType: b(req).mistakeType }) },
  { method: 'post', path: '/v1/sessions/{code}/pause', permission: S, body: true, handler: (req, caller) => uc().study.pause({ caller, code: req.params.code }) },
  { method: 'post', path: '/v1/sessions/{code}/resume', permission: S, body: true, handler: (req, caller) => uc().study.resume({ caller, code: req.params.code }) },
  { method: 'post', path: '/v1/sessions/{code}/complete', permission: S, body: true, handler: (req, caller) => uc().study.complete({ caller, code: req.params.code }) },
  { method: 'get', path: '/v1/sessions/{code}/result', permission: S, handler: (req, caller) => uc().study.result({ caller, code: req.params.code }) },

  // ── Hap not + yer imleri ──
  { method: 'post', path: '/v1/notes/{itemCode}/read', permission: S, body: true, handler: (req, caller) => uc().notes.markRead({ caller, itemCode: req.params.itemCode, understood: b(req).understood }) },
  { method: 'post', path: '/v1/notes/{itemCode}/checks', permission: S, body: true, handler: (req, caller) => uc().notes.startCheck({ caller, itemCode: req.params.itemCode }) },
  { method: 'post', path: '/v1/bookmarks', permission: S, body: true, handler: (req, caller) => uc().notes.addBookmark({ caller, ...b(req) }) },
  { method: 'get', path: '/v1/bookmarks', permission: S, handler: (req, caller) => uc().notes.listBookmarks({ caller, query: req.query || {} }) },
  { method: 'delete', path: '/v1/bookmarks/{code}', permission: S, handler: (req, caller) => uc().notes.removeBookmark({ caller, code: req.params.code }) },
];
