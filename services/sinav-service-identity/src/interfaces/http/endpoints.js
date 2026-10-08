import { defineEndpoints, PERMISSIONS as P } from 'app-shared';
import container from '../../container.js';

const uc = () => container.useCases;
const q = (req) => req.query || {};
const b = (req) => req.body || {};
const platformOf = (req) => (String(req.headers['x-client'] || '').startsWith('sinav-mobile') ? (req.headers['x-platform'] || 'ios') : 'web');
const ctx = (req) => ({ ip: req.headers.useraccountip && req.headers.useraccountip !== 'none' ? req.headers.useraccountip : req.ip, userAgent: req.headers['user-agent'] });

export default defineEndpoints([
  // ── Public ──
  { method: 'get', path: '/v1/public/ping', isPublic: true, handler: () => 'pong' },
  { method: 'post', path: '/v1/auth/guest', isPublic: true, body: true, handler: (req) => uc().auth.createGuest({ locale: b(req).locale, timezone: b(req).timezone }) },
  { method: 'post', path: '/v1/auth/email/code', isPublic: true, body: true, handler: (req) => uc().auth.sendCode({ email: b(req).email, purpose: b(req).purpose || 'login', ...ctx(req) }) },
  { method: 'post', path: '/v1/auth/email/verify', isPublic: true, body: true, handler: (req) => uc().auth.verifyEmailCode({ email: b(req).email, code: b(req).code }) },
  { method: 'post', path: '/v1/auth/password/login', isPublic: true, body: true, handler: (req) => uc().auth.passwordLogin({ email: b(req).email, password: b(req).password }) },
  { method: 'post', path: '/v1/auth/password/reset/request', isPublic: true, body: true, handler: (req) => uc().auth.sendCode({ email: b(req).email, purpose: 'password_reset', ...ctx(req) }) },
  { method: 'post', path: '/v1/auth/password/reset/confirm', isPublic: true, body: true, handler: (req) => uc().auth.resetPassword({ email: b(req).email, code: b(req).code, newPassword: b(req).newPassword }) },
  { method: 'get', path: '/v1/public/legal-documents', isPublic: true, handler: (req) => uc().public.listLegalDocuments({ locale: q(req).locale }) },
  { method: 'get', path: '/v1/public/legal-documents/{type}', isPublic: true, handler: (req) => uc().public.getLegalDocument({ type: req.params.type, locale: q(req).locale }) },
  { method: 'post', path: '/v1/public/waitlist', isPublic: true, body: true, handler: (req) => uc().public.joinWaitlist(b(req)) },
  { method: 'get', path: '/v1/public/waitlist/confirm', isPublic: true, handler: async (req, _c, res) => { await uc().public.confirmWaitlist({ token: q(req).token }); res.status(200).type('html').send('<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px"><h2>Teşekkürler, adresin onaylandı.</h2></body>'); } },
  { method: 'post', path: '/v1/public/contact-messages', isPublic: true, body: true, handler: (req) => uc().public.submitContact({ ...b(req), platform: b(req).platform || platformOf(req) }) },
  { method: 'get', path: '/v1/public/data-exports/{token}', isPublic: true, handler: async (req, _c, res) => { const data = await uc().account.downloadDataExport({ token: req.params.token }); res.status(200).set({ 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="odak-verilerim.json"' }).send(data); } },

  // ── Oturum / kayıt ──
  { method: 'post', path: '/v1/auth/register', permission: P.accountManage, body: true, handler: (req, caller) => uc().auth.register({ caller, ...b(req), platform: b(req).platform || platformOf(req) }) },
  { method: 'post', path: '/v1/session/switch', permission: P.sessionSwitch, body: true, handler: (req, caller) => uc().auth.switchSession({ caller, membershipCode: b(req).membershipCode }) },

  // ── Hesap ──
  { method: 'get', path: '/v1/account', permission: P.accountRead, handler: (_req, caller) => uc().account.getAccount({ caller }) },
  { method: 'patch', path: '/v1/account', permission: P.accountManage, body: true, handler: (req, caller) => uc().account.updateAccount({ caller, ...b(req) }) },
  { method: 'put', path: '/v1/account/password', permission: P.accountManage, body: true, handler: (req, caller) => uc().account.setPassword({ caller, ...b(req) }) },
  { method: 'post', path: '/v1/account/deletion/code', permission: P.accountManage, handler: (_req, caller) => uc().account.requestDeletionCode({ caller }) },
  { method: 'post', path: '/v1/account/deletion', permission: P.accountManage, body: true, handler: (req, caller) => uc().account.requestDeletion({ caller, code: b(req).code }) },
  { method: 'post', path: '/v1/account/data-export', permission: P.accountManage, handler: (_req, caller) => uc().account.requestDataExport({ caller }) },
  { method: 'get', path: '/v1/account/data-export', permission: P.accountRead, handler: (_req, caller) => uc().account.getDataExport({ caller }) },
  { method: 'get', path: '/v1/memberships', permission: P.accountRead, handler: async (_req, caller) => (await uc().account.getAccount({ caller })).memberships },
  { method: 'get', path: '/v1/preferences', permission: P.accountRead, handler: (_req, caller) => uc().account.getPreferences({ caller }) },
  { method: 'patch', path: '/v1/preferences', permission: P.accountManage, body: true, handler: (req, caller) => uc().account.updatePreferences({ caller, ...b(req) }) },
  { method: 'get', path: '/v1/notification-preferences', permission: P.accountRead, handler: (_req, caller) => uc().account.getNotificationPrefs({ caller }) },
  { method: 'patch', path: '/v1/notification-preferences', permission: P.accountManage, body: true, handler: (req, caller) => uc().account.updateNotificationPrefs({ caller, ...b(req) }) },
  { method: 'post', path: '/v1/devices', permission: P.accountManage, body: true, handler: (req, caller) => uc().account.registerDevice({ caller, ...b(req) }) },
  { method: 'post', path: '/v1/devices/remove', permission: P.accountManage, body: true, handler: (req, caller) => uc().account.removeDevice({ caller, pushToken: b(req).pushToken }) },
  { method: 'get', path: '/v1/consents', permission: P.accountRead, handler: (_req, caller) => uc().account.listConsents({ caller }) },
  { method: 'post', path: '/v1/consents', permission: P.accountManage, body: true, handler: (req, caller) => uc().account.recordConsent({ caller, ...b(req), platform: b(req).platform || platformOf(req) }) },
  { method: 'get', path: '/v1/notifications', permission: P.accountRead, handler: (req, caller) => uc().notify.listNotifications({ caller, limit: q(req).limit }) },
  { method: 'post', path: '/v1/notifications/{code}/opened', permission: P.accountManage, handler: (req, caller) => uc().notify.markOpened({ caller, code: req.params.code }) },
  { method: 'post', path: '/v1/contact-messages', permission: P.accountRead, body: true, handler: (req, caller) => uc().public.submitContact({ caller, ...b(req), platform: b(req).platform || platformOf(req) }) },

  // ── Dahili ──
  { method: 'post', path: '/v1/internal/notifications', internal: true, body: true, handler: (req) => uc().notify.enqueue(b(req)) },
], { tag: 'identity' });
