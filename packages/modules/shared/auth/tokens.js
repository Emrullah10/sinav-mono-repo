import crypto from 'node:crypto';

// JWT issue/verify helper'ları kaldırıldı — gateway kendi RS256 imzasını
// `services/sinav-web-gateway/src/auth/jwt.js`'te yönetiyor. Burada sadece
// OTP-spesifik primitive'ler kalır (identity service tüketir).

// OTP_PEPPER = OTP hash'inin HMAC gizli anahtarı. Production'da gerçek bir
// değer zorunlu; eksikse ilk OTP işleminde fail-fast (fail-closed). Dev'de
// geliştirme kolaylığı için default'a düşer. (app-shared birçok serviste
// import edildiğinden module-load yerine lazy throw — yalnızca OTP yolunu
// etkiler, ilgisiz servisleri çökertmez.)
const getOtpPepper = () => {
  const pepper = process.env.OTP_PEPPER;
  if (pepper) return pepper;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('OTP_PEPPER env required (identity fail-fast)');
  }
  return 'dev-otp-pepper';
};

// HMAC-SHA256 (anahtarlı) — düz unsalted SHA-256 değil. Pepper gizli kaldığı
// sürece, DB/log sızıntısında 10^6'lık OTP uzayı offline kırılamaz.
export const hashOtp = (phone, code) =>
  crypto
    .createHmac('sha256', getOtpPepper())
    .update(`${phone}:${code}`)
    .digest('hex');

// 6 haneli OTP. `crypto.randomInt` — `Math.random` DEĞİL: ikincisi CSPRNG
// değildir ve durumu gözlemlenebildiği için üretilen kodlar tahmin edilebilir
// hale gelir; bir OTP'nin 10^6'lık uzayı ancak gerçekten rastgeleyse anlamlı.
// `padStart` şart: 0-99999 arası değerler 6 haneye tamamlanmazsa hem kod
// kısalır hem uzay 10 kat daralır.
//
// ⚠️ 2026-09-01'e kadar burası sabit '123456' döndürüyordu ("DEV: sabit OTP —
// geri al"). Gerçek SMS sağlayıcısı devreye alınırken düzeltildi; o güne kadar
// üretilen HER kod aynıydı.
//
// ⚠️ BU TEK BAŞINA GİRİŞİ GÜVENLİ YAPMAZ. `verify-otp.use-case.js`'teki
// `if (otp === '123456')` arka kapısı (bug-790 / bug-1917) hâlâ açık ve her
// telefon için koşulsuz oturum açıyor. Ayrı bir tur bekliyor.
//
// Geçici: e-posta kanalı (SMTP) kurulana kadar OTP_STATIC_CODE ile sabit kod.
// İKİ ANAHTAR (ARCHITECTURE §13 madde 6): kod env'de AÇIKÇA verilmeli VE
// SMTP_HOST tanımsız olmalı. SMTP bağlanınca bu yol kendiliğinden kapanır.
// Kod sabit olduğu için e-postasını bilen herkes o hesaba girebilir; yalnız
// canlıya açılmadan önceki test dönemi içindir.
let staticOtpWarned = false;
const staticOtpCode = () => {
  const code = (process.env.OTP_STATIC_CODE || '').trim();
  if (!/^\d{6}$/.test(code)) return null;
  if ((process.env.SMTP_HOST || '').trim()) return null;
  if (!staticOtpWarned) {
    staticOtpWarned = true;
    console.warn('[otp] ⚠️ OTP_STATIC_CODE aktif: SMTP yok, tüm kodlar sabit. Canlıya açmadan önce kaldır.');
  }
  return code;
};

export const generateOtpCode = () =>
  staticOtpCode() ?? String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

export const randomToken = (bytes = 32) =>
  crypto.randomBytes(bytes).toString('base64url');
