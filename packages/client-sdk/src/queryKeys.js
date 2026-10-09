// React Query anahtarları: kararlı diziler ['<alan>', '<eylem>', params].
export const queryKeys = {
  auth: { me: () => ['auth', 'me'] },
  account: { get: () => ['account', 'get'], prefs: () => ['account', 'prefs'], notif: () => ['account', 'notificationPrefs'], consents: () => ['account', 'consents'] },
  billing: {
    products: () => ['billing', 'products'], campaign: (key) => ['billing', 'campaign', key], entitlements: () => ['billing', 'entitlements'],
    profile: () => ['billing', 'profile'], subscription: () => ['billing', 'subscription'], cancelOffers: (reason) => ['billing', 'cancelOffers', reason],
    payment: (code) => ['billing', 'payment', code], paymentMethods: () => ['billing', 'paymentMethods'], invoices: () => ['billing', 'invoices'],
    installments: (priceKey, bin) => ['billing', 'installments', priceKey, bin],
  },
};
