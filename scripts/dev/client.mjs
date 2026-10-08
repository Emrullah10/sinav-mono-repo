// Geliştirme/doğrulama yardımcısı (test değildir): gateway'e bearer taşımayla bağlanan küçük istemci.
//   import { newLearner, loginStaff, api } from './client.mjs'
const GW = process.env.GATEWAY_REST_URL || 'http://127.0.0.1:2000';
const MAIL = process.env.MAILPIT_URL || 'http://127.0.0.1:8025';

export const call = async (token, method, path, body, extra = {}) => {
  const res = await fetch(`${GW}/api/${path.replace(/^\//, '')}`, {
    method,
    headers: { 'content-type': 'application/json', 'X-Auth-Transport': 'bearer', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, data: json?.data, error: json?.error };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const latestCode = async (email, subjectHint = '') => {
  for (let i = 0; i < 20; i += 1) {
    const list = await (await fetch(`${MAIL}/api/v1/messages`)).json();
    const m = (list.messages || []).find((x) => x.To.some((t) => t.Address === email) && x.Subject.includes(subjectHint));
    if (m) { const mm = /(\d{3}) (\d{3})/.exec(m.Subject); if (mm) return mm[1] + mm[2]; }
    await sleep(300);
  }
  throw new Error(`kod e-postası gelmedi: ${email}`);
};

/** Yeni misafir oturumu. */
export const newGuest = async () => {
  const r = await call(null, 'POST', 'sinav-service-identity/v1/auth/guest', {});
  return { token: r.data.auth.accessToken, refreshToken: r.data.auth.refreshToken, user: r.data.user };
};

/** Misafir → kayıtlı öğrenci (e-posta kodu Mailpit'ten okunur). */
export const newLearner = async (email = `ogr${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`, displayName = 'Test Öğrenci') => {
  const g = await newGuest();
  const s = await call(null, 'POST', 'sinav-service-identity/v1/auth/email/code', { email, purpose: 'signup' });
  if (s.status !== 200) throw new Error(JSON.stringify(s.body));
  const code = await latestCode(email, 'Kayıt');
  const r = await call(g.token, 'POST', 'sinav-service-identity/v1/auth/register', { email, code, displayName, consents: [{ type: 'kvkk_notice', granted: true }] });
  if (r.status !== 200) throw new Error(JSON.stringify(r.body));
  return { email, token: r.data.auth.accessToken, refreshToken: r.data.auth.refreshToken, user: r.data.user };
};

/** Seed'deki personel (editör/gözden geçiren/superadmin) e-posta koduyla girer. */
export const loginStaff = async (email) => {
  await call(null, 'POST', 'sinav-service-identity/v1/auth/email/code', { email, purpose: 'login' });
  const code = await latestCode(email, 'Giriş');
  const r = await call(null, 'POST', 'sinav-service-identity/v1/auth/email/verify', { email, code });
  if (r.status !== 200) throw new Error(JSON.stringify(r.body));
  return { email, token: r.data.auth.accessToken, user: r.data.user };
};

export const GATEWAY = GW;
