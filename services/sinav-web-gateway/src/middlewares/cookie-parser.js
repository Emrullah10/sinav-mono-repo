import cookieParser from 'cookie-parser';
import appConfig from 'app-config';

export default function cookiesParser() {
  const secret = appConfig?.cookieSecret || process.env.COOKIE_SECRET;
  if (!secret) {
    throw new Error(
      'COOKIE_SECRET env required (gateway boot fail-fast — signed cookies bağımlı)',
    );
  }
  return cookieParser(secret);
}
