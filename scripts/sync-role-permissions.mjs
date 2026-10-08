#!/usr/bin/env node
/**
 * `enums.role_permission` tablosunu CANLI DB'de kaynak-doğrusuyla karşılaştırır
 * (`packages/modules/shared/permissions.js` → ROLE_PERMISSIONS).
 *
 * NEDEN GEREKLİ — `scripts/validate-auth-config.js`'in kör noktası:
 * o script kodu ŞEMA DOSYASIYLA (`db-schemas/00-enums-schema.sql`)
 * karşılaştırır. Ama JWT'nin izin listesi şema dosyasından değil, ÇALIŞAN
 * VERİTABANINDAN üretiliyor:
 *
 *   services/sinav-service-identity/src/shared/helpers.js:292
 *   lookupPermissionsForRole() → SELECT ... FROM enums.role_permission
 *
 * Yani şema dosyası ile canlı DB ayrışırsa, denetleyici "sapma yok" derken
 * ortam gerçekten farklı davranır. 2026-08-31'de staging'de tam bu oldu:
 * DB'de `('anonymous','rfq:create')` vardı, kodda ve şemada yoktu — anonim
 * taslak-RFQ hunisi staging'de çalışıyor, temiz kurulumda çalışmıyordu.
 *
 * KULLANIM
 *   node scripts/sync-role-permissions.mjs           # yalnız karşılaştır
 *   node scripts/sync-role-permissions.mjs --apply   # eksikleri EKLE
 *   node scripts/sync-role-permissions.mjs --apply --prune
 *                                                    # fazlaları da SİL
 *
 * `--apply` fazlalıkları DOKUNMADAN bırakır: DB'de olup kodda olmayan bir
 * satır ya kodun geride kalması ya artık bir kayıttır ve ikisi zıt yönde
 * düzeltilir. Kararı insan verir; `--prune` bilinçli tercih olmalıdır.
 *
 * ÇIKIŞ KODU: sapma varsa ve `--apply` verilmediyse 1 (CI'da kullanılabilir).
 *
 * ⚠️ Bu tabloyu değiştirmek MEVCUT OTURUMLARI etkilemez: izinler JWT'ye
 * giriş anında basılıyor. Yeni izinler kullanıcının BİR SONRAKİ girişinde
 * geçerli olur (veya oturum iptal edilirse hemen).
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { ROLE_PERMISSIONS } from '../packages/modules/shared/permissions.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const getConnString = () => {
  const envText = readFileSync(join(REPO_ROOT, '.env'), 'utf8');
  const m = envText.match(/^CORE_APP_DB_CONNECTION_STRING=(.*)$/m);
  const conn = m && m[1].trim().replace(/^["']|["']$/g, '');
  if (!conn) throw new Error('CORE_APP_DB_CONNECTION_STRING .env içinde bulunamadı');
  return conn;
};

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const prune = args.has('--prune');
  if (prune && !apply) {
    throw new Error('--prune yalnız --apply ile birlikte kullanılabilir.');
  }

  const client = new pg.Client({ connectionString: getConnString(), connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    const { rows } = await client.query(
      'SELECT role_permission_role AS r, role_permission_permission AS p FROM enums.role_permission',
    );
    const live = new Set(rows.map((x) => `${x.r}|${x.p}`));

    const wanted = [];
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      for (const p of perms) wanted.push([role, p]);
    }
    const wantedKeys = new Set(wanted.map(([r, p]) => `${r}|${p}`));

    const missing = wanted.filter(([r, p]) => !live.has(`${r}|${p}`));
    const extra = [...live].filter((k) => !wantedKeys.has(k)).map((k) => k.split('|'));

    const byRole = (list) => {
      const out = {};
      for (const [r, p] of list) (out[r] ??= []).push(p);
      return out;
    };

    console.log(`canlı DB: ${live.size} satır · kod: ${wanted.length} satır`);

    if (!missing.length && !extra.length) {
      console.log('\n✓ Sapma yok — enums.role_permission ROLE_PERMISSIONS ile birebir.');
      return;
    }

    if (missing.length) {
      console.log(`\n⚠️  KODDA VAR, DB'DE YOK (${missing.length}) — bu izinler çalışma zamanında YOK:`);
      for (const [r, ps] of Object.entries(byRole(missing))) console.log(`   ${r}: ${ps.join(', ')}`);
    }
    if (extra.length) {
      console.log(`\n⚠️  DB'DE VAR, KODDA YOK (${extra.length}) — çalışma zamanında FAZLADAN veriliyor:`);
      for (const [r, ps] of Object.entries(byRole(extra))) console.log(`   ${r}: ${ps.join(', ')}`);
      console.log('   → Ya kod geride kaldı (permissions.js\'e ekle) ya artık kayıt (--prune ile sil).');
    }

    if (!apply) {
      console.log('\nDeğişiklik yapılmadı. Uygulamak için: --apply [--prune]');
      process.exitCode = 1;
      return;
    }

    await client.query('BEGIN');
    try {
      for (const [r, p] of missing) {
        await client.query(
          'INSERT INTO enums.role_permission (role_permission_role, role_permission_permission) VALUES ($1, $2)',
          [r, p],
        );
      }
      if (prune) {
        for (const [r, p] of extra) {
          await client.query(
            'DELETE FROM enums.role_permission WHERE role_permission_role = $1 AND role_permission_permission = $2',
            [r, p],
          );
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    console.log(
      `\n✓ ${missing.length} satır eklendi${prune ? `, ${extra.length} satır silindi` : ''}.` +
        (!prune && extra.length ? ` ${extra.length} fazlalık BIRAKILDI.` : ''),
    );
    console.log('  Yeni izinler kullanıcıların BİR SONRAKİ girişinde geçerli olur (JWT giriş anında basılır).');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\n✗ Hata:', err.message);
  process.exit(1);
});
