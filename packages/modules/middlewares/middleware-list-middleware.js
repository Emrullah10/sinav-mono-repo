import bodyParser from './body-parser-middleware.js';
import compression from './compression-middleware.js';
import helmet from './helmet-middleware.js';
import logMiddleware from './log-middleware.js';

export default [bodyParser, compression, helmet, logMiddleware];
