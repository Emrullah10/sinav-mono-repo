import { PERMISSIONS as P } from 'app-shared';
import container from '../../../container.js';

const uc = () => container.useCases;
const b = (req) => req.body || {};

export default [
  { method: 'get', path: '/v1/public/ping', isPublic: true, handler: () => 'pong' },

  // ── Kayıt (hedef sınav) ──
  { method: 'post', path: '/v1/enrollments', permission: P.learningOnboard, body: true, handler: (req, caller) => uc().enrollment.create({ caller, ...b(req) }) },
  { method: 'get', path: '/v1/enrollments/active', permission: P.learningOnboard, handler: (req, caller) => uc().enrollment.getActive({ caller }) },
  { method: 'patch', path: '/v1/enrollments/{code}', permission: P.learningOnboard, body: true, handler: (req, caller) => uc().enrollment.patch({ caller, code: req.params.code, ...b(req) }) },
  { method: 'get', path: '/v1/availability', permission: P.learningOnboard, handler: (req, caller) => uc().enrollment.getAvailability({ caller }) },
  { method: 'put', path: '/v1/availability', permission: P.learningOnboard, body: true, handler: (req, caller) => uc().enrollment.putAvailability({ caller, days: b(req).days }) },
  { method: 'get', path: '/v1/learner-settings', permission: P.learningOnboard, handler: (req, caller) => uc().enrollment.getSettings({ caller }) },
  { method: 'patch', path: '/v1/learner-settings', permission: P.learningOnboard, body: true, handler: (req, caller) => uc().enrollment.patchSettings({ caller, ...b(req) }) },

  // ── Seviye tespiti ──
  { method: 'post', path: '/v1/diagnostics', permission: P.learningDiagnostic, body: true, handler: (req, caller) => uc().diagnostic.start({ caller }) },
  { method: 'post', path: '/v1/diagnostics/skip', permission: P.learningDiagnostic, body: true, handler: (req, caller) => uc().diagnostic.skip({ caller }) },
  { method: 'get', path: '/v1/diagnostics/{code}', permission: P.learningDiagnostic, handler: (req, caller) => uc().diagnostic.get({ caller, code: req.params.code, position: req.query?.position }) },
  { method: 'post', path: '/v1/diagnostics/{code}/answers', permission: P.learningDiagnostic, body: true, handler: (req, caller) => uc().diagnostic.answer({ caller, code: req.params.code, ...b(req) }) },
  { method: 'post', path: '/v1/diagnostics/{code}/pause', permission: P.learningDiagnostic, body: true, handler: (req, caller) => uc().diagnostic.pause({ caller, code: req.params.code }) },
  { method: 'post', path: '/v1/diagnostics/{code}/complete', permission: P.learningDiagnostic, body: true, handler: (req, caller) => uc().diagnostic.complete({ caller, code: req.params.code }) },
  { method: 'get', path: '/v1/diagnostics/{code}/result', permission: P.learningDiagnostic, handler: (req, caller) => uc().diagnostic.result({ caller, code: req.params.code }) },

  // ── Plan önizleme (misafir de görür) ──
  { method: 'get', path: '/v1/plan/preview', permission: P.learningOnboard, handler: (req, caller) => uc().plan.preview({ caller, days: req.query?.days }) },
];
