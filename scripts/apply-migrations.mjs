#!/usr/bin/env node
/**
 * db-schemas/migrations/*.sql dosyalarini canli veritabanina uygular.
 *
 * `psql` bu makinede YOK (bkz. .wolf/cerebrum.md Do-Not-Repeat) — baglanti
 * node + pg ile kurulur.
 *
 * `npm run build-schema` YALNIZCA fresh-init `_combined.sql`'ini uretir; calisan
 * DB'ye hicbir sey yapmaz. Sema dosyasini duzenleyip migration'i uygulamamak
 * PG 42703 (undefined_column) / 42P01 (undefined_table) → 500 demektir.
 *
 * ── NEDEN DEFTER (public.schema_migrations) ─────────────────────────────────
 * Bu repodaki migration'lar "idempotent yazilir" diye varsayiliyordu ama
 * buglog bunun UC KEZ tutmadigini gosteriyor: bug-2173 (42703, dosya tek
 * transaction), bug-2174 (42710 chk_credit_quantity already exists),
 * bug-2242 (42701 subscription_plan_rfq_transport_limit already exists).
 * Yani "tekrar kosmak guvenlidir" bir tasarim hedefi, garanti DEGIL.
 *
 * Defter bu varsayimi ortadan kaldirir: her dosya EN FAZLA BIR KEZ kosar.
 * Kayit, migration ile AYNI transaction'a yazilir — arada cokme olursa
 * "uygulandi ama deftere yazilmadi" durumu dogamaz.
 *
 * ── BAGLANTI DIZESI SIRASI ──────────────────────────────────────────────────
 * 1) SINAV_MIGRATION_DB_CONNECTION_STRING  (grant dosyalari SUPERUSER ister;
 *    uygulama kullanicisi yetmiyorsa bunu ayri bir env dosyasina koy)
 * 2) CORE_APP_DB_CONNECTION_STRING          (process.env — update.sh boyle verir)
 * 3) repo kokundeki .env                    (yerel gelistirme)
 *
 * ⚠️ (1)'i `../env/.env` icine YAZMA: `scripts/env-to-json.mjs` o dosyadaki HER
 * anahtari pm2 JSON'una tasir, yani superuser dizesi calisan tum servislerin
 * ortamina sizar. Ayri dosya kullan (update.sh: `../env/migration.env`).
 *
 * Kullanim:
 *   node scripts/apply-migrations.mjs --status          # ne uygulandi, ne bekliyor
 *   node scripts/apply-migrations.mjs --pending         # bekleyenleri sirayla uygula
 *   node scripts/apply-migrations.mjs --baseline --yes  # mevcut semayi deftere hizala
 *   node scripts/apply-migrations.mjs 2026-07-27-carrier-lane.sql ...
 *   node scripts/apply-migrations.mjs db-schemas/migrations/foo.sql
 *   node scripts/apply-migrations.mjs --all-since 2026-07-27
 */
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import pg from 'pg';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'db-schemas/migrations');
const LEDGER = 'public.schema_migrations';
// update.sh icindeki MIGRATION_ENV_FILE ile AYNI varsayilan.
const MIGRATION_ENV_FILE =
  process.env.SINAV_MIGRATION_ENV_FILE || join(dirname(REPO_ROOT), 'env', 'migration.env');

// Semalardan biri bile yoksa DB bostur; baseline orada VERI KAYBI demektir.
const CORE_SCHEMAS = ['identity', 'content', 'learning', 'billing', 'tutor'];

