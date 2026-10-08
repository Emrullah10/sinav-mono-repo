import { serverError, serviceUnavailable } from '../api/errors.js';

// Servisler arası (internal) HTTP çağrılarının TEK yardımcısı — denetim #21.
//
// ── NEDEN ───────────────────────────────────────────────────────────────────
// Identity'ye giden çağrıların çoğunda zaman aşımı yoktu ve bir kısmı çağıranın
// AÇIK transaction'ı ve satır kilitleri içinde yapılıyordu (plan kapısı yayında
// RFQ+tender kilidi altında, depolama kapısı belge yüklemede RFQ kilidi altında).
// Identity askıda kalınca aynı RFQ'daki teklif gönderimleri de askıda kalıyordu.
// Caller header bloğu da dört yerde kopyaydı.
//
// Kural:
//   • Her çağrı `AbortSignal.timeout` ile sınırlanır (varsayılan süreler aşağıda,
//     env ile ayarlanır).
//   • Zaman aşımı VE ağ hatası (ECONNREFUSED, DNS) aynı şekilde yükselir:
//     `INTERNAL_SERVICE_UNAVAILABLE` (503, yeniden denenebilir). Çağıran kendi
//     alan koduna çevirebilir (`isInternalUnavailable`).
//   • HTTP yanıtı (2xx dışı dahil) OLDUĞU GİBİ döner; yorumlamak çağıranın işi.

export const INTERNAL_TIMEOUTS = Object.freeze({
  // Yazma kapıları (plan niteliği): kullanıcı bekler, kısa tut.
  gate: () => Number(process.env.PLAN_GATE_TIMEOUT_MS) || 3000,
  // Atomik kullanım sayacı (anlaşma/revizyon hakkı): identity yazıyor.
  usage: () => Number(process.env.IDENTITY_USAGE_TIMEOUT_MS) || 5000,
  // Commit sonrası best-effort çağrılar (referral, keşif bitişi, push): yanıtı
  // bu süreden fazla bekletmemeli.
  bestEffort: () => Number(process.env.INTERNAL_BEST_EFFORT_TIMEOUT_MS) || 2000,
});

export const INTERNAL_UNAVAILABLE = 'INTERNAL_SERVICE_UNAVAILABLE';

export const isInternalUnavailable = (error) => error?.code === INTERNAL_UNAVAILABLE;

/**
 * Gateway'in downstream'e ilettiği caller header'ları + INTERNAL_API_KEY.
 * `caller` yoksa (sistem çağrısı) yalnız anahtar gönderilir.
 */
export const internalHeaders = (caller) => {
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!internalKey) {
    throw serverError('INTERNAL_API_KEY_MISSING', 'INTERNAL_API_KEY env required');
  }
  const headers = { 'Content-Type': 'application/json', 'x-auth-token': internalKey };
  if (!caller) return headers;
  return {
    ...headers,
    userAccountId: String(caller.callerUserId || ''),
    userAccountTenantCode: String(caller.callerTenantCode || ''),
    userAccountOrganizationId: String(caller.callerOrganizationId || ''),
    userAccountRole: caller.callerUserRole || '',
    userAccountOrganizationType: caller.callerOrganizationType || '',
  };
};

/**
 * @param {string} url
 * @param {{method?:string, headers?:object, body?:unknown, timeoutMs:number,
 *          fetchFn?:Function}} opts  `body` nesne ise JSON'a çevrilir.
 * @returns {Promise<Response>}
 */
export const fetchInternal = async (
  url,
  { method = 'GET', headers, body, timeoutMs, fetchFn = globalThis.fetch } = {},
) => {
  if (!(timeoutMs > 0)) throw new Error('fetchInternal: timeoutMs required');
  try {
    return await fetchFn(url, {
      method,
      headers,
      ...(body === undefined
        ? {}
        : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    const err = serviceUnavailable(
      INTERNAL_UNAVAILABLE,
      timedOut
        ? `Internal service did not answer within ${timeoutMs} ms`
        : `Internal service unreachable: ${error?.message || error}`,
      { timedOut },
    );
    err.cause = error;
    throw err;
  }
};

export default { fetchInternal, internalHeaders, isInternalUnavailable, INTERNAL_TIMEOUTS };
