// Oturumun bittiğini gösteren hata kodları (istemci çıkış/yeniden giriş akışı).
export const SESSION_ENDED_CODES = ['SESSION_GONE', 'RT_INVALID', 'RT_REUSED', 'REFRESH_MISSING', 'TOKEN_REVOKED'];
export const apiErrorCode = (error) => error?.response?.data?.error?.code || error?.code || null;
export const apiErrorDetails = (error) => error?.response?.data?.error?.details || null;