/** Shell bicimli bir env dosyasindan TEK anahtari okur. Dosya yoksa null. */
function readEnvFileKey(file, key) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const m = text.match(new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=(.*)$`, 'm'));
  if (!m) return null;
  const v = m[1].trim().replace(/^["']|["']$/g, '');
  return v || null;
}

/**
 * Yetkili dizeyi SCRIPT okur — kabukta `set -a; . migration.env` YAPILMAZ.
 * Boylece hem `npm run update` hem elle kosu ayni yoldan gecer; secret hicbir
 * kabuk ortamina girmez, dolayisiyla update.sh'in pm2'ye verdigi JSON'a sizamaz.
 *
 * Sira onemli: yetkili dize (1-2) uygulama dizesinden (3-4) ONCE gelir, cunku
 * grant migration'lari SUPERUSER ister ve uygulama kullanicisinin `public`
 * semasinda CREATE yetkisi yoktur (PG 15+ varsayilani).
 */
function getConnString() {
  const direct = process.env.SINAV_MIGRATION_DB_CONNECTION_STRING;
  if (direct && direct.trim()) {
    return { conn: direct.trim(), source: 'SINAV_MIGRATION_DB_CONNECTION_STRING (ortam)' };
  }

  const fromFile = readEnvFileKey(MIGRATION_ENV_FILE, 'SINAV_MIGRATION_DB_CONNECTION_STRING');
  if (fromFile) return { conn: fromFile, source: MIGRATION_ENV_FILE };

  const app = process.env.CORE_APP_DB_CONNECTION_STRING;
  if (app && app.trim()) {
    return { conn: app.trim(), source: 'CORE_APP_DB_CONNECTION_STRING (ortam)' };
  }

  const fromRepo = readEnvFileKey(join(REPO_ROOT, '.env'), 'CORE_APP_DB_CONNECTION_STRING');
  if (fromRepo) return { conn: fromRepo, source: join(REPO_ROOT, '.env') };

  throw new Error(
    [
      'Baglanti dizesi bulunamadi. Sirayla bakildi:',
      '  1) SINAV_MIGRATION_DB_CONNECTION_STRING (ortam)',
      `  2) ${MIGRATION_ENV_FILE}`,
      '  3) CORE_APP_DB_CONNECTION_STRING (ortam)',
      `  4) ${join(REPO_ROOT, '.env')}`,
    ].join('\n')
  );
}

async function connectionFacts(client) {
  try {
    const { rows } = await client.query(
      'SELECT current_user AS usr, current_database() AS db, ' +
        '(SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_super'
    );
    return rows[0];
  } catch {
    return null;
  }
}

/**
 * 42501'i ham PG hatasi olarak birakmak cikmaz sokaktir ("permission denied for
 * schema public" kullaniciya ne yapacagini SOYLEMEZ). Kim bagli, dize nereden
 * geldi ve ne yapilmali — hepsi yazilir.
 */
async function privilegeError(client, connSource, action) {
  const f = await connectionFacts(client);
  const who = f ? `${f.usr}@${f.db} (superuser: ${f.is_super ? 'evet' : 'HAYIR'})` : 'okunamadi';
  const db = f ? f.db : '<db>';
  const usr = f ? f.usr : '<kullanici>';
  const err = new Error(
    [
      `${action} icin yetki yok.`,
      '',
      `  Bagli kullanici : ${who}`,
      `  Dizenin kaynagi : ${connSource}`,
      '',
      '  Migration zaten SUPERUSER ister (grant dosyalari); uygulama kullanicisiyla',
      '  kosulmaz. Yetkili dizeyi AYRI bir dosyaya koy — script onu KENDISI okur,',
      '  kabukta source etmene gerek yok:',
      '',
      `    ${MIGRATION_ENV_FILE}`,
      `    SINAV_MIGRATION_DB_CONNECTION_STRING=postgres://postgres:<parola>@<host>:5432/${db}`,
      '    (dosyaya chmod 600 ver)',
      '',
      "  ../env/.env icine KOYMA: env-to-json.mjs oradaki her anahtari pm2 JSON dosyasina,",
      '  yani calisan tum servislerin ortamina tasir.',
      '',
      '  Alternatif (yetkiyi kalici genisletir, tercih edilmez):',
      `    GRANT CREATE ON SCHEMA public TO ${usr};`,
    ].join('\n')
  );
  // TTY'de `main` bunu yakalayip yetkili dizeyi SORAR; etkilesimsiz kosuda
  // (CI/cron) yukaridaki metin aynen cikar ve davranis DEGISMEZ.
  err.needsSuperuser = true;
  return err;
}

