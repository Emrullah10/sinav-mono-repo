// Gateway açılış doğrulamaları — SESSİZCE YANLIŞ olabilecek yapılandırmalar.
//
// Buradaki kontrollerin ortak yanı şu: hepsi, hata verirse hiçbir yerde
// görünmeyen ama davranışı değiştiren değerleri hedefler. Açılışı düşürmek
// bilinçli: yanlış bir oturum ömrü ya da yayında olan bir örnek sır, ancak
// birileri fark ederse düzelir ve genelde kimse fark etmez.

// ── OTURUM SÜRELERİ: BİRİM SESSİZCE KAYBOLUYORDU (2026-09-05) ─────────────
//
// Üretim env'i `ACCESS_TOKEN_EXPIRY='2880m'` ve `REFRESH_TOKEN_EXPIRY='1440m'`
// taşıyordu. `12factor-config` `integer` tipinde soneki SESSİZCE atıyor:
// '2880m' → 2880. Yani dakika sanılan değerler SANİYE olarak okundu ve oturum
// ömrü 24 saate değil 24 DAKİKAYA düştü. Hiçbir yerde hata çıkmadı; belirti
// yalnızca "kullanıcılar sürekli çıkış yapıyor" olurdu.
export const DURATION_ENVS = ['ACCESS_TOKEN_EXPIRY', 'REFRESH_TOKEN_EXPIRY', 'MOBILE_REFRESH_TOKEN_EXPIRY'];

export const assertDurationEnvsAreSeconds = (env = process.env) => {
  for (const name of DURATION_ENVS) {
    const raw = env[name];
    if (raw === undefined || String(raw).trim() === '') continue;
    if (!/^\d+$/.test(String(raw).trim())) {
      throw new Error(
        `${name}='${raw}' — bu deger SANIYE cinsinden tam sayi olmali. ` +
          "Sonek (ornegin '2880m') sessizce atilir ve deger 60 kat kucuk okunur.",
      );
    }
  }
};

// ⚠️ Yenileme jetonu erişim jetonundan KISA olamaz: oturum, erişim jetonu hâlâ
// geçerliyken ölür. Üretimde tam bu durumdaydı (access 2880s, refresh 1440s).
export const assertRefreshOutlivesAccess = (config) => {
  const access = Number(config?.accessTokenExpiry);
  const refresh = Number(config?.refreshTokenExpiry);
  if (!Number.isFinite(access) || !Number.isFinite(refresh)) return;
  if (refresh <= access) {
    throw new Error(
      `REFRESH_TOKEN_EXPIRY (${refresh}s) ACCESS_TOKEN_EXPIRY'den (${access}s) ` +
        'kisa ya da esit olamaz: oturum, erisim jetonu hala gecerliyken oluyor.',
    );
  }
};

// ── Y2 — SIZMIS ORNEK SIRLAR ──────────────────────────────────────────────
//
// `.env.example` 2026-04-19'dan 2026-09-05'e kadar bu dört değeri gerçek
// görünümlü 64-hex olarak taşıdı; repoya erişen herkes onları gördü. Dosyadan
// silmek yetmez: üretim aynı değerleri kullanıyor olabilir ve kimse fark
// etmezdi. Denylist KODDA durur — tek işi bu değerlerden birinin canlıya
// çıkmasını AÇILIŞI DÜŞÜREREK görünür kılmaktır.
export const KNOWN_EXAMPLE_SECRETS = new Map([
  ['e44e8c8f9f8b6b31a9838ff01a9c2d7253cee99c6ea9901abe3fdd3d071d5ed2', 'INTERNAL_API_KEY'],
  ['6167873618c4eeadf0f5396dc615b13162920b4e5500aac3277c310cfa9b6a63', 'OPENAPI_UI_KEY'],
  ['1d6d3e520e9a85799f7997a26de34e9d95e13febb754903f77bdc8787f8846b7', 'COOKIE_SECRET'],
  ['327d2029f6f1dfc375dbfa730996527f851e9fbd2b5a0b9b02019d522e228d9c', 'OTP_PEPPER'],
]);

export const assertNoLeakedExampleSecret = (name, env = process.env) => {
  const value = env[name];
  if (value && KNOWN_EXAMPLE_SECRETS.has(value)) {
    throw new Error(
      `${name} degeri repodaki .env.example dosyasinda YILLARDIR YAYINDA olan bir ` +
        'ornek degerdir ve gizli sayilamaz. `openssl rand -hex 32` ile yenisini uretin.',
    );
  }
};

export default {
  DURATION_ENVS,
  KNOWN_EXAMPLE_SECRETS,
  assertDurationEnvsAreSeconds,
  assertRefreshOutlivesAccess,
  assertNoLeakedExampleSecret,
};
