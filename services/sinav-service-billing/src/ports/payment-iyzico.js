import { DomainError } from 'app-shared';

// ──────────────────────────────────────────────────────────────────────────────
// NOT CONFIGURED STUB — iyzico adaptörü HENÜZ YAZILMADI.
// Gerçek entegrasyon (iyzico checkout/3DS, webhook imzası, saklı kart tokenı) bu dosyada
// `payment.js` arayüzüne uygun yazılacak. O zamana kadar her çağrı 503 PAYMENT_PROVIDER_NOT_CONFIGURED döner.
// ──────────────────────────────────────────────────────────────────────────────
const notConfigured = () => {
  throw new DomainError('PAYMENT_PROVIDER_NOT_CONFIGURED', 'iyzico payment provider is not configured yet');
};

export const makeIyzicoPaymentProvider = () => ({
  name: 'iyzico',
  createPayment: async () => notConfigured(),
  retrieve: async () => notConfigured(),
  charge: async () => notConfigured(),
  verifyEvent: () => false,
});
