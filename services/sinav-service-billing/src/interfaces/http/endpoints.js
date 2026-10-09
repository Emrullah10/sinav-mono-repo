import { defineEndpoints, PERMISSIONS as P } from 'app-shared';
import container from '../../container.js';

const uc = () => container.useCases;
const q = (req) => req.query || {};
const b = (req) => req.body || {};

export default defineEndpoints([
  // ── Public ──
  { method: 'get', path: '/v1/public/ping', isPublic: true, handler: () => 'pong' },
  { method: 'get', path: '/v1/public/products', isPublic: true, handler: () => uc().catalog.listPublicProducts() },
  { method: 'get', path: '/v1/public/campaigns/{key}', isPublic: true, handler: (req) => uc().catalog.getPublicCampaign({ key: req.params.key }) },
  { method: 'get', path: '/v1/public/fake-3ds/{code}', isPublic: true,
    handler: async (req, _c, res) => {
      const r = await uc().checkout.renderFake3ds({ code: req.params.code, t: q(req).t, json: q(req).json === '1' });
      if (r.redirectTo) return res.redirect(303, r.redirectTo);
      return res.status(200).type('html').set('Cache-Control', 'no-store').send(r.html);
    } },
  { method: 'post', path: '/v1/public/payments/{code}/callback', isPublic: true, body: true,
    handler: async (req, _c, res) => {
      const r = await uc().checkout.handleCallback({ code: req.params.code, body: b(req), query: q(req) });
      if (r.json) return res.status(200).json({ success: true, data: r.json });
      return res.redirect(303, r.redirectTo);
    } },

  // ── Haklar ──
  { method: 'get', path: '/v1/entitlements', permission: P.billingRead, handler: (_req, caller) => uc().catalog.getMyEntitlements({ caller }) },

  // ── Ödeme ──
  { method: 'get', path: '/v1/billing-profile', permission: P.billingRead, handler: (_req, caller) => uc().profile.getBillingProfile({ caller }) },
  { method: 'put', path: '/v1/billing-profile', permission: P.billingManage, body: true, handler: (req, caller) => uc().profile.putBillingProfile({ caller, ...b(req) }) },
  { method: 'post', path: '/v1/coupons/validate', permission: P.billingPurchase, body: true, handler: (req, caller) => uc().profile.validateCoupon({ caller, ...b(req) }) },
  { method: 'get', path: '/v1/installments', permission: P.billingPurchase, handler: (req, caller) => uc().profile.listInstallments({ caller, ...q(req) }) },
  { method: 'post', path: '/v1/checkout', permission: P.billingPurchase, body: true, handler: (req, caller) => uc().checkout.checkout({ caller, body: b(req), headers: req.headers }) },
  { method: 'get', path: '/v1/payments/{code}', permission: P.billingRead, handler: (req, caller) => uc().checkout.getPayment({ caller, code: req.params.code }) },
  { method: 'post', path: '/v1/payments/{code}/cancel', permission: P.billingPurchase, handler: (req, caller) => uc().checkout.cancelPayment({ caller, code: req.params.code }) },

  // ── Abonelik ──
  { method: 'get', path: '/v1/subscription', permission: P.billingRead, handler: (_req, caller) => uc().subscription.getSubscription({ caller }) },
  { method: 'get', path: '/v1/subscription/cancel-offers', permission: P.billingRead, handler: (req, caller) => uc().subscription.listCancelOffers({ caller, reason: q(req).reason }) },
  { method: 'post', path: '/v1/subscription/offers/{offerKey}/accept', permission: P.billingManage, body: true,
    handler: (req, caller) => uc().subscription.acceptOffer({ caller, offerKey: req.params.offerKey, body: b(req), headers: req.headers }) },
  { method: 'post', path: '/v1/subscription/cancel', permission: P.billingManage, body: true, handler: (req, caller) => uc().subscription.cancelSubscription({ caller, reason: b(req).reason, note: b(req).note }) },
  { method: 'post', path: '/v1/subscription/resume', permission: P.billingManage, handler: (_req, caller) => uc().subscription.resumeSubscription({ caller }) },

  // ── Ödeme yöntemleri ve faturalar ──
  { method: 'get', path: '/v1/payment-methods', permission: P.billingRead, handler: (_req, caller) => uc().profile.listPaymentMethods({ caller }) },
  { method: 'post', path: '/v1/payment-methods', permission: P.billingManage, body: true, handler: (req, caller) => uc().profile.addPaymentMethod({ caller, card: b(req).card }) },
  { method: 'delete', path: '/v1/payment-methods/{code}', permission: P.billingManage, handler: (req, caller) => uc().profile.removePaymentMethod({ caller, code: req.params.code }) },
  { method: 'post', path: '/v1/payment-methods/{code}/default', permission: P.billingManage, handler: (req, caller) => uc().profile.setDefaultPaymentMethod({ caller, code: req.params.code }) },
  { method: 'get', path: '/v1/invoices', permission: P.billingRead, handler: (_req, caller) => uc().profile.listInvoices({ caller }) },
  { method: 'get', path: '/v1/invoices/{code}/pdf', permission: P.billingRead, handler: (req, caller, res) => uc().profile.getInvoiceDocument({ caller, code: req.params.code, format: q(req).format, res }) },

  // ── Dahili ──
  { method: 'get', path: '/v1/internal/entitlements/{userId}', internal: true, handler: (req) => uc().catalog.getInternalEntitlements({ userId: req.params.userId }) },
], { tag: 'billing' });
