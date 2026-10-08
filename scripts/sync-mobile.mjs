// Monorepo → sinav-mobile üretilmiş kopya senkronu (PLAN-P0 §6).
//   node scripts/sync-mobile.mjs --target ../sinav-mobile
// Token'ları derler; design-tokens/native, client-sdk, i18n ve shared/domain dosyalarını
// <target>/src/shared/vendor/ altına kopyalar; vendor/manifest.json yazar.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const targetArg = argv.includes('--target') ? argv[argv.indexOf('--target') + 1] : null;
if (!targetArg) {
  console.error('Kullanım: node scripts/sync-mobile.mjs --target ../sinav-mobile');
  process.exit(2);
}
const TARGET = path.resolve(process.cwd(), targetArg);
if (!existsSync(path.join(TARGET, 'package.json'))) {
  console.error(`Hedef bir proje değil: ${TARGET}`);
  process.exit(2);
}
const VENDOR = path.join(TARGET, 'src/shared/vendor');
const HEADER = '// ÜRETİLDİ — elle düzenleme. Kaynak: sinav-mono-repo (npm run sync:mobile).\n';

// [vendor klasörü, [kaynak (ROOT'a göre) → vendor içi yol]]
const PLAN = {
  'design-tokens': [['packages/design-tokens/dist/native', '']],
  'client-sdk': [['packages/client-sdk/index.js', 'index.js'], ['packages/client-sdk/src', 'src']],
  i18n: [['packages/i18n/index.js', 'index.js'], ['packages/i18n/keys', 'keys']],
  domain: [['packages/modules/shared/domain', '']],
};
// SAF domain kodu: node bağımlılığı yasak.
const FORBIDDEN = /(?:from\s+['"]node:|require\(\s*['"](?:fs|path|crypto|os|child_process|http|https|net|stream|util)['"]|from\s+['"](?:fs|path|crypto|os|child_process)['"]|process\.env|\bBuffer\b)/;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const walk = (p) => {
  if (statSync(p).isFile()) return [p];
  return readdirSync(p, { withFileTypes: true }).flatMap((d) => walk(path.join(p, d.name)));
};
const git = (...a) => {
  try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; }
};

console.log('> tokens:build');
execFileSync(process.execPath, [path.join(ROOT, 'packages/design-tokens/build.mjs')], { cwd: ROOT, stdio: 'inherit' });

rmSync(VENDOR, { recursive: true, force: true });
mkdirSync(VENDOR, { recursive: true });
const files = {};
for (const [name, entries] of Object.entries(PLAN)) {
  for (const [srcRel, destRel] of entries) {
    const src = path.join(ROOT, srcRel);
    for (const file of walk(src)) {
      if (!file.endsWith('.js')) continue;
      const rel = path.relative(src, file);
      const dest = path.join(VENDOR, name, destRel, rel === '.' ? path.basename(file) : rel);
      const body = readFileSync(file, 'utf8');
      if (name === 'domain' && FORBIDDEN.test(body)) {
        console.error(`domain dosyası saf değil (node bağımlılığı): ${path.relative(ROOT, file)}`);
        process.exit(1);
      }
      mkdirSync(path.dirname(dest), { recursive: true });
      const out = Buffer.from(HEADER + body);
      writeFileSync(dest, out);
      files[path.relative(VENDOR, dest).split(path.sep).join('/')] = {
        sha256: sha256(out),
        source: path.relative(ROOT, file).split(path.sep).join('/'),
        sourceSha256: sha256(readFileSync(file)),
      };
    }
  }
}
const manifest = {
  generatedBy: 'scripts/sync-mobile.mjs',
  monorepo: { sha: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain', 'packages').length > 0 },
  files,
};
writeFileSync(path.join(VENDOR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`vendor güncellendi: ${Object.keys(files).length} dosya → ${path.relative(process.cwd(), VENDOR)}`);
