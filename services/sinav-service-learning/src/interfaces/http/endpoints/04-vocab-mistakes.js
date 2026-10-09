import { PERMISSIONS as P } from 'app-shared';
import container from '../../../container.js';

const uc = () => container.useCases;
const b = (req) => req.body || {};
const S = P.learningStudy;

export default [
  // ── Kelime (FSRS) ──
  { method: 'get', path: '/v1/vocab/overview', permission: S, handler: (req, caller) => uc().vocab.overview({ caller }) },
  { method: 'put', path: '/v1/vocab/decks/{key}/subscription', permission: S, body: true, handler: (req, caller) => uc().vocab.subscribe({ caller, key: req.params.key, ...b(req) }) },
  { method: 'post', path: '/v1/vocab/review-sessions', permission: S, body: true, handler: (req, caller) => uc().vocab.start({ caller, ...b(req) }) },
  { method: 'get', path: '/v1/vocab/review-sessions/{code}/next', permission: S, handler: (req, caller) => uc().vocab.next({ caller, code: req.params.code }) },
  { method: 'post', path: '/v1/vocab/cards/{code}/reviews', permission: S, body: true, handler: (req, caller) => uc().vocab.review({ caller, cardCode: req.params.code, ...b(req) }) },
  { method: 'post', path: '/v1/vocab/review-sessions/{code}/undo', permission: S, body: true, handler: (req, caller) => uc().vocab.undo({ caller, code: req.params.code }) },
  { method: 'post', path: '/v1/vocab/review-sessions/{code}/complete', permission: S, body: true, handler: (req, caller) => uc().vocab.complete({ caller, code: req.params.code }) },
  { method: 'get', path: '/v1/vocab/cards/by-item/{itemCode}', permission: S, handler: (req, caller) => uc().vocab.byItem({ caller, itemCode: req.params.itemCode }) },
  { method: 'post', path: '/v1/vocab/cards', permission: S, body: true, handler: (req, caller) => uc().vocab.addCard({ caller, itemCode: b(req).itemCode }) },

  // ── Hata defteri ve tekrarı ──
  { method: 'get', path: '/v1/mistakes', permission: S, handler: (req, caller) => uc().mistakes.list({ caller, query: req.query || {} }) },
  { method: 'patch', path: '/v1/mistakes/{code}', permission: S, body: true, handler: (req, caller) => uc().mistakes.patch({ caller, code: req.params.code, ...b(req) }) },
  { method: 'post', path: '/v1/mistake-reviews', permission: S, body: true, handler: (req, caller) => uc().mistakes.startReview({ caller, ...b(req) }) },
];
