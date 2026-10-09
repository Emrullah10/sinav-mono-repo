// PM2 process manifest — SUNUCU (staging/prod). oregon-mono-repo ile aynı model.
//
//   ENV_FILE=.env.generated.json pm2 startOrReload ecosystem.config.cjs --update-env
//
// Normalde bunu elle çağırmazsınız: `npm run update` (scripts/update.sh)
// `../env/.env`i source eder, ondan `.env.generated.json`u türetir ve pm2'yi
// bununla yükler. Yerel geliştirme için `scripts/ecosystem.config.cjs` ayrıdır.
//
// ENV_FILE ZORUNLUDUR ve yoksa fail-fast: onsuz başlamak operatörün kabuğunu
// sessizce miras almak demektir — staging'in üretim veritabanına bağlanması
// tam olarak böyle olur. Eski `SINAV_ENV=<profil>` + `infra/environments/*.json`
// yolu 2026-09-04'te BIRAKILDI (kullanıcı kararı: env tek kaynak `../env/.env`).
const fs = require('fs');
const path = require('path');

const envFile = process.env.ENV_FILE;
if (!envFile) {
  console.error('[ecosystem] ENV_FILE tanimsiz.');
  console.error('[ecosystem] kullanim: npm run update   (ya da ENV_FILE=<json> pm2 startOrReload ecosystem.config.cjs)');
  process.exit(1);
}
const envPath = path.isAbsolute(envFile) ? envFile : path.join(__dirname, envFile);
if (!fs.existsSync(envPath)) {
  console.error(`[ecosystem] ENV_FILE bulunamadi: ${envPath}`);
  process.exit(1);
}
const env = JSON.parse(fs.readFileSync(envPath, 'utf8'));

const servicesDir = path.join(__dirname, 'services');
const names = fs
  .readdirSync(servicesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(servicesDir, d.name, 'main.js')))
  .map((d) => d.name)
  .sort((a, b) => a.localeCompare(b));

// Gateway EN SON: açılışta Redis'teki route kaydını fotoğraflar; downstream'ler
// kayıt olmadan kalkarsa ilk istekler ROUTE_NOT_FOUND döner. update.sh ayrıca
// gateway'i sonradan bir kez daha restart eder.
const gateway = 'sinav-web-gateway';
const ordered = [...names.filter((n) => n !== gateway), gateway];

module.exports = {
  apps: ordered.map((name) => ({
    name,
    cwd: path.join(servicesDir, name),
    script: './main.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    // Graceful drain'den (server.close → redis quit + pg pool end) UZUN olmalı;
    // PM2'nin 1600 ms varsayılanı drain ortasında SIGKILL atar.
    kill_timeout: 30000,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    env,
  })),
};
