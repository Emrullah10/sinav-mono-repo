import { timingSafeEqual } from 'node:crypto';
import { ok, err } from './envelope.js';
import { ApiError } from './errors.js';
import { getCaller } from '../utils/general.js';

// ── Y3 (guvenlik denetimi 2026-09-05) ──────────────────────────────────────
// Karsilastirma `!==` ile yapiliyordu: erken cikan bir esitlik testi, anahtari
// bayt bayt daraltmaya izin veren bir zamanlama kanali birakir. Ayrica cok
// kisa bir anahtar (yanlis yapilandirma) sessizce kabul ediliyordu.
const MIN_INTERNAL_KEY_LENGTH = 32;

const matchesInternalKey = (presented, expected) => {
  if (typeof presented !== 'string' || presented.length === 0) return false;
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
};

// Wrap an internal-only handler. Same signature as `wrap` but enforces
// `x-auth-token === INTERNAL_API_KEY` header. Service-to-service caller
// authentication; user-facing access blocked.
export const wrapInternal =
  (handler, { successStatus = 200 } = {}) =>
  async (req, res, next) => {
    const expected = process.env.INTERNAL_API_KEY;
    if (!expected) {
      return next(new Error('INTERNAL_API_KEY env required'));
    }
    // ⚠️ Uzunluk kurali YALNIZ URETIMDE. Test/e2e ortamlari bilerek kisa ve
    // okunabilir anahtarlar kullaniyor (`.env.test`); orada kurali dayatmak
    // guvenlige hicbir sey katmadan harness'i kirardi.
    if (
      (process.env.NODE_ENV || 'production') === 'production' &&
      expected.length < MIN_INTERNAL_KEY_LENGTH
    ) {
      return next(
        new Error(
          `INTERNAL_API_KEY en az ${MIN_INTERNAL_KEY_LENGTH} karakter olmali (openssl rand -hex 32)`,
        ),
      );
    }
    if (!matchesInternalKey(req.headers['x-auth-token'], expected)) {
      return res
        .status(401)
        .json(err('INTERNAL_AUTH_REQUIRED', 'Internal authentication required'));
    }
    try {
      // Internal call'larda gateway caller header'larını forward eder; getCaller
      // bunları okur. callerUserId boş olabilir (system call) → isPublic:true.
      const caller = getCaller(req.headers, true);
      const result = await handler(req, caller);
      if (
        result &&
        typeof result === 'object' &&
        Object.prototype.hasOwnProperty.call(result, 'success')
      ) {
        const status = result.__statusCode || successStatus;
        const payload = { ...result };
        delete payload.__statusCode;
        return res.status(status).json(payload);
      }
      return res.status(successStatus).json(ok(result));
    } catch (error) {
      if (error instanceof ApiError) {
        return res
          .status(error.statusCode)
          .json(err(error.code, error.message, error.details));
      }
      return next(error);
    }
  };
