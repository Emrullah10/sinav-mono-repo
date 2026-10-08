import { ok, err } from './envelope.js';
import { ApiError } from './errors.js';
import { getCaller } from '../utils/general.js';

// Wrap a (req, caller) => data handler into an Express (req,res,next) route.
// Handlers may return either a plain payload (wrapped into `ok`) or a full
// envelope ({ success, data } / { success, error }) to control shape.
export const wrap =
  (handler, { isPublic = false, successStatus = 200 } = {}) =>
  async (req, res, next) => {
    try {
      const caller = getCaller(req.headers, isPublic);
      // ⚠️ ÜÇÜNCÜ ARGÜMAN `res`: handler'ların ezici çoğunluğu (req, caller)
      // imzasını kullanır ve bunu görmezden gelir. Yalnız gövdeye SIĞMAYAN bir
      // şey yazması gereken uçlar (ör. kart saklamada tarayıcı bağlama çerezi)
      // buna ihtiyaç duyuyor; alternatif o rotayı `wrap` dışına çıkarıp hata
      // çevirisini de kaybetmekti.
      const result = await handler(req, caller, res);
      // ⚠️ HANDLER YANITI KENDİSİ YAZDIYSA BURADA DURULUR. Üçüncü argüman
      // (`res`) zaten veriliyordu, ama zarfa SIĞMAYAN bir gövde (CSV indirme,
      // dosya akışı) yazan bir handler `undefined` döndüğünde aşağıdaki
      // `res.json(ok(undefined))` "Cannot set headers after they are sent"
      // ile patlardı — yani affordance yarımdı. Zarf yolu tek satır sonra
      // aynen devam ediyor; başlık göndermeyen hiçbir mevcut route etkilenmez
      // (çerez yazmak `headersSent`'i true YAPMAZ).
      if (res.headersSent) return undefined;
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
      if (error?.name && /ValidationError$/.test(error.name)) {
        return res
          .status(400)
          .json(err('VALIDATION_ERROR', error.message, error.context));
      }
      if (error?.name && /NotFoundError$/.test(error.name)) {
        return res
          .status(404)
          .json(err('NOT_FOUND', error.message, error.context));
      }
      return next(error);
    }
  };
