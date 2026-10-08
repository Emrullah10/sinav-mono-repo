import { DomainError } from 'app-shared';
import { makeFakePaymentProvider } from './payment-fake.js';
import { makeIyzicoPaymentProvider } from './payment-iyzico.js';

/**
 * Ödeme sağlayıcı PORTU (adaptör arayüzü). Her adaptör şunları döndürür:
 *
 *   name                      'fake' | 'iyzico'  (billing.payment.provider enum değeri)
 *   createPayment(input)      → { providerPaymentId, status:'requires_action', actionUrl, card? }
 *       input: { paymentCode, amount, currency, installmentCount, card?, buyer:{id,email,name}, returnUrl }
 *   retrieve(input)           → { status:'succeeded'|'failed', failureCode?, failureReasonKey?, card?, token? }
 *       input: { providerPaymentId, paymentCode, event:{decision,sig}, context:{...payment.metadata} }
 *       (webhook/callback olayını sağlayıcıdan okur/doğrular; sahte adaptörde olay HMAC ile imzalıdır)
 *   charge(input)             → { status:'succeeded'|'failed', providerPaymentId, failureCode?, failureReasonKey? }
 *       input: { token, amount, currency, installmentCount, idempotencyKey, description }   (kayıtlı kartla yenileme)
 *   verifyEvent(input)        → boolean   (callback imzası)
 *   tokenizeCard?(card)       → { token, card:{brand,last4,expMonth,expYear,holder} }   (kart ekleme; yalnız fake)
 *
 * `PAYMENT_PROVIDER` ortam değişkeni adaptörü seçer. Üretimde `fake` ile AÇILIŞ REDDEDİLİR.
 */
const REQUIRED = ['createPayment', 'retrieve', 'charge', 'verifyEvent'];

export const assertPaymentConfig = (env = process.env) => {
  const provider = String(env.PAYMENT_PROVIDER || (env.NODE_ENV === 'production' ? 'iyzico' : 'fake')).toLowerCase();
  if (!['fake', 'iyzico'].includes(provider)) throw new Error(`PAYMENT_PROVIDER geçersiz: ${provider}`);
  if (provider === 'fake' && env.NODE_ENV === 'production') {
    throw new Error('PAYMENT_PROVIDER=fake ile NODE_ENV=production birlikte AÇILAMAZ (sahte ödeme sağlayıcısı üretimde yasak)');
  }
  if (provider === 'fake' && !env.PAYMENT_FAKE_SECRET) throw new Error('PAYMENT_FAKE_SECRET env gerekli (PAYMENT_PROVIDER=fake)');
  return provider;
};

export const buildPaymentProvider = (env = process.env) => {
  const name = assertPaymentConfig(env);
  const impl = name === 'fake' ? makeFakePaymentProvider({ secret: env.PAYMENT_FAKE_SECRET }) : makeIyzicoPaymentProvider(env);
  for (const m of REQUIRED) if (typeof impl[m] !== 'function') throw new DomainError('PAYMENT_PROVIDER_NOT_CONFIGURED', `adaptör ${m} eksik`);
  return Object.freeze(impl);
};
