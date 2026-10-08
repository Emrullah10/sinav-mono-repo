import datasources from 'app-datasource';

// Oturum deposunun ANAHTAR ŞEMASI ve iptal işlemleri.
//
// ── NEDEN PAYLAŞILAN BİR MODÜL ──────────────────────────────────────────
// Oturumlar `serviceDiscoveryRedis`te yaşar ve şemayı bugüne dek YALNIZ
// gateway biliyordu (`src/auth/session.js` içinde satır içi). 2026-08-03'te
// identity servisinin de oturum iptal etmesi gerekti (organizasyon askıya
// alınınca). Şemayı ikinci bir yere KOPYALAMAK, bu oturumda tekrar tekrar
// avlanan kusur sınıfını üretirdi: iki uç birbirinden habersiz ayrışır ve
// "iptal ettim" diyen kod aslında başka bir anahtarı siler — sessizce.
//
// Bu yüzden anahtarlar TEK yerde tanımlı; gateway de identity de buradan alır.
//
// ⚠️ Anahtar adları DEĞİŞTİRİLİRSE mevcut tüm oturumlar bir anda "yok" olur
// (kullanıcılar atılır). Değiştirmek gerekirse geçiş planı şart.
export const sessionKey = (sid) => `session:${sid}`;
export const refreshIdxKey = (hash) => `refreshIdx:${hash}`;
export const userSessionsKey = (userId) => `userSessions:${userId}`;
export const jtiBlacklistKey = (jti) => `jtiBlacklist:${jti}`;
export const roleSessionsKey = (role) => `roleSessions:${role}`;

const client = () => datasources.serviceDiscoveryRedis?.client;

// Tek bir oturumu yok eder. Gateway'in `revokeSession`'ı ile AYNI adımlar:
// refresh index, session hash, kullanıcı ve rol kümelerinden çıkarma.
export const revokeSessionById = async ({ sid, userId, role, redis = client() }) => {
  if (!redis || !sid) return false;
  const session = await redis.hgetall(sessionKey(sid));
  const pipe = redis.multi();
  if (session?.refreshHash) pipe.del(refreshIdxKey(session.refreshHash));
  pipe.del(sessionKey(sid));
  const uId = userId || session?.userId;
  if (uId) pipe.srem(userSessionsKey(uId), sid);
  const r = role || session?.role;
  if (r) pipe.srem(roleSessionsKey(r), sid);
  await pipe.exec();
  return true;
};

// Bir kullanıcının TÜM oturumlarını yok eder.
export const revokeAllSessionsForUser = async ({ userId, redis = client() }) => {
  if (!redis || !userId) return 0;
  const sids = await redis.smembers(userSessionsKey(userId));
  for (const sid of sids) {
    await revokeSessionById({ sid, userId, redis });
  }
  await redis.del(userSessionsKey(userId));
  return sids.length;
};

// Birden çok kullanıcının oturumlarını yok eder (organizasyon askıya alınması).
//
// ⚠️ BEST-EFFORT ve HATA YUTAR. Gerekçe: iptal, askıya alma işleminin YAN
// ETKİSİDİR. Redis erişilemezse organizasyonun askıya alınması yine de
// gerçekleşmeli — aksi halde bir altyapı arızası, platformun bir kötüye
// kullanımı durdurmasını engellerdi. Yutulan hata çağıranın döndürdüğü sayıda
// görünür (iptal edilen oturum sayısı 0 kalır).
export const revokeSessionsForUsers = async ({ userIds = [], redis = client() }) => {
  let revoked = 0;
  for (const userId of userIds) {
    try {
      revoked += await revokeAllSessionsForUser({ userId, redis });
    } catch {
      // yut — bkz. yukarıdaki gerekçe
    }
  }
  return revoked;
};

export default {
  sessionKey,
  refreshIdxKey,
  userSessionsKey,
  jtiBlacklistKey,
  roleSessionsKey,
  revokeSessionById,
  revokeAllSessionsForUser,
  revokeSessionsForUsers,
};
