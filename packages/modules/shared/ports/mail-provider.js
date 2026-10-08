import { setMailProvider, createNodemailerProvider } from './mail.js';

// SMTP sağlayıcısının kurulumu — kompozisyon kökünden (boot.js) çağrılır.
//
// ── NEDEN VAR ───────────────────────────────────────────────────────────
// 2026-08-03 ölçümü: `createNodemailerProvider` üretim kodunda HİÇBİR YERDE
// çağrılmıyordu; `setMailProvider` yalnız testlerde geçiyordu. Yani üretimde
// `mail.js`in varsayılanı — BELLEK İÇİ gelen kutusu — aktifti.
//
// Sonucu: uygulama paylaşım e-postaları gönderiliyor
// SANILIYORDU; gerçekte her biri bir JS dizisine yazılıp süreçle birlikte
// yok oluyordu. Hata yok, log yok, kuyruk yok — kullanıcı "paylaşım maili
// gelmedi" dediğinde bakılacak hiçbir iz yoktu.
//
// ⚠️ `create-share.use-case.js`teki "boot.js'teki setMailProvider swap'i zaten
// port seviyesinde etkilidir" yorumu YANLIŞTI: öyle bir çağrı hiç olmadı.
// Yorumun kendinden emin tonu, kimsenin doğrulamamasının sebebi olabilir.
//
// ── BU MODÜL NE YAPAR ───────────────────────────────────────────────────
// Yapılandırma VARSA gerçek SMTP taşıyıcısını kurar. YOKSA bellek içi
// sağlayıcıyı bırakır ama bunu **yüksek sesle** söyler. Asıl kazanç budur:
// sessiz bir kayıp, görünür bir uyarıya dönüşür. Sağlayıcıyı zorunlu kılıp
// servisi açılışta düşürmek daha kötü olurdu — geliştirme ortamında SMTP
// olmaması normaldir ve e-posta hiçbir akışın ön koşulu değildir.
const REQUIRED = 'SMTP_HOST';

export const readMailConfigFromEnv = (env = process.env) => {
  const host = (env[REQUIRED] || '').trim();
  if (!host) return null;
  const port = Number(env.SMTP_PORT || 587);
  return {
    from: env.MAIL_FROM || 'ODAK <no-reply@sinav.local>',
    replyTo: env.MAIL_REPLY_TO || undefined,
    transport: {
      host,
      port,
      // 465 dışında STARTTLS varsayılır; SMTP_SECURE ile açıkça ezilebilir.
      secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
      auth: env.SMTP_USER
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD || '' }
        : undefined,
    },
  };
};

// Yapılandırıldı mı? Gönderim yolları bunu sorup, kurulmamışsa sahte bir
// "gönderildi" kaydı YAZMAMALIDIR (bkz. notification-delivery.js).
let configured = false;
export const isMailConfigured = () => configured;

export const installMailProviderFromEnv = ({
  env = process.env,
  logger = console,
  serviceName = 'service',
} = {}) => {
  const config = readMailConfigFromEnv(env);
  if (!config) {
    configured = false;
    logger.warn(
      `[${serviceName}] ⚠️ ${REQUIRED} tanimsiz — E-POSTA GONDERILMIYOR. ` +
        'mail portu bellek ici saglayiciyla calisiyor: sendMail cagrilari ' +
        'basarili donuyor ama hicbir e-posta cikmiyor. Gercek gonderim icin ' +
        'SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD tanimlayin.',
    );
    return false;
  }
  setMailProvider(createNodemailerProvider(config));
  configured = true;
  logger.log(
    `[${serviceName}] mail saglayicisi kuruldu: ${config.transport.host}:${config.transport.port}`,
  );
  return true;
};

export default installMailProviderFromEnv;
