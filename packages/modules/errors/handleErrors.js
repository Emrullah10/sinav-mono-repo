import init from './responses/error-response.js';
let { ForbiddenError, CsrfError } = init;
const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  SERVER_ERROR: 500,
};

export default {
  HTTP_STATUS,
  unRoutedRouteErrorHandler(app) {
    function handleRouteError(error, req, res, next) {
      console.log(
        'handleRouteError:',
        error,
        'path:',
        req.path,
        'method:',
        req.method,
      );
      try {
        decodeURIComponent(req.path);
      } catch (err) {
        return res
          .status(HTTP_STATUS.SERVER_ERROR)
          .json({ error: err.message });
      }
      // CSRF doğrulama hatası — client'ın tanıyıp tek seferlik kurtarma
      // (refresh + retry) yapabilmesi için 403 + EBADCSRFTOKEN olarak dön.
      // SADECE csrf-csrf'in code'una bakılır; gerçek ForbiddenError'lar yanlış
      // etiketlenmesin diye (bu handler tüm servislerde paylaşılıyor).
      if (error && error.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({
          success: false,
          error: { code: 'EBADCSRFTOKEN', message: 'invalid csrf token' },
        });
      }
      if (req.xhr) {
        return res
          .status(HTTP_STATUS.SERVER_ERROR)
          .json({ error: 'Something failed!' });
      }
      if (error.statusCode == HTTP_STATUS.UNAUTHORIZED) {
        return res
          .status(HTTP_STATUS.UNAUTHORIZED)
          .json({ error: 'Unauthorized' });
      }
      if (error.statusCode == HTTP_STATUS.BAD_REQUEST) {
        return res
          .status(HTTP_STATUS.BAD_REQUEST)
          .json({ error: 'Bad request' });
      }
      if (error.statusCode == HTTP_STATUS.NOT_FOUND) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Not found' });
      }

      res.status(HTTP_STATUS.SERVER_ERROR).json({ error: 'Something failed!' });
    }
    app.use((req, res, next) => {
      const errorContext = {
        path: req.path,
        method: req.method,
      };
      console.error('Service error:', errorContext);
      next({ statusCode: HTTP_STATUS.NOT_FOUND });
    });
    app.use(handleRouteError);
  },
  routeFunctionErrorHandler(errorContext, error, next) {
    console.error('Service error:', errorContext);
    next(error);
  },
  forbiddenErrorHandler(error, req, res, next) {
    if (!error) return next();
    return next(new ForbiddenError(error, req));
  },
  csrfErrorHandler(error, req, res, next) {
    if (!error) return next();
    return next(new CsrfError(error, req));
  },
};
