import { defineEndpoints, PERMISSIONS as P } from 'app-shared';
import container from '../../container.js';

const uc = () => container.useCases;
const q = (req) => req.query || {};
const b = (req) => req.body || {};

export default defineEndpoints([
  // ── Öğretmen: ana ekran, kota ──
  { method: 'get', path: '/v1/overview', permission: P.tutorChat, handler: (req, caller) => uc().conversations.overview({ caller, limit: q(req).limit }) },
  { method: 'get', path: '/v1/usage', permission: P.tutorChat, handler: (_req, caller) => uc().conversations.usage({ caller }) },

  // ── Sohbetler ──
  { method: 'post', path: '/v1/conversations', permission: P.tutorChat, body: true, handler: (req, caller) => uc().conversations.create({ caller, mode: b(req).mode, context: b(req).context, title: b(req).title }) },
  { method: 'delete', path: '/v1/conversations', permission: P.tutorChat, handler: (_req, caller) => uc().conversations.removeAll({ caller }) },
  { method: 'get', path: '/v1/conversations/{code}', permission: P.tutorChat, handler: (req, caller) => uc().conversations.get({ caller, code: req.params.code }) },
  { method: 'patch', path: '/v1/conversations/{code}', permission: P.tutorChat, body: true, handler: (req, caller) => uc().conversations.update({ caller, code: req.params.code, title: b(req).title, pinned: b(req).pinned }) },
  { method: 'delete', path: '/v1/conversations/{code}', permission: P.tutorChat, handler: (req, caller) => uc().conversations.remove({ caller, code: req.params.code }) },
  // SSE: handler yanıtı kendisi yazar (res).
  { method: 'post', path: '/v1/conversations/{code}/messages', permission: P.tutorChat, body: true, handler: (req, caller, res) => uc().chat.sendMessage({ caller, code: req.params.code, body: b(req), res }) },

  // ── Mesajlar ──
  { method: 'post', path: '/v1/messages/{code}/stop', permission: P.tutorChat, handler: (req, caller) => uc().chat.stop({ caller, code: req.params.code }) },
  { method: 'post', path: '/v1/messages/{code}/feedback', permission: P.tutorChat, body: true, handler: (req, caller) => uc().conversations.feedback({ caller, code: req.params.code, isHelpful: b(req).isHelpful }) },
  { method: 'post', path: '/v1/messages/{code}/reports', permission: P.tutorChat, body: true, handler: (req, caller) => uc().conversations.report({ caller, code: req.params.code, reason: b(req).reason, note: b(req).note }) },

  // ── Çeviri koçu ──
  { method: 'get', path: '/v1/translation/prompts/next', permission: P.tutorTranslation, handler: (req, caller) => uc().translation.nextPrompt({ caller, direction: q(req).direction, difficulty: q(req).difficulty, area: q(req).area }) },
  { method: 'post', path: '/v1/translation/evaluations', permission: P.tutorTranslation, body: true, handler: (req, caller) => uc().translation.evaluate({ caller, promptCode: b(req).promptCode, userText: b(req).userText, clientRef: b(req).clientRef }) },
  { method: 'get', path: '/v1/translation/evaluations/{code}', permission: P.tutorTranslation, handler: (req, caller) => uc().translation.get({ caller, code: req.params.code }) },

  // ── CMS (yanıt bildirimleri) ──
  { method: 'get', path: '/v1/cms/message-reports', permission: P.contentReportManage, handler: (req, caller) => uc().cms.listReports({ caller, status: q(req).status, limit: q(req).limit, cursor: q(req).cursor }) },
  { method: 'post', path: '/v1/cms/message-reports/{code}/resolve', permission: P.contentReportManage, body: true, handler: (req, caller) => uc().cms.resolveReport({ caller, code: req.params.code, status: b(req).status, note: b(req).note }) },

  // ── Dahili ──
  { method: 'post', path: '/v1/internal/ai/complete', internal: true, body: true, handler: (req, caller) => uc().internal.aiComplete({ caller, feature: b(req).feature, model: b(req).model, messages: b(req).messages, json: b(req).json, maxTokens: b(req).maxTokens, webSearch: b(req).webSearch }) },
], { tag: 'tutor' });
