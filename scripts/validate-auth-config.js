#!/usr/bin/env node
// Auth config drift detector. Source-of-truth: PERMISSIONS object.
//
// Cross-checks:
//   1. Tüm `PERMISSIONS` value'ları DB seed'inde (`enums.permission`)
//   2. Tüm `ROLE_PERMISSIONS` map'inde geçen permission'lar PERMISSIONS'da
//   3. Identity + RFQ rest-api-definition `permission:` referansları
//      PERMISSIONS object'inde tanımlı
//   4. Frontend `ROUTE_PERMISSIONS` map'indeki kodlar PERMISSIONS'da tanımlı
//   5. Gateway public-paths.js'te listelenen path'ler bir backend
//      OpenAPI'sinde gerçekten mevcut
//
// CI: `node scripts/validate-auth-config.js` — exit non-zero on any drift.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
} from '../packages/modules/shared/permissions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let exitCode = 0;
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  exitCode = 1;
};
const ok = (msg) => console.log(`✓ ${msg}`);

const PERMISSION_CODES = new Set(Object.values(PERMISSIONS));

// ── Check 1: PERMISSIONS ↔ DB seed ────────────────────────────────────
const seedSql = fs.readFileSync(
  path.join(ROOT, 'db-schemas', '00-enums-schema.sql'),
  'utf8',
);
const seedPermBlock = seedSql.match(
  /INSERT INTO enums\.permission [\s\S]*?;/m,
);
if (!seedPermBlock) fail('DB seed: enums.permission INSERT bloğu bulunamadı');
else {
  const seedCodes = new Set(
    [...seedPermBlock[0].matchAll(/'([a-z:_]+)',/g)].map((m) => m[1]),
  );
  for (const code of PERMISSION_CODES) {
    if (!seedCodes.has(code)) {
      fail(`PERMISSIONS.${code} DB seed'inde yok`);
    }
  }
  for (const code of seedCodes) {
    if (!PERMISSION_CODES.has(code)) {
      fail(`DB seed'inde '${code}' var ama PERMISSIONS object'inde yok`);
    }
  }
  ok(`PERMISSIONS ↔ DB seed: ${seedCodes.size} kod doğrulandı`);
}

// ── Check 2: ROLE_PERMISSIONS ↔ PERMISSIONS ───────────────────────────
for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
  for (const p of perms) {
    if (!PERMISSION_CODES.has(p)) {
      fail(`ROLE_PERMISSIONS[${role}] '${p}' PERMISSIONS'da yok`);
    }
  }
}
ok(`ROLE_PERMISSIONS ↔ PERMISSIONS: ${Object.keys(ROLE_PERMISSIONS).length} role doğrulandı`);

// ── Check 3: rest-api-definition.js permission referansları ───────────
// ⚠️ 2026-09-10'a kadar bu liste YALNIZ identity + rfq iceriyordu; yedi
// servisin DORDU (notification, app, shipment, document) ve billing hic
// taranmiyordu. Bekci "146 korumali uc dogrulandi / hic sapma yok" basiyordu
// ve bu TAM KAPSAM gibi okunuyordu — oysa degistirilen servis listede yoksa
// cikti degismiyordu bile. M3 turunda fark edildi: dort yeni uc eklendi, sayi
// 146'da kaldi.
const restDefs = ['identity','content','learning','billing','tutor'].map((n) => `services/sinav-service-${n}/definitions/rest-api-definition.js`);
const restPermRefs = new Set();
for (const rel of restDefs) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  const content = fs.readFileSync(full, 'utf8');
  // Match: permission: PERMISSIONS.xxx OR permission: '*'
  for (const m of content.matchAll(/permission:\s*PERMISSIONS\.(\w+)/g)) {
    if (!PERMISSIONS[m[1]]) {
      fail(`${rel}: PERMISSIONS.${m[1]} object'te tanımlı değil`);
    } else {
      restPermRefs.add(PERMISSIONS[m[1]]);
    }
  }
}
ok(`OpenAPI permission references: ${restPermRefs.size} unique kod doğrulandı`);

// ── Check 4: Frontend ROUTE_PERMISSIONS ↔ PERMISSIONS ─────────────────
const frontendRoutePermFile = path.join(
  ROOT,
  'sinav-web-app/src/shared/auth/route-permissions.js',
);
if (fs.existsSync(frontendRoutePermFile)) {
  const content = fs.readFileSync(frontendRoutePermFile, 'utf8');
  // Match string literals inside arrays after `[Routes.X]:`
  const codes = [...content.matchAll(/'([a-z:_]+)'/g)].map((m) => m[1]);
  let frontendUnknown = 0;
  for (const c of codes) {
    if (!PERMISSION_CODES.has(c)) {
      fail(`Frontend ROUTE_PERMISSIONS '${c}' PERMISSIONS'da yok`);
      frontendUnknown += 1;
    }
  }
  if (frontendUnknown === 0) {
    ok(`Frontend ROUTE_PERMISSIONS: ${codes.length} kod doğrulandı`);
  }
}

