export class ApiError extends Error {
  constructor(code, message, { statusCode = 400, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const make = (statusCode) => (code, message, details) =>
  new ApiError(code, message, { statusCode, details });

export const badRequest = make(400);
export const unauthorized = make(401);
export const paymentRequired = make(402);
export const forbidden = make(403);
export const notFound = make(404);
export const conflict = make(409);
export const gone = make(410);
export const rateLimited = make(429);
export const serverError = make(500);
// 503 — GEÇİCİ ve BİZDEN kaynaklı. 500'den ayrı tutulmasının sebebi teşhis:
// "kodda bir hata var" ile "bağlı olduğumuz bir servis şu an cevap vermiyor"
// aynı şey değil ve ikincisinde doğru davranış TEKRAR DENEMEKTİR. İlk
// kullanıcısı SMS gönderim arızası (`SMS_DISPATCH_FAILED`): sağlayıcı
// ulaşılamazken 500 dönmek kullanıcıya "bizde bir sorun var, bekle" derdi;
// 503 "şimdi olmadı, yeniden dene" der ve arayüz tekrar-dene düğmesini açar.
export const serviceUnavailable = make(503);
