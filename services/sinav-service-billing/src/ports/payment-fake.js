import { DomainError } from 'app-shared';
import { hmacHex, safeEq, randId, publicApiUrl, esc, fmtMoney } from '../shared/helpers.js';

// Sahte sağlayıcı kuralları (yalnız geliştirme):
//  • Kart sonu 0002 → insufficient_funds · 0003 → card_blocked_online · 0004 → ilk ödeme başarılı, YENİLEMEDE insufficient_funds
//  • 3DS sayfasında "Reddet" → 3ds_failed
//  • Diğer kartlar başarılı. `card` verilmezse test kartı 4242 4242 4242 4242 kullanılır.
//  • Kart numarası/CVC ASLA saklanmaz; yalnız marka, son 4 hane, SKT ve sahte token.
export const FAILURE = Object.freeze({
  insufficient_funds: 'billing.failure.insufficient_funds',
  '3ds_failed': 'billing.failure.3ds_failed',
  card_blocked_online: 'billing.failure.card_blocked_online',
  timeout: 'billing.failure.timeout',
  generic: 'billing.failure.generic',
});

const brandOf = (num) => {
  if (/^4/.test(num)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(num)) return 'mastercard';
  if (/^9792|^65/.test(num)) return 'troy';
  if (/^3[47]/.test(num)) return 'amex';
  return 'card';
};
export const brandForBin = brandOf;

const normalizeCard = (card, now = new Date()) => {
  const c = card || { number: '4242424242424242', holder: 'Test Kullanici', expMonth: 12, expYear: now.getUTCFullYear() + 3, cvc: '123' };
  const num = String(c.number || '').replace(/\D/g, '');
  if (num.length < 13 || num.length > 19) throw new DomainError('BILLING_CARD_INVALID', 'Card number invalid');
  const expMonth = Number(c.expMonth);
  let expYear = Number(c.expYear);
  if (expYear < 100) expYear += 2000;
  if (!(expMonth >= 1 && expMonth <= 12) || !expYear) throw new DomainError('BILLING_CARD_INVALID', 'Card expiry invalid');
  if (expYear < now.getUTCFullYear() || (expYear === now.getUTCFullYear() && expMonth < now.getUTCMonth() + 1)) {
    throw new DomainError('BILLING_CARD_INVALID', 'Card expired');
  }
  return { brand: brandOf(num), last4: num.slice(-4), expMonth, expYear, holder: String(c.holder || '').slice(0, 120) || null };
};

export const makeFakePaymentProvider = ({ secret }) => {
  const sign = (paymentCode, what) => hmacHex(secret, `${paymentCode}:${what}`);
  const pageToken = (paymentCode) => sign(paymentCode, 'page');
  const newToken = (last4) => `fake_tok_${last4}_${randId(6)}`;

  const failureFor = (last4, { renewal = false } = {}) => {
    if (last4 === '0002') return { failureCode: 'insufficient_funds', failureReasonKey: FAILURE.insufficient_funds };
    if (last4 === '0003') return { failureCode: 'card_blocked_online', failureReasonKey: FAILURE.card_blocked_online };
    if (last4 === '0004' && renewal) return { failureCode: 'insufficient_funds', failureReasonKey: FAILURE.insufficient_funds };
    return null;
  };

  return {
    name: 'fake',
    pageToken,
    verifyPageToken: (paymentCode, t) => safeEq(t, pageToken(paymentCode)),
    async createPayment({ paymentCode, card }) {
      const meta = normalizeCard(card);
      const token = newToken(meta.last4);
      const actionUrl = `${publicApiUrl()}/api/sinav-service-billing/v1/public/fake-3ds/${paymentCode}?t=${pageToken(paymentCode)}`;
      return { providerPaymentId: `fake_${paymentCode}`, status: 'requires_action', actionUrl, card: meta, token };
    },
    verifyEvent({ paymentCode, event }) {
      const d = event?.decision;
      return (d === 'approve' || d === 'reject') && safeEq(event?.sig, sign(paymentCode, d));
    },
    async retrieve({ paymentCode, event, context }) {
      if (!this.verifyEvent({ paymentCode, event })) throw new DomainError('BILLING_CALLBACK_SIGNATURE_INVALID', 'Invalid callback signature', null, 403);
      const card = context?.card || null;
      if (event.decision === 'reject') return { status: 'failed', failureCode: '3ds_failed', failureReasonKey: FAILURE['3ds_failed'], card };
      const f = failureFor(card?.last4);
      if (f) return { status: 'failed', ...f, card };
      return { status: 'succeeded', card, token: context?.token || null };
    },
    async charge({ token, idempotencyKey }) {
      const last4 = /^fake_tok_(\d{4})_/.exec(token || '')?.[1];
      if (!last4) return { status: 'failed', providerPaymentId: null, failureCode: 'generic', failureReasonKey: FAILURE.generic };
      const f = failureFor(last4, { renewal: true });
      const providerPaymentId = `fake_chg_${String(idempotencyKey || randId()).replace(/[^A-Za-z0-9_:-]/g, '').slice(0, 60)}`;
      return f ? { status: 'failed', providerPaymentId, ...f } : { status: 'succeeded', providerPaymentId };
    },
    async tokenizeCard(card) {
      const meta = normalizeCard(card);
      return { token: newToken(meta.last4), card: meta };
    },
    sign,
  };
};

/** Sahte 3D Secure HTML sayfası (basit form; Onayla/Reddet). */
export const renderThreeDsPage = ({ provider, payment, planName, apiBase, json }) => {
  const code = payment.code;
  const act = (decision) => `${apiBase}/api/sinav-service-billing/v1/public/payments/${code}/callback${json ? '?json=1' : ''}`;
  const btn = (decision, label, style) => `<form method="post" action="${esc(act(decision))}" style="margin:0">
<input type="hidden" name="decision" value="${decision}"><input type="hidden" name="sig" value="${esc(provider.sign(code, decision))}">
<button type="submit" style="${style}">${label}</button></form>`;
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>3D Secure (sahte)</title></head>
<body style="margin:0;background:#F4F6F5;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#13232A">
<main style="max-width:420px;margin:48px auto;padding:0 16px"><div style="background:#fff;border:1px solid #DAE1E0;border-radius:16px;padding:24px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;color:#B4231B;font-weight:700">SAHTE BANKA SAYFASI · YALNIZ GELİŞTİRME</p>
<h1 style="margin:0 0 12px;font-size:20px">3D Secure doğrulama</h1>
<p style="margin:0 0 4px">${esc(planName)}</p><p style="margin:0 0 20px;font-size:24px;font-weight:700">${esc(fmtMoney(payment.amount))}</p>
<div style="display:flex;gap:12px">${btn('approve', 'Onayla', 'background:#0E6A6E;color:#fff;border:0;border-radius:12px;padding:12px 20px;font-size:16px;font-weight:600;cursor:pointer')}
${btn('reject', 'Reddet', 'background:#fff;color:#13232A;border:1px solid #DAE1E0;border-radius:12px;padding:12px 20px;font-size:16px;font-weight:600;cursor:pointer')}</div>
</div></main></body></html>`;
};