/**
 * `2026-09-10-2-...` ile `2026-09-10-10-...`: duz siralama 10'u 2'den ONCE
 * koyar (bu repoda 2026-09-10 gunu 12 migration var). Rakam bloklarini SAYI
 * olarak karsilastir.
 *
 * `localeCompare` KULLANILMAZ: host locale'i siralamayi degistirir ve ayni
 * repo baska makinede baska sira uretir (cerebrum Do-Not-Repeat, 2026-06-11).
 */
function naturalCompare(a, b) {
  const chunks = (s) => s.match(/\d+|\D+/g) || [];
  const ca = chunks(a);
  const cb = chunks(b);
  const n = Math.max(ca.length, cb.length);
  for (let i = 0; i < n; i += 1) {
    const x = ca[i];
    const y = cb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (/^\d/.test(x) && /^\d/.test(y)) {
      const d = Number(x) - Number(y);
      if (d !== 0) return d;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

const checksumOf = (sql) => createHash('sha256').update(sql).digest('hex');

async function listMigrationFiles() {
  const all = await readdir(MIGRATIONS_DIR);
  return all.filter((f) => f.endsWith('.sql')).sort(naturalCompare);
}

async function ledgerExists(client) {
  const { rows } = await client.query('SELECT to_regclass($1) AS oid', [LEDGER]);
  return rows[0].oid !== null;
}

async function createLedger(client) {
  try {
    await client.query(`
    CREATE TABLE IF NOT EXISTS ${LEDGER} (
      version    TEXT PRIMARY KEY,
      checksum   TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_by TEXT NOT NULL DEFAULT current_user,
      baselined  BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  } catch (err) {
    if (err.code === '42501') {
      throw await privilegeError(client, client.connSource, `${LEDGER} defterini olusturmak`);
    }
    throw err;
  }
}

async function readLedger(client) {
  const { rows } = await client.query(
    `SELECT version, checksum, baselined FROM ${LEDGER}`
  );
  return new Map(rows.map((r) => [r.version, r]));
}

async function schemasPresent(client) {
  const { rows } = await client.query(
    'SELECT schema_name FROM information_schema.schemata WHERE schema_name = ANY($1)',
    [CORE_SCHEMAS]
  );
  return rows.map((r) => r.schema_name);
}

/**
 * Tek dosya, KENDI transaction'inda. Defter kaydi ayni transaction'da yazilir.
 * `record=false` yalnizca MIGRATIONS_DIR disindaki bir dosya icin gecerlidir —
 * defter anahtari dosya ADIdir, repo disi bir yol anlamli bir surum tasimaz.
 */
async function applyOne(client, absPath, version, record) {
  const sql = await readFile(absPath, 'utf8');
  try {
    await client.query('BEGIN');
    await client.query(sql);
    if (record) {
      await client.query(
        `INSERT INTO ${LEDGER} (version, checksum) VALUES ($1, $2)
         ON CONFLICT (version) DO UPDATE
           SET checksum = EXCLUDED.checksum, applied_at = now(), baselined = FALSE`,
        [version, checksumOf(sql)]
      );
    }
    await client.query('COMMIT');
    console.log(`✓ ${version}`);
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    // ⚠️ 42501 (permission denied) bir MIGRATION KUSURU DEGIL, kurulum
    // sorunudur: dosyayi duzeltmek ise yaramaz, yetkili dize gerekir. `false`
    // donup "✗" basmak kullaniciyi dosyada hata aramaya yollardi. Firlatiyoruz
    // ki `main` yetkili dizeyi SORUP ayni komutu tekrar kosabilsin.
    if (err.code === '42501') {
      throw await privilegeError(client, client.connSource, `${version} uygulamak`);
    }
    console.error(`✗ ${version}\n  ${err.code || ''} ${err.message}`);
    return false;
  }
}

async function cmdStatus(client) {
  const files = await listMigrationFiles();
  if (!(await ledgerExists(client))) {
    console.log(`Defter (${LEDGER}) YOK — bu veritabaninda hic kurulmadi.`);
    console.log(`  Diskte ${files.length} migration dosyasi var.`);
    console.log('  Sema zaten guncelse:  node scripts/apply-migrations.mjs --baseline --yes');
    return 0;
  }
  const ledger = await readLedger(client);
  const pending = files.filter((f) => !ledger.has(f));
  const drifted = [];
  for (const version of files) {
    const row = ledger.get(version);
    if (!row) continue;
    const sql = await readFile(join(MIGRATIONS_DIR, version), 'utf8');
    if (row.checksum !== checksumOf(sql)) drifted.push(version);
  }
  const orphans = [...ledger.keys()].filter((v) => !files.includes(v));

  console.log(`Uygulanmis: ${ledger.size} | Diskte: ${files.length} | Bekleyen: ${pending.length}`);
  if (pending.length) {
    console.log('\nBekleyen:');
    for (const v of pending) console.log(`  · ${v}`);
  }
  if (drifted.length) {
    console.log('\nUYARI — uygulandiktan SONRA degistirilmis dosyalar (yeniden kosmaz):');
    for (const v of drifted) console.log(`  ! ${v}`);
    console.log('  Degisiklik semaya gerekiyorsa YENI bir migration dosyasi ac.');
  }
  if (orphans.length) {
    console.log('\nUYARI — defterde var, diskte YOK:');
    for (const v of orphans) console.log(`  ? ${v}`);
  }
  return 0;
}

async function cmdBaseline(client, assumeYes) {
  const present = await schemasPresent(client);
  if (present.length === 0) {
    throw new Error(
      `Veritabani BOS gorunuyor (${CORE_SCHEMAS.join(', ')} semalarindan hicbiri yok).\n` +
        '  Baseline burada tum migration\'lari "uygulanmis" isaretleyip semayi kalici\n' +
        '  eksik birakirdi. Once db-schemas/_combined.sql ile semayi kur, sonra baseline al.'
    );
  }

  const files = await listMigrationFiles();
  await createLedger(client);
  const ledger = await readLedger(client);
  const toRecord = files.filter((f) => !ledger.has(f));

  if (!toRecord.length) {
    console.log('✓ Defter zaten guncel; isaretlenecek dosya yok.');
    return 0;
  }

  console.log(`Baseline ${toRecord.length} dosyayi UYGULAMADAN "uygulanmis" isaretleyecek.`);
  console.log(`  Ilk: ${toRecord[0]}`);
  console.log(`  Son: ${toRecord[toRecord.length - 1]}`);
  console.log('  Bu komut semaya DOKUNMAZ; yalniz defteri mevcut duruma hizalar.');
  console.log('  Yanlis kullanimi: bu dosyalardan biri gercekte uygulanmadiysa bir daha ASLA uygulanmaz.');

  if (!assumeYes) {
    if (!process.stdin.isTTY) {
      throw new Error('Etkilesimsiz calisma icin --yes gerekli.');
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('Devam edilsin mi? (evet yaz): ');
    rl.close();
    if (answer.trim().toLowerCase() !== 'evet') {
      console.log('Iptal edildi.');
      return 1;
    }
  }

  await client.query('BEGIN');
  try {
    for (const version of toRecord) {
      const sql = await readFile(join(MIGRATIONS_DIR, version), 'utf8');
      await client.query(
        `INSERT INTO ${LEDGER} (version, checksum, baselined) VALUES ($1, $2, TRUE)
         ON CONFLICT (version) DO NOTHING`,
        [version, checksumOf(sql)]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
  console.log(`✓ Baseline: ${toRecord.length} dosya isaretlendi (toplam ${files.length}).`);
  return 0;
}

async function cmdPending(client) {
  if (!(await ledgerExists(client))) {
    throw new Error(
      `${LEDGER} yok — bu veritabaninda migration defteri hic kurulmadi.\n` +
        '  Sema zaten guncelse (migration\'lar elle uygulandiysa):\n' +
        '    node scripts/apply-migrations.mjs --baseline --yes\n' +
        '  Sema SIFIRDAN kuruluyorsa once db-schemas/_combined.sql uygulanir, sonra --baseline.\n' +
        '  Bu adimi gecici olarak atlamak icin: SKIP_DB=1 npm run update'
    );
  }

  const files = await listMigrationFiles();
  const ledger = await readLedger(client);
  const pending = files.filter((f) => !ledger.has(f));

  if (!pending.length) {
    console.log('✓ Bekleyen migration yok.');
    return 0;
  }

  console.log(`${pending.length} bekleyen migration uygulanacak:`);
  for (const v of pending) console.log(`  · ${v}`);

  for (const version of pending) {
    const ok = await applyOne(client, join(MIGRATIONS_DIR, version), version, true);
    if (!ok) {
      // Migration'lar SIRALI ve birbirine bagimli: bir tanesi dustuyse sonrakini
      // eksik sema uzerinde kosturmak ikinci, daha karisik bir hata uretir.
      console.error(
        `\nHATA: ${version} dustu; sonraki migration'lar UYGULANMADI.\n` +
          '  Duzeltip tekrar calistir — basarili olanlar deftere yazildi, yeniden kosmazlar.'
      );
      return 1;
    }
  }
  console.log(`✓ ${pending.length} migration uygulandi.`);
  return 0;
}

async function resolveExplicitFiles(argv) {
  if (argv[0] === '--all-since') {
    const since = argv[1];
    if (!since) throw new Error('--all-since <YYYY-MM-DD> gerekli');
    const all = await listMigrationFiles();
    return all.filter((f) => f.slice(0, 10) >= since).map((f) => join(MIGRATIONS_DIR, f));
  }
  if (!argv.length) throw new Error('En az bir migration dosyasi ver.');
  return argv.map((a) => {
    if (isAbsolute(a)) return a;
    if (a.includes('/')) return join(REPO_ROOT, a);
    return join(MIGRATIONS_DIR, a.endsWith('.sql') ? a : `${a}.sql`);
  });
}

/**
 * Elle dosya verilen eski kullanim. Dosya ACIKCA istendigi icin defterde olsa
 * bile kosar (kacis kapisi); basarili olursa deftere yazilir ki `--pending`
 * onu bir daha uygulamaya calismasin.
 */
async function cmdExplicit(client, argv) {
  const files = await resolveExplicitFiles(argv);
  const hasLedger = await ledgerExists(client);
  let failed = 0;
  for (const file of files) {
    const inDir = resolve(file) === join(MIGRATIONS_DIR, basename(file));
    const version = inDir ? basename(file) : file.replace(`${REPO_ROOT}/`, '');
    const ok = await applyOne(client, file, version, hasLedger && inDir);
    if (!ok) failed += 1;
  }
  if (!hasLedger) {
    console.log(`\nNot: ${LEDGER} yok, bu kosu deftere YAZILMADI.`);
    console.log('  Defteri kurmak icin: node scripts/apply-migrations.mjs --baseline --yes');
  }
  return failed ? 1 : 0;
}


// ── YETKILI DIZEYI SORMA (2026-09-19) ──────────────────────────────────────
//
// Once yalniz "su dosyayi olustur" diyen bir hata basiliyordu. Dagitimin tam
// ortasinda (`npm run update` → migration adimi) bu, kullaniciyi kabuga atip
// elle dosya yazdiriyor ve dagitimi yarida birakiyordu. Artik TTY varsa dize
// SORULUYOR; etkilesimsiz kosuda (CI/cron) eski metin aynen cikar.

/**
 * Parolayi EKRANA BASMADAN okur.
 *
 * ⚠️ readline'in `_writeToOutput`u OZEL API; surum degisiminde sessizce
 * calismayi birakir ve parola ekrana DUSER. Bu yuzden ham kip (raw mode) ile
 * karakter karakter okunuyor: davranis Node surumune bagli degil.
 */
function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    // ⚠️ HAM KIP PROMPT'TAN ONCE. Tersi sirada prompt baytlari terminale
    // ulasiyor ama `tcsetattr` heniz donmemis oluyor; o mikro-pencerede gelen
    // girdiyi terminal surucusu YANKILIYOR ve parola ekrana dusuyor. Insan
    // yazarken pencere fark edilmez, otomasyonda (ve hizli yapistirma ile)
    // edilir — pty altinda olculdu (2026-09-19).
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdout.write(prompt);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    const done = (fn, arg) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write('\n');
      fn(arg);
    };
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') return done(resolve, buf);
        if (c === '\u0003') return done(reject, new Error('Iptal edildi (Ctrl-C).'));
        if (c === '\u0004') return done(resolve, buf);
        if (c === '\u007f' || c === '\b') buf = buf.slice(0, -1);
        else if (c >= ' ') buf += c;
      }
    };
    stdin.on('data', onData);
  });
}

