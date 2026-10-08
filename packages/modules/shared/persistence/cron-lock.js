import { randomUUID } from 'node:crypto';

// ÇOK-PROCESS'Lİ KOŞUYA KARŞI KİLİT.
//
// Aynı sweep iki process'te birden koşarsa aynı kayıtlar iki kez taranır.
// Kilit BEST-EFFORT: Redis yoksa iş YİNE KOŞAR — bu bir güvenlik sınırı
// değil, gürültü azaltıcıdır. Gerçek güvence her zaman sorgunun kendisinde
// olmalı (koşullu UPDATE / kira), kilitte değil.
//
// ⚠️ 2026-09-10: bu fonksiyon `service-identity/src/boot.js` içinde yaşıyordu
// ve `service-rfq` üçüncü kopyayı açmak üzereydi. Buraya taşındı; ikinci
// kopya çıkmadan önce paylaşıma alınması bilinçli. (Denetim #55: identity
// kopyası 2026-09-23'te kaldırıldı, o da bunu kullanır.)
//
// ── SAHİPLİ BIRAKMA (denetim #55) ───────────────────────────────────────────
// Eskiden `finally` koşulsuz `DEL key` yapıyordu. İş TTL'den uzun sürerse
// kilidin süresi dolar, ikinci process kilidi alır; birincinin `finally`'si
// sonra İKİNCİNİN kilidini siler ve üçüncü bir koşuya kapı açardı. Artık
// değer süreç başına rastgele bir jetondur ve yalnız jeton eşleşirse silinir
// (Lua ile atomik karşılaştır-ve-sil).
const RELEASE_LUA = `if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end`;

export const makeWithCronLock = (datasources, logger = console) =>
  async (key, ttlSeconds, fn) => {
    const client = datasources?.serviceDiscoveryRedis?.client;
    if (!client) return fn();
    const token = randomUUID();
    let acquired = false;
    try {
      acquired = (await client.set(key, token, 'EX', ttlSeconds, 'NX')) === 'OK';
    } catch (error) {
      logger.warn?.(`[cron-lock] ${key} alinamadi (${error?.message}) — kilitsiz kosuluyor.`);
      return fn();
    }
    if (!acquired) {
      logger.warn?.(`[cron-lock] ${key} baska bir process'te kosuyor — atlandi.`);
      return null;
    }
    try {
      return await fn();
    } finally {
      await client.eval(RELEASE_LUA, 1, key, token).catch(() => null);
    }
  };

export default makeWithCronLock;
