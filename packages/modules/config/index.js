import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import factorConfig from '12factor-config';
import log from '../helper/log/index.js';
const appConfig = {};

const loadEnvFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      const envConfig = dotenv.parse(fs.readFileSync(filePath));
      for (const key in envConfig) {
        process.env[key] = envConfig[key];
      }
    }
  } catch (error) {
    log.error(error);
  }
};

const overrideConfiguration = () => {
  try {
    if (
      (process.env.NODE_ENV || process.env.Node_Env || 'development') ==
      'development'
    ) {
      const rootEnvPath = path.resolve(process.cwd(), '..', '..', '.env');
      loadEnvFile(rootEnvPath);
    }
  } catch (error) {
    log.error(error);
  }
};
// ⚠️ MODUL YUKLENIRKEN CAGRILIR — `createAppConfig()` beklenmez.
//
// NEDEN (2026-09-10, publish 500'u): ES modullerinde static import'lar,
// import EDEN modulun govdesinden ONCE degerlenir. `main.js` sirasiyla
//   … → config/index.js → … → ./src/boot.js → ./src/container.js
// yukluyor ve `container.js` MODUL DUZEYINDE `buildContainer()` cagiriyor.
// Env ise `initialize()` icindeki `createAppConfig()`'te yukleniyordu — yani
// container kurulduktan SONRA.
//
// Sonuc: use-case fabrikalarinin `process.env`'i O AN okuyan varsayilan
// parametreleri (`baseUrl = process.env.SERVICE_IDENTITY_REST_URL ||
// 'http://localhost:1000'`) TANIMSIZ goruyor ve fallback'i KALICI olarak
// donduruyordu. publish akisi bu yuzden identity'ye localhost:1000'e gidip
// ECONNREFUSED aliyor, kullanici ham 500 goruyordu. Istek aninda okunan
// degiskenler (INTERNAL_API_KEY) calistigi icin hata da yaniltici yerde
// patliyordu.
//
// Burada cagirmak dogru yer: bu modul, container'i yukleyen her giris
// noktasindan ONCE degerleniyor. Idempotent — `createAppConfig()` icindeki
// cagri duruyor ve ayni degerleri yeniden yaziyor. development DISINDA
// no-op'tur (staging/prod env'i pm2'den enjekte eder), bu yuzden dagitim
// davranisi degismez.
overrideConfiguration();

const getAppPort = (url) => {
  const splittedUrl = url.split(':');
  return splittedUrl.pop();
};

// ── Y3 (guvenlik denetimi 2026-09-05) — DINLENECEK ARAYUZ ──────────────────
//
// `app.listen(port)` host VERMEDEN cagriliyordu, yani her servis 0.0.0.0'a
// baglaniyordu. Downstream servisler kimligi YALNIZ gateway'in yazdigi
// header'lardan turetiyor (packages/modules/shared/utils/general.js
// `getCaller`); porta dogrudan erisebilen biri `useraccountorganizationid`
// gonderip HERHANGI bir org'u taklit edebilir. Gateway'in header temizligi
// yalnizca GATEWAY UZERINDEN gelen trafigi korur.
//
// Kural: `LISTEN_HOST` varsa o. Yoksa servisin KENDI url'inin hostname'i
// LITERAL bir IP ya da `localhost` ise ona baglanilir — `.env.example`daki
// tek-host topolojide (hepsi 127.0.0.1) bu loopback demektir. Hostname bir
// isimse (docker servis adi, or. `http://billing:1003`) 0.0.0.0'a duser,
// cunku container kendi adina baglanamaz.
//
// ⚠️ GERI DONUS: `LISTEN_HOST=0.0.0.0`.
const LITERAL_HOST = /^(\d{1,3}\.){3}\d{1,3}$|^\[?[0-9a-fA-F:]+\]?$|^localhost$/;

export const resolveListenHost = (url, env = process.env) => {
  const explicit = String(env.LISTEN_HOST || '').trim();
  if (explicit) return explicit;
  try {
    const { hostname } = new URL(url);
    return LITERAL_HOST.test(hostname) ? hostname : '0.0.0.0';
  } catch {
    return '0.0.0.0';
  }
};

export const createAppConfig = (factorConfigObj, factorDatasourceObj) => {
  overrideConfiguration();
  const config = factorConfig(factorConfigObj);
  config.port = getAppPort(config.url || '');
  config.host = resolveListenHost(config.url || '');
  let datasourceConfig = [];
  factorDatasourceObj.forEach((item) => {
    datasourceConfig.push(factorConfig(item));
  });
  let conf = { ...config, datasourceConfig };
  Object.keys(conf).forEach((key) => {
    appConfig[key] = conf[key];
  });
  return Object.freeze(appConfig);
};
export default appConfig;
