import crypto from 'crypto';
import appConfig from 'app-config';

// Lazy okuma: appConfig main.js'te createAppConfig() sonrası dolar (saniye).
const refreshTtlSeconds = () => appConfig.refreshTokenExpiry;
const mobileRefreshTtlSeconds = () =>
  Number(process.env.MOBILE_REFRESH_TOKEN_EXPIRY) || 5184000;
const refreshTtlFor = (clientType) =>
  clientType === 'mobile' ? mobileRefreshTtlSeconds() : refreshTtlSeconds();

const generateRefreshToken = () => {
  const token = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
};

const hashRefreshToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

export { generateRefreshToken, hashRefreshToken, refreshTtlSeconds, mobileRefreshTtlSeconds, refreshTtlFor };
