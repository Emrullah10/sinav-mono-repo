/* eslint-disable max-len */
import express from 'express';
import datasources, { createDatasources } from 'app-datasource';
import appConfig, { createAppConfig } from 'app-config';
import serviceDiscovery from 'app-service-discovery';
import helper from 'app-helper';
import rawAppConfig from './configs/app-config.js';
import rawDatasourceConfig from './configs/datasource-config.js';
import boot from './src/boot.js';
import openApi from './definitions/rest-api-definition.js';
import {
  assertDurationEnvsAreSeconds,
  assertRefreshOutlivesAccess,
  assertNoLeakedExampleSecret,
} from './src/config-guards.js';

const requireEnv = (name) => {
  if (!process.env[name]) {
    throw new Error(`${name} env required (gateway boot fail-fast)`);
  }
};

async function initialize() {
  // ⚠️ createAppConfig'ten ONCE: ayristirma soneki attigi icin sonrasinda
  // bakmak hatayi gormeyi imkansiz kilar.
  assertDurationEnvsAreSeconds();
  createAppConfig(rawAppConfig, rawDatasourceConfig);
  assertRefreshOutlivesAccess(appConfig);

  // Fail-fast: production'da kritik secret'lar gerçek bir değerle gelmeli.
  // Eksikse VEYA dev-default ise boot etme (fail-closed). app-config.js dev
  // ergonomisi için default ('dev-secret'/'') tutuyor; prod'da reddediyoruz.
  // (appConfig.nodeEnv createAppConfig sonrası dolar; nodeEnv default
  // 'production' olduğundan NODE_ENV belirtilmezse de fail-closed davranır.)
  if (appConfig?.nodeEnv === 'production') {
    requireEnv('COOKIE_SECRET');
    requireEnv('INTERNAL_API_KEY');
    if (process.env.COOKIE_SECRET === 'dev-secret') {
      throw new Error(
        'COOKIE_SECRET production default ("dev-secret") olamaz — gerçek bir secret enjekte edin.',
      );
    }
    for (const name of ['COOKIE_SECRET', 'INTERNAL_API_KEY', 'OPENAPI_UI_KEY', 'OTP_PEPPER']) {
      assertNoLeakedExampleSecret(name);
    }
    // ── D5 — cerezler uretimde `Secure` basilir ─────────────────────────────
    // Acik kapi bilincli birakildi (HTTP-only bir ortam icin) ama SESSIZ
    // olamaz: bayrak acikken oturum cerezleri duz HTTP uzerinde tasinabilir.
    if (process.env.ALLOW_INSECURE_COOKIES === 'true') {
      console.error(
        '[gateway] ⚠️ ALLOW_INSECURE_COOKIES=true — oturum cerezleri `Secure` ' +
          'BASILMIYOR. Bu yalnizca HTTPS OLMAYAN bir ortam icin dogrudur.',
      );
    }
  }

  const app = express();
  app.set('query parser', 'extended');
  // Tek bilinen proxy (nginx, 127.0.0.1) arkasındayız; req.ip gerçek client
  // IP'sini yansıtsın diye tek hop'a güven. `true` (hepsine güven) XFF spoof'una
  // izin verirdi; numerik hop sayısını express-rate-limit de güvenli sayar
  // (ERR_ERL_PERMISSIVE_TRUST_PROXY tetiklenmez). Topoloji değişirse güncellenmeli.
  app.set('trust proxy', 1);

  if (appConfig?.nodeEnv !== 'production') {
    global.logMode = 'trace';
  }

  await createDatasources(appConfig).catch((error) => {
    console.error(error);
    helper.application.exitOnError();
  });

  global.serviceDiscovery = await serviceDiscovery(
    app,
    openApi,
    datasources.serviceDiscoveryRedis,
    datasources.coreAppRedis,
  ).catch((error) => {
    console.error(error);
    helper.application.exitOnError();
  });

  await boot(global.serviceDiscovery, app).catch((error) => {
    console.error(error);
  });

  const server = app.listen(appConfig.port, appConfig.host, () =>
    console.log('API_GATEWAY_READY on Port: ', appConfig.port),
  );

  helper.application.appStarted(appConfig);

  // Graceful shutdown — PM2 reload + drain in-flight + Redis close
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[gateway] ${signal} received, draining...`);
    try {
      await new Promise((resolve) => server.close(resolve));
      await datasources.coreAppRedis?.client?.quit?.().catch(() => {});
      await datasources.serviceDiscoveryRedis?.client?.quit?.().catch(() => {});
    } catch (e) {
      console.error('[gateway] shutdown error:', e.message);
    }
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

initialize();