// ── Check 5: ROLES ↔ DB user_account_role seed ────────────────────────
const seedRoleBlock = seedSql.match(
  /INSERT INTO enums\.user_account_role [\s\S]*?;/m,
);
if (seedRoleBlock) {
  const seedRoles = new Set(
    [...seedRoleBlock[0].matchAll(/'([a-z_]+)',/g)].map((m) => m[1]),
  );
  const codeRoles = new Set(Object.values(ROLES));
  for (const r of codeRoles) {
    if (!seedRoles.has(r)) fail(`ROLES.${r} DB seed'inde yok`);
  }
  for (const r of seedRoles) {
    if (!codeRoles.has(r)) fail(`DB seed role '${r}' ROLES object'inde yok`);
  }
  ok(`ROLES ↔ DB seed: ${seedRoles.size} role doğrulandı`);
}

// ── Check 6: her uç ya PUBLIC, ya INTERNAL, ya da `permission` bildirir ──
//
// NEDEN: gateway FAIL-CLOSED çalışıyor. `authenticate-jwt-middleware`,
// route'un `permissionList`'i yoksa isteği **500 PERMISSION_NOT_CONFIGURED**
// ile kesiyor — 404 değil, 403 değil. Yani izni unutulan bir uç sessizce
// "yetkisiz" olmuyor; ÇALIŞMIYOR. Üstelik bunu yalnız o ucu tarayıcıdan
// çağıran fark ediyor.
//
// Gerçek vaka (bug-1767): `/v1/referrals/me` Faz C'de izinsiz bırakıldı,
// referans motoru bir aydan uzun süre tarayıcıda hiç çalışmadı ve kusur ancak
// C6 turunda ortaya çıktı. Bu kontrol olsaydı ilk CI koşusunda düşerdi.
//
// Kural: internal olmayan ve gateway public-paths'te bulunmayan her operasyon
// `permission` bildirmek ZORUNDA (özel bir kod yoksa ANY_AUTHENTICATED = '*').
const publicPathsFile = path.join(
  ROOT,
  'services/sinav-web-gateway/src/constants/public-paths.js',
);
if (fs.existsSync(publicPathsFile)) {
  const publicContent = fs.readFileSync(publicPathsFile, 'utf8');
  // `{ path: '/api/<service>/v1/...', match: 'exact'|'prefix', ... }`
  //
  // ⚠️ `match` MUTLAKA okunmali. 2026-09-10'a kadar burada yalniz `path`
  // toplaniyor ve birebir karsilastiriliyordu; oysa public-paths.js girdilerin
  // bir kismini `match: 'prefix'` ile tutuyor. Sonuc: parametreli her public
  // uc (`/v1/public/shares/{shareToken}`, `/v1/public/tracking/{trackingCode}`,
  // `/v1/landing-articles/{code}/image`) bu bekciye "izin bildirmiyor" gibi
  // gorunurdu — yani bekci acilsaydi DORT yanlis pozitifle acilirdi ve
  // muhtemelen bu yuzden hic acilmadi.
  const publicExact = new Set();
  const publicPrefixes = [];
  for (const entry of publicContent.match(/\{[^{}]*\}/g) || []) {
    const pathMatch = /path:\s*'([^']+)'/.exec(entry);
    if (!pathMatch) continue;
    const kind = /match:\s*'(exact|prefix)'/.exec(entry);
    if (kind && kind[1] === 'prefix') publicPrefixes.push(pathMatch[1]);
    else publicExact.add(pathMatch[1]);
  }
  const isPublic = (fullPath) =>
    publicExact.has(fullPath) || publicPrefixes.some((pre) => fullPath.startsWith(pre));

  let missingPermission = 0;
  let checkedOps = 0;
  for (const rel of restDefs) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    // Servis adı dosya yolundan: definitions/ bir üstündeki klasör.
    const serviceName = rel.split('/')[1];
    // eslint-disable-next-line no-await-in-loop
    const mod = await import(`file://${full}`);
    const paths = mod.default?.paths || mod.default || {};
    for (const [route, ops] of Object.entries(paths)) {
      if (!ops || typeof ops !== 'object') continue;
      for (const [method, op] of Object.entries(ops)) {
        // Yalnız gerçek operasyonlar (x-functionName taşıyanlar).
        if (!op || typeof op !== 'object' || !op['x-functionName']) continue;
        if (op['x-internal']) continue; // internal uçlar gateway'e hiç girmez
        const fullPath = `/api/${serviceName}${route}`;
        if (isPublic(fullPath)) continue; // auth'suz uç
        checkedOps += 1;
        const sd = op['x-serviceDiscovery'];
        const hasPermission =
          Array.isArray(sd) && sd.some((e) => e && e.permissionList);
        if (!hasPermission) {
          fail(
            `${method.toUpperCase()} ${route} (${serviceName}) 'permission' bildirmiyor — ` +
              'gateway 500 PERMISSION_NOT_CONFIGURED döndürür. Public ise ' +
              'public-paths.js\'e ekleyin, değilse permission verin ' +
              '(genel erişim için ANY_AUTHENTICATED).',
          );
          missingPermission += 1;
        }
      }
    }
  }
  if (missingPermission === 0) {
    ok(`Uç izin kapsamı: ${checkedOps} korumalı uç 'permission' bildiriyor`);
  }
}

// ── Summary ──────────────────────────────────────────────────────────
if (exitCode === 0) {
  console.log('\n[ok] Auth config drift detection: hiç sapma yok');
} else {
  console.error('\n[fail] Auth config drift tespit edildi');
}
process.exit(exitCode);
