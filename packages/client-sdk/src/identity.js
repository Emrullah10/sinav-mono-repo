// identity servisi uçları. `http` axios benzeri örnek (get/post/put/patch/delete). Dönüş: axios yanıtı; gövde { success, data }.
export const createIdentityApi = (http, { api = '/api' } = {}) => {
  const B = `${api}/sinav-service-identity/v1`;
  return {
    identityPing: () => http.get(`${B}/public/ping`),
    identityAuthGuest: (body, config) => http.post(`${B}/auth/guest`, body || {}, config),
    identityAuthSendCode: (body) => http.post(`${B}/auth/email/code`, body),
    identityAuthVerifyCode: (body, config) => http.post(`${B}/auth/email/verify`, body, config),
    identityAuthPasswordLogin: (body, config) => http.post(`${B}/auth/password/login`, body, config),
    identityAuthPasswordResetRequest: (body) => http.post(`${B}/auth/password/reset/request`, body),
    identityAuthPasswordResetConfirm: (body) => http.post(`${B}/auth/password/reset/confirm`, body),
    identityAuthRegister: (body, config) => http.post(`${B}/auth/register`, body, config),
    identitySessionSwitch: (body, config) => http.post(`${B}/session/switch`, body, config),
    identityAccountGet: () => http.get(`${B}/account`),
    identityAccountUpdate: (body) => http.patch(`${B}/account`, body),
    identityAccountPasswordSet: (body) => http.put(`${B}/account/password`, body),
    identityAccountDeletionCode: () => http.post(`${B}/account/deletion/code`, {}),
    identityAccountDeletionRequest: (body) => http.post(`${B}/account/deletion`, body),
    identityDataExportRequest: () => http.post(`${B}/account/data-export`, {}),
    identityDataExportGet: () => http.get(`${B}/account/data-export`),
    identityMembershipsList: () => http.get(`${B}/memberships`),
    identityPreferencesGet: () => http.get(`${B}/preferences`),
    identityPreferencesUpdate: (body) => http.patch(`${B}/preferences`, body),
    identityNotificationPrefsGet: () => http.get(`${B}/notification-preferences`),
    identityNotificationPrefsUpdate: (body) => http.patch(`${B}/notification-preferences`, body),
    identityDeviceRegister: (body) => http.post(`${B}/devices`, body),
    identityDeviceRemove: (body) => http.post(`${B}/devices/remove`, body),
    identityConsentsList: () => http.get(`${B}/consents`),
    identityConsentRecord: (body) => http.post(`${B}/consents`, body),
    identityNotificationsList: (params) => http.get(`${B}/notifications`, { params }),
    identityNotificationOpened: (code) => http.post(`${B}/notifications/${code}/opened`, {}),
    identityContactSend: (body) => http.post(`${B}/contact-messages`, body),
    identityPublicContactSend: (body) => http.post(`${B}/public/contact-messages`, body),
    // Geri bildirim: { kind, message, screen, platform, appVersion, locale, context, attachments: [{ data(base64), durationMs?, source? }] }.
    identityFeedbackSend: (body, config) => http.post(`${B}/feedback`, body, config),
    identityCmsFeedbackList: (params) => http.get(`${B}/cms/feedback`, { params }),
    identityCmsFeedbackGet: (code) => http.get(`${B}/cms/feedback/${code}`),
    identityCmsFeedbackUpdate: (code, body) => http.patch(`${B}/cms/feedback/${code}`, body),
    /** <img>/<audio> kaynağı (web çerezle yetkilenir). */
    identityCmsFeedbackAttachmentUrl: (code, index) => `${B}/cms/feedback/${code}/attachments/${index}`,
    identityPublicWaitlistJoin: (body) => http.post(`${B}/public/waitlist`, body),
    identityPublicLegalList: (params) => http.get(`${B}/public/legal-documents`, { params }),
    identityPublicLegalGet: (type, params) => http.get(`${B}/public/legal-documents/${type}`, { params }),
  };
};
export default createIdentityApi;