/** Dizeyi dogrular VE gercekten baglanabildigini sinar. */
async function verifyConn(conn) {
  try {
    new URL(conn);
  } catch {
    return { ok: false, why: 'Gecerli bir postgres:// URL degil.' };
  }
  const probe = new pg.Client({ connectionString: conn, connectionTimeoutMillis: 8000 });
  try {
    await probe.connect();
    const f = await connectionFacts(probe);
    await probe.end();
    if (!f) return { ok: false, why: 'Baglanti kuruldu ama kimlik okunamadi.' };
    return { ok: true, facts: f };
  } catch (err) {
    await probe.end().catch(() => {});
    return { ok: false, why: `${err.code || ''} ${err.message}`.trim() };
  }
}

/**
 * Yetkili dizeyi sorar. Basarisizsa (ya da TTY yoksa) `null` doner ve cagiran
 * ORIJINAL hatayi firlatir — yani hicbir durumda sessiz kalinmaz.
 */
async function promptForSuperuserConn(err, baseConn) {
  if (!process.stdin.isTTY) return null;

  console.error(err.message);
  console.error('');

  // ⚠️ readline ARAYUZU KAPALIYKEN gizli okuma yapilir. `rl.pause()` YETMEZ:
  // arayuz acik kaldigi surece kendi tus yankisini surduruyor ve dize —
  // yani PAROLA — "(giris ekrana YAZILMAZ)" denmesine ragmen ekrana ve
  // terminal gecmisine dusuyor (pty altinda olculdu, 2026-09-19). Bu yuzden
  // her soru KENDI arayuzunu acip kapatir.
  const ask = async (q) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return (await rl.question(q)).trim();
    } finally {
      rl.close();
    }
  };
  const yes = (v) => {
    const t = v.toLowerCase();
    return t === 'evet' || t === 'e';
  };

  {
    const want = await ask(
      'Yetkili kullanici bilgisini SIMDI girmek ister misin? (evet/hayir): '
    );
    if (!yes(want)) return null;

    // ⚠️ TAM DIZE SORULMAZ. Host/port/veritabani ZATEN elimizde — calisan
    // baglantiningkiler. Kullanicidan yalniz DEGISEN iki sey istenir: yetkili
    // rol ve parolasi. Tam dize istemek kullaniciyi host/db'yi elle dogru
    // yazmaya zorluyordu ve yanlis veritabanina baglanma riski aciyordu.
    const base = (() => {
      try {
        return new URL(baseConn);
      } catch {
        return null;
      }
    })();
    const host = base?.hostname || '127.0.0.1';
    const port = base?.port || '5432';
    const db = base?.pathname ? decodeURIComponent(base.pathname.slice(1)) : '';
    if (!db) {
      console.error('  Mevcut dizeden veritabani adi cozulemedi — vazgecildi.');
      return null;
    }
    console.log(`  Hedef: ${host}:${port}/${db}  (mevcut baglantidan alindi)`);

    const usr = (await ask('  Yetkili kullanici [postgres]: ')) || 'postgres';
    const pw = await readHidden('  Parola (ekrana YAZILMAZ): ');
    if (!pw) {
      console.error('  Parola bos — vazgecildi.');
      return null;
    }

    // ⚠️ KULLANICI VE PAROLA URL-KODLANIR. Parolada `@ : / # ?` gecmesi
    // siradan; ham gomulurse URL BASKA bir host/db'ye ayrisir ve hata
    // "baglanamadi" diye gorunur — oysa parola dogrudur.
    const conn =
      `postgres://${encodeURIComponent(usr)}:${encodeURIComponent(pw)}` +
      `@${host}:${port}/${encodeURIComponent(db)}`;

    const check = await verifyConn(conn);
    if (!check.ok) {
      console.error(`  Baglanilamadi: ${check.why}`);
      return null;
    }
    console.log(
      `  ✓ Baglandi: ${check.facts.usr}@${check.facts.db} ` +
        `(superuser: ${check.facts.is_super ? 'evet' : 'HAYIR'})`
    );
    if (!check.facts.is_super) {
      console.log('  ⚠️ Bu kullanici da superuser DEGIL; grant migration\'lari yine dusebilir.');
    }

    // ⚠️ KAYIT ISTEGE BAGLI ve 600: dize bir SIR. Kaydetmemek de gecerli bir
    // secim — o zaman yalniz bu kosu icin kullanilir, diske hic yazilmaz.
    const save = await ask(
      `  ${MIGRATION_ENV_FILE} icine 600 izniyle kaydedilsin mi? (evet/hayir): `
    );
    if (yes(save)) {
      try {
        mkdirSync(dirname(MIGRATION_ENV_FILE), { recursive: true });
        writeFileSync(
          MIGRATION_ENV_FILE,
          `SINAV_MIGRATION_DB_CONNECTION_STRING=${conn}\n`,
          { mode: 0o600 }
        );
        chmodSync(MIGRATION_ENV_FILE, 0o600);
        console.log(`  ✓ Kaydedildi: ${MIGRATION_ENV_FILE} (600)`);
        console.log('    ⚠️ ../env/.env DEGIL: env-to-json.mjs oradaki her anahtari');
        console.log('       pm2 JSON\'ina, yani tum servislerin ortamina tasirdi.');
      } catch (e) {
        console.error(`  Kaydedilemedi (${e.message}) — dize yalniz bu kosuda kullanilacak.`);
      }
    }
    return { conn, source: 'etkilesimli giris' };
  }
}

