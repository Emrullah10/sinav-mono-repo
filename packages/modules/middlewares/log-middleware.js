import appConfig from 'app-config';
import helper from 'app-helper';

export default function logMiddleware() {
  return (req, res, next) => {
    helper.log.info([
      req.method,
      req.url
        .replace(appConfig.basePathPrefix, '')
        .replace(appConfig.basePath, ''),
      req.headers['x-forwarded-for'] || req.headers.remoteAddress,
    ]);
    next();
  };
}
