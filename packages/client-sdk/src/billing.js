// billing servisi uçları (docs/api/billing.md). `http` axios benzeri örnek. Gövde: { success, data }.
export const createBillingApi = (http, { api = '/api' } = {}) => {
  const B = `${api}/sinav-service-billing/v1`;
  return {
    // Herkese açık (oturumsuz)
    billingPublicProductsList: () => http.get(`${B}/public/products`),
    billingPublicCampaignGet: (key) => http.get(`${B}/public/campaigns/${key}`),
    // Haklar
    billingEntitlementsGet: () => http.get(`${B}/entitlements`),
    // Ödeme
    billingProfileGet: () => http.get(`${B}/billing-profile`),
    billingProfileSave: (body) => http.put(`${B}/billing-profile`, body),
    billingCouponValidate: (body) => http.post(`${B}/coupons/validate`, body),
    billingInstallmentsList: (params) => http.get(`${B}/installments`, { params }),
    /** headers: { 'Idempotency-Key': uuid } önerilir. */
    billingCheckout: (body, config) => http.post(`${B}/checkout`, body, config),
    billingPaymentGet: (code) => http.get(`${B}/payments/${code}`),
    billingPaymentCancel: (code) => http.post(`${B}/payments/${code}/cancel`, {}),
    // Abonelik
    billingSubscriptionGet: () => http.get(`${B}/subscription`),
    billingCancelOffersList: (reason) => http.get(`${B}/subscription/cancel-offers`, { params: { reason } }),
    billingOfferAccept: (offerKey, body, config) => http.post(`${B}/subscription/offers/${offerKey}/accept`, body || {}, config),
    billingSubscriptionCancel: (body) => http.post(`${B}/subscription/cancel`, body),
    billingSubscriptionResume: () => http.post(`${B}/subscription/resume`, {}),
    /** Mağaza satın almasından/geri yüklemeden sonra çağrılır: RevenueCat durumunu okuyup erişimi hemen açar. → { synced, active, tier, validUntil } */
    billingStoreSync: () => http.post(`${B}/store/sync`, {}),
    // Ödeme yöntemleri ve faturalar
    billingPaymentMethodsList: () => http.get(`${B}/payment-methods`),
    billingPaymentMethodAdd: (body) => http.post(`${B}/payment-methods`, body),
    billingPaymentMethodRemove: (code) => http.delete(`${B}/payment-methods/${code}`),
    billingPaymentMethodDefault: (code) => http.post(`${B}/payment-methods/${code}/default`, {}),
    billingInvoicesList: () => http.get(`${B}/invoices`),
    /** text/html makbuz; `format: 'json'` ile veri. */
    billingInvoiceDocumentGet: (code, params) => http.get(`${B}/invoices/${code}/pdf`, { params }),
  };
};
export default createBillingApi;
