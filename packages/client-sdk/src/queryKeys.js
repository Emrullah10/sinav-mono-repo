// React Query anahtarları: kararlı diziler ['<alan>', '<eylem>', params].
export const queryKeys = {
  auth: { me: () => ['auth', 'me'] },
  account: { get: () => ['account', 'get'], prefs: () => ['account', 'prefs'], notif: () => ['account', 'notificationPrefs'], consents: () => ['account', 'consents'] },
};