async function openClient(conn, source) {
  const client = new pg.Client({ connectionString: conn, connectionTimeoutMillis: 8000 });
  client.connSource = source;
  await client.connect();
  return client;
}

async function dispatch(client, rest, assumeYes) {
  if (rest[0] === '--status') return cmdStatus(client);
  if (rest[0] === '--baseline') return cmdBaseline(client, assumeYes);
  if (rest[0] === '--pending') return cmdPending(client);
  return cmdExplicit(client, rest);
}

async function main() {
  const argv = process.argv.slice(2);
  const assumeYes = argv.includes('--yes');
  const rest = argv.filter((a) => a !== '--yes');

  // ⚠️ BILINMEYEN BAYRAK SESSIZCE DOSYA ADI SANILIYORDU. `--status,` yazilinca
  // hata "ENOENT: .../--status,.sql" oluyordu — kullanici yazim hatasini degil
  // kayip bir migration dosyasini arardi.
  const unknownFlag = rest.find((a) => a.startsWith('-') && !a.endsWith('.sql'));
  const KNOWN = ['--status', '--baseline', '--pending', '--all-since'];
  if (unknownFlag && !KNOWN.includes(unknownFlag)) {
    throw new Error(
      `Bilinmeyen secenek: ${unknownFlag}\n  Gecerli: ${KNOWN.join(' | ')} | <dosya.sql>`
    );
  }

  const { conn, source } = getConnString();
  let client = await openClient(conn, source);
  let code;
  try {
    try {
      code = await dispatch(client, rest, assumeYes);
    } catch (err) {
      // Yetki duvari: TTY varsa dizeyi SOR ve AYNI komutu tekrar kos.
      if (!err?.needsSuperuser) throw err;
      const elevated = await promptForSuperuserConn(err, conn);
      if (!elevated) throw err;
      await client.end().catch(() => {});
      client = await openClient(elevated.conn, elevated.source);
      console.log('');
      code = await dispatch(client, rest, assumeYes);
    }
  } finally {
    await client.end().catch(() => {});
  }
  if (code) process.exit(code);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
