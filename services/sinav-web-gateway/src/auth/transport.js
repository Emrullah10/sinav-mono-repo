// Token taşıma: web = imzalı çerez (+CSRF), mobil = Authorization: Bearer.
import { ACCESS_COOKIE } from './cookies.js';

const bearerFrom = (req) => {
  const h = req.headers?.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
};

// { token, via: 'bearer' | 'cookie' | null }. İkisi birden varsa çağıran 400 vermeli.
const getAccessToken = (req) => {
  const bearer = bearerFrom(req);
  const cookie = req.signedCookies?.[ACCESS_COOKIE] || null;
  if (bearer && cookie) return { token: null, via: null, conflict: true };
  if (bearer) return { token: bearer, via: 'bearer' };
  if (cookie) return { token: cookie, via: 'cookie' };
  return { token: null, via: null };
};

const wantsBearerTransport = (req) =>
  String(req.headers?.['x-auth-transport'] || '').toLowerCase() === 'bearer';

const clientInfo = (req) => ({
  clientType: wantsBearerTransport(req) ? 'mobile' : 'web',
  deviceId: String(req.headers?.['x-device-id'] || '').slice(0, 64),
  appVersion: String(req.headers?.['x-client'] || '').slice(0, 40),
});

export { bearerFrom, getAccessToken, wantsBearerTransport, clientInfo };
