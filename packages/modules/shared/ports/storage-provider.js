import {
  registerStorageProvider,
  setWriteScheme,
  isDurableStorage,
  getWriteScheme,
  getStorageProvider,
} from './storage.js';
import { createPostgresStorageProvider } from './storage-postgres.js';

// Depolama sağlayıcısının kurulumu — kompozisyon kökünden (boot.js) çağrılır.
//
// ── NEDEN VAR ───────────────────────────────────────────────────────────
// 2026-08-20 ölçümü: `setStorageProvider` üretim kodunda HİÇBİR YERDE
// çağrılmıyordu ve S3/GCS adaptörü hiç yazılmamıştı. Yani portun varsayılanı —
// SÜREÇ İÇİ bir `Map` — üretimde aktifti.
//
// Sonucu, `ecosystem.config.js`teki `max_memory_restart: '1G'` ile birleşince:
// PM2 süreci geri döndürdüğünde TÜM DOSYA HAVUZU yok oluyordu. Her deploy da
// aynısını yapıyordu. Postgres'teki metadata satırları hayatta kaldığı için
// belgeler listede görünmeye devam ediyor, yalnız indirilemiyordu.
//
// ⚠️ Bu doküman servisine özgü DEĞİLDİ: aynı port KYC belgelerini, firma
// logolarını, kullanıcı avatarlarını, fatura PDF'lerini, iptal/itiraz
// kanıtlarını ve destek eklerini de taşıyor — hepsi aynı şekilde uçuyordu.
//
// Emsal: mail-provider.js (2026-08-03) — birebir aynı hata sınıfı, aynı çözüm.
//
// ── MAIL'DEN FARKI: BURADA SESSİZ KALMAK YETMEZ ─────────────────────────
// mail-provider.js yapılandırma yoksa uyarı basıp devam eder; e-posta hiçbir
// akışın ön koşulu değildir ve kaybı geri alınabilir. DOSYA KAYBI GERİ
// ALINAMAZ. Bu yüzden üretimde kalıcı olmayan sağlayıcı bir UYARI değil,
// AÇILIŞ HATASIDIR: servis hiç açılmaz. Sessizce veri yiyen bir servis,
// açılmayan bir servisten çok daha pahalıdır.

export const STORAGE_SCHEME_DB = 'db';

// installStorageProvider — Postgres sağlayıcısını kurar ve yazma şemasını ona
// çevirir. GCS eklendiğinde: burada `registerStorageProvider('gcs', ...)` ve
// `setWriteScheme('gcs')`. Eski `db://` satırları OKUNMAYA DEVAM EDER —
// kayıt defteri her iki şemayı da tutar (bkz. storage.js).
export const installStorageProvider = ({
  logger = console,
  serviceName = 'service',
  query,
} = {}) => {
  registerStorageProvider(STORAGE_SCHEME_DB, createPostgresStorageProvider({ query }));
  setWriteScheme(STORAGE_SCHEME_DB);
  logger.log?.(
    `[${serviceName}] depolama saglayicisi kuruldu: postgres (storage.blob), ` +
      `yazma semasi '${STORAGE_SCHEME_DB}://'`,
  );
  return STORAGE_SCHEME_DB;
};

// assertDurableStorage — üretimde kalıcı olmayan depolamayla açılışı reddeder.
//
// Bu muhafaza, adaptörün kendisinden DAHA DEĞERLİDİR: asıl hata adaptörün
// olmaması değil, olmadığının HİÇ FARK EDİLMEMESİYDİ. Bu çağrı olsaydı hata
// ilk üretim açılışında yakalanırdı.
// ⚠️ 2026-08-20 DUZELTMESI — bu muhafaza ONCEDEN OLU KODDU.
// `installAndAssertStorage` once `installStorageProvider` cagiriyordu; o da
// HER ZAMAN kalici (Postgres) saglayiciyi kuruyordu. Dolayisiyla hemen
// ardindan gelen `isDurableStorage()` kontrolu HER ZAMAN true donuyor, kontrol
// hicbir sey yakalayamiyordu. "Adaptorden daha degerli" diye tarif edilen
// koruma, pratikte hic calismayan bir satirdi.
//
// Artik kontrol GERCEK bir on-ucus testi yapar: saglayici kalici MI, ve
// deposuna GERCEKTEN erisebiliyor MU (`probe`). Boylece yalnizca "kurulum
// unutuldu" degil, dagitimda cok daha olasi iki durum da yakalanir:
//   • migration 1 kosulmadi   → 42P01 undefined_table
//   • grant migration'i (2) atlandi → 42501 permission denied
// Ikisi de uretimde ACILISI DUSURUR; alternatifi, ilk yuklemede patlayan ve
// sebebi kullanicida goruunen bir servistir.
export const assertDurableStorage = async ({
  env = process.env,
  logger = console,
  serviceName = 'service',
} = {}) => {
  const fail = (reason) => {
    const message = `[${serviceName}] DEPOLAMA ON-KONTROLU BASARISIZ: ${reason}`;
    if (env.NODE_ENV === 'production') throw new Error(message);
    logger.warn?.(`${message} (production disinda yalnizca uyari)`);
    return false;
  };

  if (!isDurableStorage()) {
    return fail(
      `kalici olmayan depolama (yazma semasi '${getWriteScheme()}'). Yuklenen ` +
        'dosyalar surec belleginde tutulur ve her yeniden baslatmada KAYBOLUR.',
    );
  }

  const provider = getStorageProvider(getWriteScheme());
  if (typeof provider?.probe !== 'function') {
    // Kalici ama on-kontrol sunmuyor: engellemeyiz, sessiz de kalmayiz.
    logger.warn?.(
      `[${serviceName}] depolama saglayicisi ('${getWriteScheme()}') probe() ` +
        'sunmuyor; erisilebilirlik dogrulanamadi.',
    );
    return true;
  }

  try {
    await provider.probe();
  } catch (error) {
    return fail(
      `'${getWriteScheme()}' deposuna erisilemiyor: ${error.message}. ` +
        'Migration 2026-08-20-1 (tablo) ve -2 (sinav_svc yetkisi) kosuldu mu?',
    );
  }
  return true;
};

// installAndAssertStorage — boot.js'lerin çağırdığı tek fonksiyon.
// ⚠️ ASENKRONDUR ve `await` EDILMELIDIR; edilmezse acilis muhafazasi yine
// etkisiz kalir (reddedilen promise yalnizca unhandled rejection uretir).
export const installAndAssertStorage = async (options = {}) => {
  installStorageProvider(options);
  return assertDurableStorage(options);
};

export default installAndAssertStorage;
