import helper from 'app-helper';
import appConfig from 'app-config';
export default function logMiddleware() {
  return (req, res, next) => {
    // ⚠️ QUERY STRING LOGLANMAZ (D6, 2026-09-05). Ödeme callback token'ları ve
    // paylaşım token'ları query'de dolaşabiliyor; erişim logu onları kalıcı
    // hâle getirirdi. Yol yeterli bilgiyi zaten veriyor.
    helper.log.info([
      req.method,
      String(req.url || '')
        .split('?')[0]
        .replace(appConfig.basePathPrefix, '')
        .replace(appConfig.basePath, ''),
      req.headers['x-forwarded-for'] || req.headers.remoteAddress,
    ]);
    next();
  };
}
