# Monorepo Mimari Şablonu

> **Sürüm 2.0 · Son doğrulama: 2026-09-27** · Referans uygulama: `tropiq-mono-repo`, `main` @ `d4f26c9d`
>
> Önceki sürüm (1.0, 2026-07-05) `core/` ile `services/` klasörlerinin rolünü ters anlatıyordu. Bu sürüm baştan, referans reponun koduyla karşılaştırılarak yazıldı. Her kural referans repodaki bir dosyaya dayanır.

Bu doküman bir **kurulum sözleşmesidir**. Yeni bir projenin kökünde bir AI ajanına (ya da sana) verildiğinde, bu mimariyi **soru sormadan** kurmaya yetecek kararları, dosya şablonlarını ve her adımın doğrulama komutlarını içerir. Her bölüm önce **kuralı**, sonra kısa **gerekçeyi**, gerekiyorsa **şablonu** verir. Gerekçelerin çoğu referans projede yaşanmış bir hatadan gelir. `bug-NNNN` numaraları referans reponun `.wolf/buglog.json` dosyasındadır.

## İçindekiler

0. Ajan çalışma kuralları
1. Mimari özet
2. Klasör haritası
3. Kök dosyalar
4. Veritabanı: şema dosyaları, tablo kuralları, migration
5. `table-definitions.js`: şemanın koddaki aynası
6. `packages/`: paylaşılan kütüphaneler
7. `core/`: üretilen CRUD katmanı
8. `services/`: elle yazılan servis
9. Gateway
10. Servisler arası iletişim
11. Dış entegrasyonlar: port/adaptör deseni
12. Arka plan işleri ve süreç yaşam döngüsü
13. Ortamlar, config ve sırlar
14. Çalıştırma ve dağıtım
15. Test stratejisi
16. Frontend
17. Landing ve ortak içerik paketleri
18. AI katmanı
19. Kurulum rehberi: faz faz
20. Tek servisli sadeleştirilmiş varyant
21. Bilinen tuzaklar
22. Tropiq'ten bilerek farklı olanlar
23. Bu dokümanı güncel tutma

---

## 0. Ajan çalışma kuralları

### 0.1 Kural dili

| Etiket | Anlamı |
|---|---|
| **ZORUNLU** | Uygula. Sapman gerekiyorsa gerekçesini `docs/DECISIONS.md` dosyasına yaz. |
| **VARSAYILAN** | Proje tanımı aksini söylemiyorsa uygula. Tanım aksini söylüyorsa tanım kazanır. |
| **İSTEĞE BAĞLI** | Yalnızca ihtiyaç varsa kur (ödeme, SMS, harita, push, landing...). |

Etiketsiz kurallar VARSAYILAN sayılır.

### 0.2 Soru sormadan ilerleme

1. Dokümanda ZORUNLU ya da VARSAYILAN olarak yazan bir kararı sorma, uygula.
2. Dokümanda olmayan ama **geri alınabilen** bir karar: en basit seçeneği uygula, `docs/DECISIONS.md` dosyasına tek satır yaz (`[YYYY-MM-DD] Karar — gerekçe — nasıl geri alınır`) ve devam et.
3. Yalnızca şu durumlarda dur ve sor:
   - para harcatan bir işlem,
   - dış hesap ya da anahtar gerektiren bir kurulum (ödeme, SMS, e-posta sağlayıcısı, alan adı, bulut),
   - üretim ya da staging verisine dokunan bir işlem,
   - veri silme,
   - dışarıya yayın (push, deploy, paylaşım).

   Bu durumlarda da işi o adıma kadar getir, adımı `docs/DECISIONS.md` dosyasında `BEKLİYOR` diye işaretle ve sonraki bağımsız işe geç.
4. Koddan, dosyadan ya da komut çıktısından öğrenilebilecek hiçbir şeyi sorma; önce bak.
5. Her fazın (§19) "Bitti sayılır" komutlarını çalıştır. Sonuç kırmızıysa sonraki faza geçme, önce sebebini düzelt.
6. Çalıştırıp görmeden "çalışıyor" deme. Test ve ekran doğrulaması yapılmamış bir iş bitmemiştir.

### 0.3 Yer tutucular

| Yer tutucu | Anlamı | Nasıl belirlenir | Referanstaki değer |
|---|---|---|---|
| `<proje>` | küçük harf, kebab-case kısa ad | Proje klasörünün adından `-mono-repo` atılarak. Klasör adı uygun değilse ürün adından. | `tropiq` |
| `<Proje>` | görünen ad | proje tanımından | `Tropiq` |
| `<PROJE>` | env öneki | `<proje>` büyük harf, `-` yerine `_` | `TROPIQ` |
| `<proje_db>` | veritabanı adı | `<proje>`, `-` yerine `_` | `tropiq` |
| `<domain>` | servis alanı; tekil, kebab-case | proje tanımındaki iş alanlarından | `rfq`, `billing` |
| `<DOMAIN>` | env için alan adı | `<domain>` büyük harf, `-` yerine `_` | `RFQ` |
| `<şema>` | domain'in Postgres şeması (snake_case) | genellikle `<domain>` | `rfq`, `bidding` |
| `<PORT_BASE>` | gateway portu | VARSAYILAN `1000`. `lsof -nP -iTCP:1000 -sTCP:LISTEN` bir şey döndürürse sırayla `2000`, `5000`, `7000`. | `1000` |
| `<TZ>` | iş saat dilimi | proje tanımından; yoksa `Europe/Istanbul` | `Europe/Istanbul` |
| `<diller>` | arayüz dilleri | proje tanımından; yoksa `tr,en` | `tr,en` |
| `<app-host>` / `<landing-host>` | üretim alan adları | Proje tanımından. Yoksa `app.<proje>.com` / `<proje>.com` kullan ve DECISIONS'a `BEKLİYOR` yaz. | `app.tropiq.io` / `tropiq.io` |

Yer tutuculardan türeyen adlar (ZORUNLU):

| Nesne | Ad |
|---|---|
| Servis klasörü ve npm adı | `services/<proje>-service-<domain>` / `<proje>-service-<domain>` |
| Gateway | `services/<proje>-web-gateway` |
| Core klasörü ve npm adı | `core/service-<domain>` / `service-<domain>-core` |
| API yolu | `/api/<proje>-service-<domain>/v1/...` (`basePathPrefix=/api`, `basePath=/<proje>-service-<domain>`) |
| Servis adres env'i | `SERVICE_<DOMAIN>_REST_URL` (servisin portu buradan türetilir) |
| Portlar | Gateway `<PORT_BASE>`. Servisler `<PORT_BASE>+1`'den başlayarak oluşturulma sırasıyla. Atanan port bir daha değişmez. |
| Frontend / landing | `<proje>-web-app` / `<proje>-landing-app` |
| DB servis rolü | `<proje>_svc` |
| CSRF çerezleri | `<proje>_csrf` (httpOnly, imzalı) + `<proje>_xsrf` (JS'in okuyabildiği) |
| E2E compose projesi / imajı | `<proje>-e2e` / `<proje>-e2e:latest` |
| Test veritabanları | `<proje_db>_test_<worker>` |

### 0.4 Referans uygulama ve kopyalama

- Referans repo bu makinede şurada: `/Users/emrullah/developer/fullStack/company/tropiq/tropiq-mono-repo`.
  - **Erişilebiliyorsa** §6.1 ve §6.3'te "Kopyala" diye işaretli dosyaları oradan al.
  - **Erişilemiyorsa** aynı dosyaları bu dokümandaki sözleşmelere göre sıfırdan yaz.
- Kopyaladıktan sonra temizlik ZORUNLU (§19 Faz 2): `grep -rniE "tropiq" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs --exclude-dir=.wolf .` hiçbir sonuç döndürmemeli. `dbName` alanları, çerez adları, yol önekleri, rol adları, test DB adları, önbellek klasörleri ve yorumlar dahil her yer değişir. (`docs/` hariç tutulur, çünkü bu dokümanın kopyası referans projeyi adıyla anar.)
- Referans repodaki iş kurallarını (ihale, teklif, abonelik, ödeme sağlayıcısı...) kopyalama; yalnızca altyapıyı kopyala. Liste §6.3'te.
- Referans repodaki bilinen hataları da kopyalama. Liste §22'de.

### 0.5 Karar kaydı

Faz 0'da iki dosya oluştur:
- `docs/ARCHITECTURE.md`: bu dosyanın kopyası; zamanla projeye özel değerlerle güncellenir.
- `docs/DECISIONS.md`: şu içerikle başlar:
  - yer tutucuların değerleri,
  - servis tablosu (`domain | şema | port | sahip olduğu tablolar`),
  - kurulan ve kurulmayan İSTEĞE BAĞLI bileşenler,
  - `BEKLİYOR` işaretli dış bağımlılıklar.

`docs/` klasörü git'te izlenir. Tropiq'te izlenmiyordu; gerekçe §22'de.

---

## 1. Mimari özet

### 1.1 Katmanlar

```
                 tarayıcı
   ┌───────────────────┐   ┌─────────────────────┐
   │ <proje>-web-app   │   │ <proje>-landing-app │   ayrı origin (§17)
   │ React SPA         │   │ Astro, statik       │
   └─────────┬─────────┘   └─────────────────────┘
             │ /api/*   (httpOnly JWT çerezi + X-XSRF-TOKEN)
   ┌─────────▼──────────────────────────────────────────────┐
   │ <proje>-web-gateway  = GÜVENLİK SINIRI                 │
   │ JWT + oturum + CSRF + rate limit + izin kontrolü       │
   │ kimlik header'larını siler/yazar → proxy               │
   └─────────┬──────────────────────────────────────────────┘
             │ userAccount* header'ları (yalnızca gateway yazar)
   ┌─────────▼──────────────────────────────────────────────┐
   │ services/<proje>-service-<domain>   (ELLE yazılır, DDD)│
   │ routes → interfaces/http → container → use-case → SQL  │
   │   + core/service-<domain>  (ÜRETİLEN auto-CRUD tabanı) │
   └───────┬─────────────────────────────┬──────────────────┘
           │ pg                          │ ioredis
   ┌───────▼────────────┐        ┌───────▼─────────────────────┐
   │ PostgreSQL (tek DB)│        │ Redis                       │
   │ domain = şema      │        │ servis kaydı, pub/sub,      │
   │ (TimescaleDB imajı)│        │ oturumlar, cron kilitleri   │
   └────────────────────┘        └─────────────────────────────┘

   packages/*  → servislerin, core'un ve gerektiğinde web'in kullandığı kütüphaneler
```

Bağımlılık yönü (ZORUNLU):
- `services/*` → `core/*` → `packages/*`. Ters yön yasak.
- Servisler birbirini **import etmez**; birbirleriyle yalnızca HTTP ile konuşur (§10).
- `packages/*` hiçbir servise ya da core'a bağımlı olmaz.
- Web uygulaması ortak iş kurallarını `app-shared` paketinden import edebilir (§6.2).

### 1.2 Bir isteğin yolculuğu

1. SPA, `POST /api/<proje>-service-<domain>/v1/bookings/{bookingCode}/confirm` isteğini çerezlerle ve `X-XSRF-TOKEN` başlığıyla gönderir.
2. **Gateway** şu adımları sırayla işletir:
   - ortak middleware ve rate limit,
   - yol public değilse JWT doğrulaması, oturumun Redis'te durup durmadığı (yoksa 401 `SESSION_GONE`) ve CSRF kontrolü,
   - route registry'de `(method, path)` araması. Kayıt yoksa 404 `ROUTE_NOT_FOUND`, kayıt internal ise 401, kaydın izin listesi boşsa 500 `PERMISSION_NOT_CONFIGURED`. İzin `'*'` değilse JWT'deki izinlerle kesişim aranır; kesişim yoksa 403.
   - İstemcinin gönderdiği kimlik başlıkları silinir, JWT'den türetilenler yazılır ve istek servise proxy'lenir.
3. **Servis**: Express route'u, OpenAPI'deki `x-functionName` üzerinden `routes/rest-routes.js` içindeki handler'a bağlıdır. `wrap(handler)`, `getCaller(req.headers)` ile `caller` nesnesini kurar ve handler'ı çağırır.
4. **Handler**: `container.useCases.<aggregate>.<eylem>({ ...girdi, caller })` çağrısını yapar.
5. **Use-case**: önce guard'lar (izin, rol, organizasyon tipi), sonra iş kuralları, sonra `withTransaction` içinde SQL çalışır. Durum geçişlerinin kapısı `WHERE` koşulundadır. Yan etkiler commit'ten sonra gelir.
6. **Hata yolu**: `DomainError('BOOKING_NOT_CONFIRMABLE')` → `translate-domain-error` → `conflict(...)` (409 `ApiError`) → `wrap` → `{ success:false, error:{ code, message, details } }`.
   **Başarı yolu**: `{ success:true, data }`.
7. Login ve kayıt yanıtlarında gateway yanıtı yakalar, oturumu açar ve çerezleri basar (§9.4).

### 1.3 İlkeler (ZORUNLU)

1. **Şema tek noktadan değişir.** Bir tablo değişikliği aynı commit'te SQL base dosyasına, bir migration dosyasına ve `table-definitions.js`'e girer.
2. **Okuma otomatik, yazma elle.** Basit liste okumaları `core/`'un ürettiği auto-CRUD'dan gelir. Domain tablolarına yalnızca elle yazılmış use-case'ler yazar; auto-CRUD POST kapalıdır.
3. **Kimlik yalnızca gateway'de doğrulanır.** Servisler gateway'in yazdığı başlıklara güvenir. Bu yüzden servisler dış ağa açılmaz, loopback'e bağlanır.
4. **Varsayılan kapalıdır.** Organizasyon verisi otomatik olarak çağıranın organizasyonuna göre süzülür. Kapsam kolonu olmayan tablo HTTP'den okunamaz. İzni tanımlanmamış route 500, registry'de olmayan route 404 döner.
5. **Her dış entegrasyon bir port arkasındadır.** Gerçek adaptör tek bir env değişkeniyle kurulur. Sahte adaptör üretimde kurulmayı reddeder.
6. **Sırlar repoda durmaz.** Örnek dosyalarda gerçek değer olmaz. Sessizce yanlış çalışacak bir yapılandırma, açılışı düşürür (fail-fast).
7. **Migration'lar bir defterle, her biri bir kez uygulanır.** Deploy sırası: build → migration → pm2.
8. **E2E'de önkoşul API ya da SQL ile kurulur; kullanıcıya görünen sonuç arayüzden ölçülür.**
9. **AI hafızası repodadır, bütçelidir ve hook'larla beslenir.**

---

## 2. Klasör haritası

```
<proje>-mono-repo/
├── core/                              # ÜRETİLEN auto-CRUD tabanı (§7). İş mantığı YOK.
│   └── service-<domain>/
├── services/                          # ELLE yazılan servisler (§8) + gateway (§9)
│   ├── <proje>-service-<domain>/
│   └── <proje>-web-gateway/
├── packages/                          # paylaşılan kütüphaneler (§6)
│   ├── modules/
│   │   ├── config/  datasource/  entity-factory/  errors/  example-builder/
│   │   └── helper/  language/  middlewares/  service-discovery/  shared/
│   ├── persistence-utils/
│   ├── query-builder/
│   └── legal-content/                 # İSTEĞE BAĞLI: web ve landing'in ortak metinleri (§17)
├── db-schemas/                        # SQL kaynağı + migrations/ (§4)
├── scripts/                           # build-schema, apply-migrations, update.sh... (§4, §14)
├── test/                              # Jest: config/ + services/<svc>/ (§15)
├── e2e/                               # Playwright (§15.7)
├── <proje>-web-app/                   # React SPA (§16)
├── <proje>-landing-app/               # Astro (§17), İSTEĞE BAĞLI
├── docs/                              # ARCHITECTURE.md, DECISIONS.md, raporlar. GIT'TE İZLENİR.
├── secrets/                           # gitignore'da: yerel anahtarlar (JWT pem...)
├── __mocks__/                         # Jest kök mock'ları (gerekirse)
├── .claude/  .wolf/  .cursor/  .mcp.json  CLAUDE.md  AGENTS.md    # AI katmanı (§18)
├── docker-compose.dev.yml             # yerel Postgres + Redis (§3.5)
├── docker-compose.e2e.yml  Dockerfile.e2e  .dockerignore           # E2E yığını (§15.7)
├── ecosystem.config.cjs               # SUNUCU PM2 manifesti (§14.3)
├── jest.config.js  eslint.config.js  package.json  package-lock.json
├── .env.example  .env.test.example
└── README.md  TEST-GUIDE.md
```

### 2.1 Git'te izlenenler ve izlenmeyenler (ZORUNLU)

| İzlenir | İzlenmez (üretilir ya da makineye yereldir) |
|---|---|
| Kaynak kod, `db-schemas/*.sql` ve `migrations/`, `docs/`, `package-lock.json`, `.env*.example` dosyaları, `.claude/{settings.json,rules,commands,skills}`, `.mcp.json`, `.cursor/rules`, `CLAUDE.md`, `AGENTS.md`, `.wolf/{OPENWOLF.md,STATUS.md,cerebrum.md,cerebrum-archive.md,buglog.json,buglog-archive.json,config.json,cron-manifest.json,plans/}` | `node_modules`, `.env`, `.env.test`, `.env.generated.json`, `secrets/`, `*.pem`, servis hesabı JSON'ları, `db-schemas/_combined.sql`, `dist/`, `dist-e2e/`, `e2e/.jwt/`, `e2e/playwright-report/`, `e2e/test-results/`, `.claude/settings.local.json`, `.codegraph/`, `.wolf/{hooks,backups,anatomy.md,anatomy.json,anatomy-index.json,memory.md,token-ledger.json,cron-state.json,suggestions.json,designqc-*}` |

---

## 3. Kök dosyalar

### 3.1 `package.json` (ZORUNLU)

Bağımlılıkların **tamamı** (backend, frontend ve landing araçları) kökteki `package.json`'dadır. `<proje>-web-app/package.json` yalnızca script'leri ve istisnai bağımlılıkları taşır. Gerekçe: web, `app-shared`'i kökteki `node_modules` symlink'i üzerinden import eder ve `vite build` kökten çalışır. Tek bir bağımlılık ağacı, katmanlar arasında sürüm ayrışmasını da önler.

```json
{
  "name": "<proje>-monorepo",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "workspaces": [
    "packages/modules/*",
    "packages/persistence-utils",
    "packages/query-builder",
    "packages/legal-content",
    "core/*",
    "services/*"
  ],
  "scripts": {
    "db:up": "docker compose -f docker-compose.dev.yml up -d",
    "db:down": "docker compose -f docker-compose.dev.yml down",
    "dev:backend": "bash scripts/start-backend.sh",
    "dev:local": "cd <proje>-web-app && VITE_PROXY_TARGET=http://127.0.0.1:<PORT_BASE> vite",
    "dev": "cd <proje>-web-app && vite",
    "build": "cd <proje>-web-app && vite build",
    "build-schema": "node scripts/build-schema.js",
    "migrate:status": "node scripts/apply-migrations.mjs --status",
    "migrate": "node scripts/apply-migrations.mjs --pending",
    "build-role-permission-seed": "node scripts/build-role-permission-seed.js --write",
    "validate-auth-config": "node scripts/validate-auth-config.js",
    "sync-role-permissions": "node scripts/sync-role-permissions.mjs",
    "update": "bash scripts/update.sh",
    "lint": "eslint .; b=$?; (cd <proje>-web-app && eslint .); w=$?; exit $(( b > w ? b : w ))",
    "format": "prettier --write \"./**/*.{js,jsx,json,css,scss,md}\"",
    "test": "node --experimental-vm-modules node_modules/.bin/jest",
    "test:fast": "TEST_REUSE_DB=1 node --experimental-vm-modules node_modules/.bin/jest",
    "test:backend": "node --experimental-vm-modules node_modules/.bin/jest --selectProjects backend",
    "test:web": "node --experimental-vm-modules node_modules/.bin/jest --selectProjects web",
    "test:unit": "node --experimental-vm-modules node_modules/.bin/jest --testPathPattern=test/services/.*/unit",
    "test:integration": "node --experimental-vm-modules node_modules/.bin/jest --testPathPattern=test/services/.*/integration",
    "test:packages": "node --experimental-vm-modules node_modules/.bin/jest --testPathPattern=packages/.*/__tests__",
    "test:refresh-schema": "TEST_DB_REFRESH=1 node --experimental-vm-modules node_modules/.bin/jest",
    "test:e2e:full": "node e2e/run.js",
    "test:e2e:report": "npx playwright show-report e2e/playwright-report"
  },
  "prettier": { "singleQuote": true }
}
```

- `dev` script'i Vite'ı **staging backend'ine** proxy'ler (§16.12); yerel backend için `dev:local` kullanılır.
- Landing varsa `build` şöyle olur: `cd <proje>-web-app && vite build && cd ../<proje>-landing-app && npm run build`.
- `packages/legal-content` yalnızca o paket varsa workspaces listesinde durur.

Bağımlılıklar referans projedeki sürüm aralıklarıyla (`npm install <paket>@<aralık>`) kurulur:

| Grup | Paketler |
|---|---|
| Backend, ZORUNLU | `express@^5.2.1` `pg@^8.20.0` `ioredis@^5.10.1` `12factor-config@^2.0.0` `dotenv@^17.3.1` `helmet@^8.1.0` `compression@^1.8.1` `body-parser@^2.2.2` `cookie-parser@^1.4.7` `cookie@^1.0.2` `cors@^2.8.6` `csrf-csrf@^4.0.3` `express-rate-limit@^8.3.2` `http-proxy-middleware@4.2.0` (tam sürüm) `jsonwebtoken@^9.0.3` `multer@^2.1.1` `node-cron@^4.2.1` `lodash@^4.17.23` `uuid@^13.0.0` `swagger-ui-express@^5.0.1` `express-openapi-validator@^5.6.2` `xml2js@^0.6.2` `@faker-js/faker@^10.6.0` (example-builder çalışma zamanında kullanır) |
| Backend, İSTEĞE BAĞLI | `bcrypt@^6.0.0` (şifreli giriş) · `nodemailer@^10.0.0` (SMTP) · `firebase-admin@^13.6.0` (push) · `sharp@^0.35.4` (görsel) · `exceljs@^4.4.0` (Excel dışa aktarım) |
| Frontend, ZORUNLU | `react@^19.2.4` `react-dom@^19.2.4` `react-router-dom@^7.13.1` `@tanstack/react-query@^5.90.21` `zustand@^5.0.12` `axios@^1.14.0` `@mui/material@^7.3.9` `@mui/lab@^7.0.1-beta.23` `@emotion/react@^11.14.0` `@emotion/styled@^11.14.1` `react-hook-form@7.82.0` (tam sürüm, §21) `i18next@^25.8.18` `react-i18next@^16.5.8` `i18next-browser-languagedetector@^8.2.1` `notistack@^3.0.2` `classnames@^2.5.1` `dayjs@^1.11.20` `@phosphor-icons/react@^2.1.10` |
| Frontend, İSTEĞE BAĞLI | `ag-grid-react@^35.1.0` + `ag-grid-enterprise@^35.1.0` (**ticari lisans gerekir**; lisans yoksa `ag-grid-community`) · `echarts@^6.0.0` + `echarts-for-react@^3.0.6` · `ol@^10.9.0` + `ol-mapbox-style@^13.5.1` (harita) · `firebase@^12.16.0` (web push) · ekrana özel paketler (`react-datepicker`, `@mui/x-tree-view`, `country-flag-icons`...) ihtiyaç oldukça |
| Geliştirme, ZORUNLU | `vite@^8.0.0` `@vitejs/plugin-react@^6.0.1` `sass-embedded@^1.98.0` `eslint@^9.39.4` `@eslint/js@^9.39.4` `globals@^17.4.0` `eslint-plugin-react@^7.37.5` `eslint-plugin-react-hooks@^7.0.1` `eslint-plugin-react-refresh@^0.5.2` `eslint-plugin-import@^2.26.0` `prettier@^3.8.1` `jest@^29.7.0` `@jest/globals@^29.7.0` `babel-jest@^29.7.0` `@babel/core@^7.29.7` `@babel/preset-env@^7.29.7` `@babel/preset-react@^7.29.7` `jest-environment-jsdom@^29.7.0` `@testing-library/react@^16.3.2` `@testing-library/jest-dom@^6.9.1` `identity-obj-proxy@^3.0.0` `supertest@^7.1.0` `@playwright/test@^1.61.0` |
| Landing, İSTEĞE BAĞLI | `astro@^6.1.0` `@astrojs/sitemap@^3.3.0` `astro-icon@^1.1.5` `tailwindcss@^4.1.0` `@tailwindcss/vite@^4.1.0` `prettier-plugin-astro@^0.14.1` `prettier-plugin-tailwindcss@^0.6.11` |
| **Ekleme** | `kafkajs`, `mqtt`, `redisgraph.js`, `pg-promise`, `xss-filters`: referansta kurulu ama hiç import edilmiyor. `@confluentinc/kafka-javascript`: yalnızca Kafka kullanılacaksa (§6.8). |

`package-lock.json` commit'lenir ve kurulumlar `npm ci` ile yapılır (Tropiq'te farklı, §22).

### 3.2 `.gitignore` (ZORUNLU)

```gitignore
**/node_modules
*.log
.DS_Store
.worktrees/

# env ve sırlar
.env
.env.*
!.env.example
!.env.test.example
!<proje>-web-app/.env.example
.env.generated.json
secrets/
*.pem
**/*firebase-adminsdk*.json
**/firebase-service-account*.json
**/google-services.json

# üretilen çıktılar
db-schemas/_combined.sql
**/dist/
<proje>-web-app/dist-e2e/
coverage/
e2e/.jwt/
e2e/playwright-report/
e2e/test-results/

# AI katmanı: kişisel ve makineye yerel dosyalar
.claude/settings.local.json
.claude/**/*.local.json
.codegraph/
.wolf/hooks/
.wolf/backups/
.wolf/cron-state.json
.wolf/token-ledger.json
.wolf/suggestions.json
.wolf/designqc-report.json
.wolf/designqc-captures/
.wolf/anatomy.md
.wolf/anatomy.json
.wolf/anatomy-index.json
.wolf/memory.md
```

`docs/` ve `package-lock.json` bu listede **yoktur**; bilinçli olarak izlenirler.

### 3.3 Lint ve format

- **Kök `eslint.config.js`** yalnızca backend'i kapsar (`services/`, `core/`, `packages/`, `test/`, `scripts/`, `e2e/`). Web ve landing'in kendi config'leri vardır. Flat config alt klasörlere miras vermez; kökten `eslint .` çalıştırıldığında alt config'ler devreye girmez. Bu yüzden kök config onları `ignores` listesine koyar. Aksi halde `.jsx` dosyaları hiç taranmaz ama komut exit 0 verir ve "frontend temiz" yanılsaması doğar.

  ```js
  import globals from 'globals';
  import pluginJs from '@eslint/js';

  export default [
    { ignores: ['.vscode/*', '.wolf/**', '<proje>-web-app/**', '<proje>-landing-app/**'] },
    { languageOptions: { globals: { ...globals.browser, ...globals.jest } } },
    pluginJs.configs.recommended,
    { rules: { 'no-unused-vars': 'off', 'no-undef': 'off' } },
    { files: ['e2e/**/*.js'], languageOptions: { globals: globals.node }, rules: { 'no-undef': 'error' } },
  ];
  ```

- **Web `eslint.config.js`**: `@eslint/js` + `eslint-plugin-react` + `react-hooks` + `react-refresh`. `ignores` listesinde `dist` ile birlikte `dist-e2e` de olmalı; yoksa bir E2E koşusundan sonra lint minified paketi tarar ve yaklaşık 1500 sahte hata basar.
- **Prettier**: kökte `{ "singleQuote": true }`. Web'deki `.prettierrc.json`:

  ```json
  { "trailingComma": "es5", "semi": true, "tabWidth": 2, "singleQuote": true }
  ```

### 3.4 `.env.example` (ZORUNLU sözleşme)

`.env.example`, kodda okunan **her** env anahtarının belgelendiği sözleşmedir. Kurallar:
- Gerçek değer içermez.
- Her bölümün başında kısa bir açıklama bulunur.
- Sessiz yanlış yapılandırma riski taşıyan her satırın yanında bir uyarı yorumu yer alır.

```dotenv
# ── Servis adresleri: her servisin PORTU bu URL'den türetilir ──────────────
GATEWAY_REST_URL=http://127.0.0.1:<PORT_BASE>
SERVICE_IDENTITY_REST_URL=http://127.0.0.1:<PORT_BASE+1>
SERVICE_APP_REST_URL=http://127.0.0.1:<PORT_BASE+2>
SERVICE_<DOMAIN>_REST_URL=http://127.0.0.1:<PORT_BASE+N>

# ── Veri kaynakları (yerel: docker-compose.dev.yml) ──────────────────────────
CORE_APP_DB_CONNECTION_STRING=postgres://<proje>_dev:dev_pass@127.0.0.1:5432/<proje_db>
CORE_REDIS_URL=redis://127.0.0.1:6379
CORE_REDIS_PASSWORD=
CORE_DISCOVERY_REDIS_URL=redis://127.0.0.1:6379
CORE_DISCOVERY_REDIS_PASSWORD=
# PG_IDLE_IN_TRANSACTION_TIMEOUT_MS=

# ── Gateway ve servis keşfi ──────────────────────────────────────────────────
PROJECT_PREFIX=service
PUBSUB_CHANNEL=app.fct.servicerestarted
CORS_ORIGINS=http://127.0.0.1:3000
# Kullanıcıya giden mutlak linklerin kökü (paylaşım e-postası, davet). ÜRETİMDE ZORUNLU:
# boş kalırsa GATEWAY_REST_URL'e düşer ve kullanıcı çalışmayan bir link alır.
PUBLIC_APP_BASE_URL=http://127.0.0.1:3000
# APP_BASE=/          # SPA'nın servis edildiği yol; Vite ile sunucu AYNI değeri okur
# LISTEN_HOST=        # boş: servis, kendi URL host'u IP ya da localhost ise ona bağlanır (§6.7)
# GATEWAY_IS_HTTP_NGINX=true   # gateway bir TLS sonlandırıcının (nginx) arkasındaysa

# ── Oturum: SANİYE cinsinden TAM SAYI. '2880m' gibi sonek YASAK (§21) ────────
ACCESS_TOKEN_EXPIRY=3600
REFRESH_TOKEN_EXPIRY=1209600
# ALLOW_INSECURE_COOKIES=false   # yalnızca http üzerinden yerel geliştirme

# ── SIRLAR: burada GERÇEK DEĞER YOK. Üret: openssl rand -hex 32 ────────────────
INTERNAL_API_KEY=
COOKIE_SECRET=
OPENAPI_UI_KEY=
# Göreli yol REPO KÖKÜNE göre çözülür; sunucuda ../env/keys/ altında durur.
JWT_PRIVATE_KEY_PATH=secrets/jwt-private.pem
JWT_PUBLIC_KEY_PATH=secrets/jwt-public.pem

# ── Rate limit (boş = koddaki varsayılan) ───────────────────────────────────
# RATE_LIMIT_MAX=
# RATE_LIMIT_SESSION_MAX=
# RATE_LIMIT_AUTH_MAX=

# ── Zamanlanmış işler ────────────────────────────────────────────────────────
# DISABLE_CRON=true   # çok süreçli dağıtımda cron'u yalnızca BİR süreçte açık bırak

# ── İSTEĞE BAĞLI entegrasyonlar: TETİKLEYİCİ anahtar boşsa adaptör KURULMAZ (§11)
# E-posta — tetikleyici SMTP_HOST
# SMTP_HOST=
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=
# SMTP_PASSWORD=
# MAIL_FROM=
# SMS — tetikleyici <SAĞLAYICI>_PASSWORD. Test/E2E'de SMS_DISABLED=true ZORUNLU.
# SMS_DISABLED=
# Ödeme — PAYMENT_PROVIDER=fake yalnızca test/E2E'de (üretimde kurulmayı REDDEDER)
# PAYMENT_PROVIDER=
# Push (FCM) — servis hesabı JSON'u REPO DIŞINDA
# FCM_SERVICE_ACCOUNT_JSON_PATH=
# FCM_PROJECT_ID=
```

`.env.test.example` (§15.3):

```dotenv
# Kaynak DB: test şeması buradan pg_dump ile alınır. Yerelde docker-compose.dev.yml.
CORE_APP_DB_CONNECTION_STRING=postgres://<proje>_dev:dev_pass@127.0.0.1:5432/<proje_db>
TEST_DB_HOST=127.0.0.1
TEST_DB_PORT=5432
TEST_DB_USER=<proje>_dev
TEST_DB_PASSWORD=dev_pass
TEST_DB_NAME=<proje_db>_test
TEST_COPY_DATA=false
# Test Redis'i: DB 10, uygulama verisinden yalıtılmış
TEST_REDIS_URL=redis://127.0.0.1:6379
TEST_REDIS_PASSWORD=
TEST_DISCOVERY_REDIS_URL=redis://127.0.0.1:6379
TEST_DISCOVERY_REDIS_PASSWORD=
```

### 3.5 `docker-compose.dev.yml` (VARSAYILAN)

Tropiq'te yerel Postgres ve Redis elle `docker run` ile kurulmuştu (§22).

```yaml
name: <proje>-dev
services:
  dev-pg:
    image: timescale/timescaledb:2.27.2-pg18
    environment:
      POSTGRES_USER: <proje>_dev          # yerelde superuser; grant gerekmez
      POSTGRES_PASSWORD: dev_pass
      POSTGRES_DB: <proje_db>
    ports: ['5432:5432']                  # doluysa '5433:5432' ve .env'leri güncelle
    volumes:
      - dev-pg-data:/var/lib/postgresql   # PG 18+ imajlarında veri kökü (/data alt yolu DEĞİL)
      - ./db-schemas/_combined.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U <proje>_dev -d <proje_db>']
      interval: 3s
      timeout: 3s
      retries: 20
  dev-redis:
    image: redis:7-alpine
    ports: ['6379:6379']
volumes:
  dev-pg-data:
```

- `initdb` betikleri yalnızca **boş** veri klasöründe çalışır. Şema değiştiğinde çalışan dev DB'ye migration uygulanır (§4.8). Sıfırdan kurmak için: `npm run build-schema && docker compose -f docker-compose.dev.yml down -v && npm run db:up`.
- `_combined.sql` git'te değildir. `db:up`'tan önce `npm run build-schema` çalıştırılmış olmalı; yoksa Docker, dosya yerine boş bir **klasör** bağlar.

### 3.6 `Dockerfile.e2e` ve `.dockerignore`

```dockerfile
FROM node:24
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY core ./core
COPY services ./services
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
CMD ["node", "--version"]
```

```gitignore
# Host (macOS) node_modules imaja girmez: native modüller Linux için yeniden derlenir.
node_modules
**/node_modules
# .env dosyaları imaja girmez: development modunda config onları okur ve
# compose'un verdiği E2E değerlerini ezer (127.0.0.1 sorunu).
.env
.env.*
**/.env
**/.env.*
secrets
<proje>-web-app/dist
<proje>-web-app/dist-e2e
<proje>-landing-app/dist
.git
.wolf
e2e/.jwt
e2e/test-results
e2e/playwright-report
*.log
```

---

## 4. Veritabanı

### 4.1 Düzen (ZORUNLU)

- Tek bir PostgreSQL veritabanı vardır: `<proje_db>`. Her domain kendi şemasındadır (`identity`, `<şema>`...). Bunlara ek olarak:
  - `enums`: sözlük tabloları,
  - `reference`: platform geneli referans verisi,
  - `audit`: denetim izi,
  - `storage`: blob'lar, İSTEĞE BAĞLI,
  - `public`: yalnızca `global_code_seq` ve `schema_migrations`.
- **Şema sahipliği**: her şemanın tek bir sahibi servis vardır. Başka bir servis o şemaya doğrudan **yeni** bir yazım yolu açmaz. Çapraz yazım gerekiyorsa iki yol vardır:
  - (a) paylaşılan modülde tek bir uygulama (`packages/modules/shared/persistence/...`),
  - (b) sahibi servise HTTP (§10.2) ya da outbox tablosu (§10.3).

  Okumalarda tenant ve organization süzgeci zorunludur. Tropiq'te bilinçli istisnalar ölçülüp kayda geçirilmiştir (referans `.wolf/cerebrum.md`, Decision Log 2026-09-23).

### 4.2 Dosya düzeni ve numaralandırma

```
db-schemas/
├── 00-enums-schema.sql          # enums şeması + sözlük tabloları + rol/izin seed'i (seed kısmı ÜRETİLİR, §8.13)
├── 01-identity-schema.sql       # global_code_seq + tenant, organization, user_account...
├── 02-<domain>-schema.sql       # domain başına bir dosya; numara = bağımlılık sırası
├── 09-reference-schema.sql      # ülke, para birimi... (platform geneli)
├── 10-seed-data.sql             # zorunlu başlangıç verisi (tek tenant, sistem organizasyonu...)
├── 11-performance.sql           # index, hypertable (varsa)
├── 15-storage-schema.sql        # İSTEĞE BAĞLI: storage.blob (§11.3)
├── A00-bootstrap-database.sql   # SUPERUSER, elle, bir kez: <proje>_svc rolü + CREATE DATABASE
├── A97-demo-seed.sql            # demo verisi (elle)
├── A98-superadmin-howto.sql     # ilk superadmin'i oluşturma talimatı
├── A99-grants.sql               # SUPERUSER: <proje>_svc yetkileri + DEFAULT PRIVILEGES
├── _combined.sql                # ÜRETİLİR (gitignore'da): scripts/build-schema.js
└── migrations/                  # YYYY-MM-DD-N-aciklama.sql
```

- `A` ile başlayan dosyalar `_combined.sql`'e **girmez** (superuser gerektiren ya da elle çalıştırılan işler).
- `migrations/` klasörü `_combined.sql`'e **girmez**.
- Bir migration yazdığında aynı değişikliği ilgili numaralı base dosyaya da işle, aynı commit'te. Taze kurulumlar `_combined.sql`'den, çalışan veritabanları migration'dan kurulur.

### 4.3 Tablo kuralları (ZORUNLU)

1. **Kolon adları tablo adıyla öneklidir**: SQL'de `<tablo>_<kolon>` (snake_case), JS'te `<tablo><Kolon>` (camelCase). Gerekçe: query-builder kolonu yalnızca adıyla bulur, yani adların tüm tablolar arasında benzersiz olması gerekir. Kapsam kolonu tespiti (`...OrganizationId` ile biten ad) de bu kurala dayanır.
2. Standart kolonlar, bu sırayla:
   - `<t>_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`: iç kimlik.
   - `<t>_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq')`: dışa açılan kimlik. URL'lerde ve API'lerde bu kullanılır; FK'lerin çoğu buna bağlanır. `global_code_seq` sequence'ı `01-identity-schema.sql` içinde oluşturulur.
   - `<t>_tenant_code BIGINT NOT NULL`: FK `identity.tenant(tenant_code)`.
   - `<t>_organization_id BIGINT`: FK `identity.organization(organization_id)`. Sahip organizasyon, yani **kapsam kolonu**.
   - iş kolonları,
   - `<t>_metadata JSONB DEFAULT '{}'`,
   - `<t>_created_by BIGINT`, `<t>_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `<t>_updated_by BIGINT`, `<t>_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
3. **Karşı taraf organizasyon kolonu** (ör. alıcı–satıcı) SQL'de normal bir kolondur; `table-definitions.js`'te `excludeFromCallerScope: true` alır. Bir tabloda en fazla **bir** kapsam kolonu olabilir. İkincisi işaretlenmezse query-builder açılışta patlar.
4. **Durum ve tip kolonları** CHECK kısıtıyla değil, `enums.<ad>` tablosuna FK ile sınırlanır: `CONSTRAINT fk_<t>_<anlam> FOREIGN KEY (<t>_<kolon>) REFERENCES enums.<ad>(<ad>_value)`. Böylece arayüz geçerli değerleri sorgulayabilir.
5. **Kısıt adları**: `fk_<tablo>_<anlam>`, `uq_<tablo>_<anlam>`, `chk_<tablo>_<anlam>`; index adları `idx_<tablo>_<kolonlar>`.
6. **İnsan-okur referans numarası** (ör. `BKG-202609-000123`) gerekiyorsa şemaya ait bir sequence açılır (`<şema>.<t>_reference_seq`) ve use-case içinde, transaction içinde `nextval()` ile çekilir. Bu numara tenant başına UNIQUE'tir.
7. **Para**: `DECIMAL(15,2)` + ayrı bir `_currency VARCHAR(3)` kolonu.
8. **Zaman**: daima `TIMESTAMP WITH TIME ZONE`. İş günü hesapları `<TZ>`'ye göre yapılır (§21).
9. **Hassas kolonlar** (şifre hash'i, token, doğrulama kodu) `table-definitions.js`'te `sensitive: true` alır ve auto-CRUD yanıtından ayıklanır.

```sql
-- -----------------------------------------------------
-- Table: <şema>.booking
-- Purpose: <tek cümle>
-- -----------------------------------------------------
CREATE TABLE <şema>.booking (
    booking_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    booking_tenant_code BIGINT NOT NULL,
    booking_organization_id BIGINT NOT NULL,          -- sahip (kapsam kolonu)
    booking_counterparty_organization_id BIGINT,      -- karşı taraf: table-defs'te excludeFromCallerScope
    booking_reference_number VARCHAR(50) NOT NULL,
    booking_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    booking_total_amount DECIMAL(15,2),
    booking_total_currency VARCHAR(3),
    booking_metadata JSONB DEFAULT '{}',
    booking_created_by BIGINT,
    booking_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    booking_updated_by BIGINT,
    booking_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_booking_reference_number UNIQUE (booking_tenant_code, booking_reference_number),
    CONSTRAINT fk_booking_tenant FOREIGN KEY (booking_tenant_code) REFERENCES identity.tenant(tenant_code),
    CONSTRAINT fk_booking_organization FOREIGN KEY (booking_organization_id) REFERENCES identity.organization(organization_id),
    CONSTRAINT fk_booking_counterparty_organization FOREIGN KEY (booking_counterparty_organization_id) REFERENCES identity.organization(organization_id),
    CONSTRAINT fk_booking_status FOREIGN KEY (booking_status) REFERENCES enums.booking_status(booking_status_value),
    CONSTRAINT fk_booking_created_by FOREIGN KEY (booking_created_by) REFERENCES identity.user_account(user_account_id),
    CONSTRAINT fk_booking_updated_by FOREIGN KEY (booking_updated_by) REFERENCES identity.user_account(user_account_id)
);
```

### 4.4 Enum tablosu şablonu

```sql
CREATE TABLE enums.booking_status (
    booking_status_id BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
    booking_status_value VARCHAR(100) PRIMARY KEY,
    booking_status_label VARCHAR(255) NOT NULL,
    booking_status_sort_order INT NOT NULL DEFAULT 0
);
INSERT INTO enums.booking_status (booking_status_value, booking_status_label, booking_status_sort_order) VALUES
    ('pending', 'Pending', 1),
    ('confirmed', 'Confirmed', 2),
    ('canceled', 'Canceled', 3);
```

Kural: bir enum değerini **tahmin etme**. Değerleri `enums.<ad>` tablosundan, seed'den ya da o tabloya zaten yazan mevcut koddan oku (§21).

### 4.5 Rol ve yetkiler

- `A00-bootstrap-database.sql` dosyası superuser ile, **bir kez** ve elle çalıştırılır:
  - `<proje>_svc` rolünü oluşturur: `LOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`. Parola dosyada `CHANGE_ME` olarak durur; `ALTER ROLE` ile değiştirilir.
  - Veritabanını oluşturur: `CREATE DATABASE <proje_db> WITH ENCODING 'UTF8' LOCALE_PROVIDER 'icu' ICU_LOCALE '<icu>' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8' TEMPLATE template0`. `<icu>` VARSAYILAN olarak `tr-TR`; Türkçe dışı projede `en-US`.
  - `GRANT CONNECT` verir.
- `A99-grants.sql` idempotent'tir. İçeriği:
  - her şemaya `USAGE`,
  - tüm tablolara `SELECT, INSERT, UPDATE, DELETE`,
  - tüm sequence'lara `USAGE, SELECT`,
  - `ALTER DEFAULT PRIVILEGES`: hem `postgres` hem migration rolü için, böylece yeni tablolar yetkileri miras alır.
- Yeni bir tablo migration'ından sonra **ayrı** bir grant migration'ı yazılır (`...-grant-<tablo>.sql`). Varsayılan yetkiler her ortamda garanti değildir; tablo başka bir rolle yaratıldıysa miras devreye girmez. Belirtisi: `permission denied for table ...`.
- Dev, test ve E2E'de servisler compose'un superuser'ıyla bağlanır; grant gerekmez. Staging ve prod'da `<proje>_svc` ile bağlanılır.

### 4.6 `scripts/build-schema.js` (ZORUNLU davranış)

- `db-schemas/` altındaki `.sql` dosyalarını (alt klasörler dahil) ada göre sıralayıp birleştirir ve `_combined.sql`'i üretir. Birleştirmeye girmeyenler: `migrations/`, `A` ile başlayanlar ve `_combined.sql`'in kendisi. Dosyanın başına `-- AUTO-GENERATED` satırı yazılır.
- `table-definitions.js`'i **okumaz**. Eski dokümanın "JS kaynaktır, SQL ondan türetilir" ifadesi yanlıştı.
- Ne zaman çalıştırılır: bir SQL dosyası değiştiğinde, dev DB sıfırlanmadan önce ve her E2E koşusunda (`e2e/run.js` kendisi çağırır).
- Referans repodan kopyala (SQL ifade ayırıcısı dahil).

### 4.7 Migration kuralları (ZORUNLU)

- **Ad**: `YYYY-MM-DD-N-kebab-aciklama.sql`. `N`, o günün sırasıdır ve 1'den başlar. Runner dosyaları doğal sıralar (`-10`, `-2`'den sonra gelir); `localeCompare` kullanmaz.
- **Başlık şablonu**:

  ```sql
  -- <Tek cümle: ne değişiyor> (<iş/denetim referansı>, <YYYY-MM-DD>).
  --
  -- NEDEN: <sorun, ölçüm, belirti>
  --
  -- ── ÖNCE SALT OKUNUR KONTROL ────────────────────────────────────────
  --   SELECT ... ;   -- etkilenecek ya da çakışan satırlar
  --
  -- ── OTOMATİK TEMİZLİK KURALI ────────────────────────────────────────
  -- <Yalnızca güvenli durumlar otomatik düzeltilir; diğerlerinde migration
  --  HATA VERİP DURUR, çünkü karar bir iş kararıdır.>
  --
  -- Idempotent: <ikinci koşunun neden zararsız olduğu>
  -- ÇALIŞTIRMA: node scripts/apply-migrations.mjs <dosya-adı>
  BEGIN;
  -- ...
  COMMIT;
  ```

- **Transaction**: tek transaction kullanılır (`BEGIN`/`COMMIT`). Transaction dışında çalışması gereken işler (`CREATE INDEX CONCURRENTLY` gibi) ayrı bir dosyaya konur.
- **Çakışma**: otomatik çözülemiyorsa `DO $$ ... RAISE EXCEPTION 'çakışma: %', ... $$;` ile durulur.
- **Idempotency yalnızca `IF NOT EXISTS` değildir.** Verinin anlamı korunmalı. Örneğin mevcut `NULL` "sınırsız" anlamına geliyorsa `COALESCE` ile eski bir limite düşürülmemelidir. Mümkünse yeniden koşma testi yazılır.
- **Grant'lar** ayrı dosyadadır: `YYYY-MM-DD-N-grant-<tablo>.sql`, tablodan sonra.
- Aynı değişiklik numaralı base SQL'e ve `table-definitions.js`'e aynı commit'te işlenir.
- **Salt okunur ön-kontrol dosyaları** (yalnızca SELECT içeren, deploy öncesi karar için) `-preflight` ekiyle biter.
- Uygulanmış bir migration **düzenlenmez**; yeni bir dosya yazılır. Checksum değişirse runner bunu "drift" olarak raporlar.

### 4.8 Migration runner: `scripts/apply-migrations.mjs`

- **Defter**: `public.schema_migrations(version, checksum, applied_at, applied_by, baselined)`. Her dosya en fazla bir kez uygulanır. Defter kaydı, migration ile **aynı transaction** içinde yazılır. Gerekçe: "migration'lar idempotent yazılır" varsayımı referans projede üç kez tutmadı (bug-2173, 2174, 2242).
- **Komutlar**: `--status` · `--pending` · `--baseline --yes` · `<dosya>...` · `--all-since <tarih>`.
- **Bağlantı sırası**:
  1. `<PROJE>_MIGRATION_DB_CONNECTION_STRING`: grant'lar için superuser. Ayrı bir dosyada durur: `../env/migration.env`, yolu `<PROJE>_MIGRATION_ENV_FILE`.
  2. `CORE_APP_DB_CONNECTION_STRING`.
  3. Kökteki `.env`.

  Superuser bağlantı dizesi `../env/.env`'e **yazılmaz**, çünkü o dosyadaki her anahtar PM2 üzerinden tüm servislere dağılır.
- `psql` gerektirmez (node + pg).
- ⚠️ **`--baseline` tuzağı**: defter yokken `--baseline --yes`, diskteki tüm dosyaları **çalıştırmadan** "uygulandı" diye işaretler. Doğru sıra:
  1. `--baseline --yes`,
  2. baseline'dan sonra eklenen migration'ı **açık dosya adıyla** uygula,
  3. `npm run update`.

  Sonucu defterden değil, şemadan (information_schema) doğrula.
- Referans repodan kopyala; kopyalanamıyorsa bu sözleşmeyle yaz.

### 4.9 Yeni tablo ekleme kontrol listesi

1. Numaralı base SQL dosyasına `CREATE TABLE` ekle (§4.3). Yeni durum alanı varsa enum tablosunu da ekle (§4.4).
2. Migration yaz: `...-N-<tablo>.sql` ve `...-N+1-grant-<tablo>.sql`.
3. `core/service-<sahip>/.../table-definitions.js` dosyasına tanımı ekle (§5). Gerekirse `sensitive`, `excludeFromCallerScope`, `table.permissions`.
4. Şema yeniyse:
   - `example-builder`'daki `SCHEMA_DEFAULT_PERMISSIONS` haritasına ekle (§6.6),
   - `A99-grants.sql` dosyasına şemanın satırlarını ekle.
5. `npm run build-schema`. Ardından dev DB'ye uygula: `node scripts/apply-migrations.mjs <dosya>`.
6. `npm run test:backend -- --testPathPattern=service-<sahip>`. Üretilen entity, repository ve controller testleri yeni tabloyu kendiliğinden kapsar.

---

## 5. `table-definitions.js`: şemanın koddaki aynası

Her `core/service-<domain>/src/infrastructure/persistence/schemas/table-definitions.js` dosyası, o servisin sahip olduğu tabloların JS temsilidir. Auto-CRUD, OpenAPI üretimi, validator'lar ve query-builder bu dosyadan beslenir.

### 5.1 Format

```js
import { applyDefaultPermissions } from 'example-builder';

const booking = {
  table: {
    dbName: '<proje_db>',
    schemaName: '<şema>',
    tableName: 'booking',
    tableNameWithSchema: '<şema>.booking',
    // permissions: { read: 'booking:read', write: false },   // yazılmazsa şema varsayılanı (§6.6)
  },
  booking: {
    bookingCode: {
      original: 'booking_code',
      camelCase: 'bookingCode',
      udtName: 'int8',
      dataType: 'bigint',
      characterMaximumLength: null,
      isIdentity: false,
      isNullable: false,
      isPrimaryKey: false,
      isForeignKey: false,
      isUnique: true,
      isIndex: false,
    },
    bookingCounterpartyOrganizationId: {
      original: 'booking_counterparty_organization_id',
      // karşı taraf kolonu: çağıranın kapsamı DEĞİL (sahip kolonu kapsamdır)
      excludeFromCallerScope: true,
      camelCase: 'bookingCounterpartyOrganizationId',
      udtName: 'int8',
      dataType: 'bigint',
      characterMaximumLength: null,
      isIdentity: false,
      isNullable: true,
      isPrimaryKey: false,
      isForeignKey: false,
      foreignTableSchema: 'identity',
      foreignTableName: 'organization',
      foreignColumnName: 'organization_id',
      isUnique: false,
      isIndex: false,
    },
    bookingId: {
      original: 'booking_id',
      camelCase: 'bookingId',
      udtName: 'int8',
      dataType: 'bigint',
      characterMaximumLength: null,
      isIdentity: true,
      isNullable: false,
      isPrimaryKey: true,
      isForeignKey: false,
      isUnique: false,
      isIndex: false,
    },
    // ... diğer kolonlar: camelCase adına göre ALFABETİK sırada
  },
};

export default applyDefaultPermissions({
  booking,
  // bookingItem, ...
});
```

Kurallar:
- Nesnenin adı tablo adının camelCase halidir. Kolonları tutan anahtar da aynı addır (`booking.booking`). Kolonlar camelCase adına göre alfabetik sıralanır.
- **Kodun gerçekten okuduğu alanlar**:
  - `original`, `camelCase`, `udtName`, `dataType`, `characterMaximumLength`, `isIdentity`, `isNullable`, `isUnique`,
  - bayraklar: `sensitive`, `excludeFromCallerScope`,
  - tablo alanları: `table.schemaName`, `table.tableName`, `table.tableNameWithSchema`, `table.permissions`.
- `isPrimaryKey`, `isForeignKey`, `isIndex` ve `foreign*` alanları **bilgi amaçlıdır**. Tropiq'te `isForeignKey` FK kolonlarında bile `false`. Bu alanları doğru doldur ama hiçbir mantığı bunlara bağlama.
- Tip eşlemesi (`udtName` / `dataType`):

| SQL | udtName | dataType | characterMaximumLength |
|---|---|---|---|
| BIGINT | `int8` | `bigint` | null |
| INT / INTEGER | `int4` | `integer` | null |
| VARCHAR(n) | `varchar` | `character varying` | n |
| TEXT | `text` | `text` | null |
| BOOLEAN | `bool` | `boolean` | null |
| TIMESTAMPTZ | `timestamptz` | `timestamp with time zone` | null |
| DATE | `date` | `date` | null |
| DECIMAL / NUMERIC | `numeric` | `numeric` | null |
| JSONB | `jsonb` | `jsonb` | null |
| UUID | `uuid` | `uuid` | null |
| BYTEA | `bytea` | `bytea` | null |

- `isNullable`, SQL'de `NOT NULL` yoksa `true` olur. `isIdentity` yalnızca `GENERATED ... AS IDENTITY` kolonunda `true` olur. `isUnique`, tek kolonlu UNIQUE kısıtında `true` olur.
- `sensitive: true` alanlar auto-CRUD HTTP yanıtından silinir; servis içi okumalar tam satırı görür.

### 5.2 Ne zaman, nasıl yazılır

- **Yeni tablo**: SQL ile aynı commit'te elle eklenir. Tropiq'te pratik budur; 2026-07'den bu yana `core/` altındaki tüm değişiklikler elle yapılmış `table-definitions.js` düzenlemeleridir.
- **Toplu ekleme** (5 ya da daha fazla tablo): çalışan dev DB'den `information_schema.columns`, `table_constraints` ve `key_column_usage` okuyarak §5.1'deki eşlemeyi uygulayan küçük bir üretici yaz (`scripts/gen-table-definitions.mjs`). Üreticinin çıktısını elle eklenen bayraklarla birleştir; üretici bu bayrakları **ezmemeli**.
- **Drift testi** (ZORUNLU; Tropiq'te yok): `test/services/repo/table-definitions-drift.test.js`. Test DB'sinin information_schema'sındaki her `(şema, tablo, kolon)` üçlüsünü tüm core `table-definitions.js` dosyalarıyla karşılaştırır; eksik ya da fazla kolon testi kırmızıya çevirir. Yakaladığı hata sınıfı: SQL'e kolon eklenmiş ama `table-definitions`'a eklenmemiş, sonuç olarak query-builder `<KOLON>_NOT_FOUND` ya da Postgres `42703` hatası.

---

## 6. `packages/`: paylaşılan kütüphaneler

### 6.1 Paket envanteri

| Klasör | Resmi ad (import) | Sorumluluk | Yeni projede |
|---|---|---|---|
| `modules/config` | `app-config` | env yükleme (dev'de kökteki `.env`), 12factor-config, port ve host türetme (§6.7) | Kopyala |
| `modules/datasource` | `app-datasource` | `createDatasources`; postgre (`pg`), redis (`ioredis`), rest connector'ları; `query`, `executeTransaction`, `health` | Kopyala. Kafka yoksa kafka connector'ını çıkar (§6.8). |
| `modules/entity-factory` | `entity-factory` | `defineEntity` → entity, errors, repository, useCase, controller (§6.5) | Kopyala |
| `modules/errors` | `app-errors` | `handleErrors`: `routeFunctionErrorHandler`, `HTTP_STATUS`, `unRoutedRouteErrorHandler` | Kopyala |
| `modules/example-builder` | `example-builder` | OpenAPI shard üretimi, izin varsayılanları, test payload'ı (§6.6) | Kopyala, `SCHEMA_DEFAULT_PERMISSIONS`'ı yeniden yaz |
| `modules/helper` | `app-helper` | log, `application.exitOnError` / `appStarted` | Kopyala |
| `modules/language` | `app-language` | sunucu tarafı i18n | Kopyala |
| `modules/middlewares` | `app-middlewares` | body-parser, compression, helmet, log, swagger UI | Kopyala |
| `modules/service-discovery` | `app-service-discovery` | Redis kaydı, pub/sub, heartbeat, `/app/health` (§6.9) | Kopyala |
| `modules/shared` | `app-shared` | API zarfı, guard'lar, tx, cron-lock, internal-fetch, port'lar, izin kataloğu + ortak domain kuralları | Genel kısmı kopyala (§6.3), domain kısmını yaz |
| `persistence-utils` | `persistence-utils` | read/create/update/delete script üreticileri | Kopyala |
| `query-builder` | `app-query-builder` | SQL üretimi, çağıran kapsamı (§6.4) | Kopyala |
| `legal-content` | `@<proje>/legal-content` | web ve landing'in ortak hukuki metinleri (§17) | İSTEĞE BAĞLI, yaz |

### 6.2 Import kuralları

- Paketler **resmi adlarıyla** import edilir (`import { wrap } from 'app-shared'`), klasör yoluyla değil. Tropiq'te servis `main.js`, core `init-query-builder.js` ve bazı test yardımcıları göreli yol kullanır; bu çalışır, ama yeni kodda resmi ad tercih edilir.
- Yasak import yönleri:
  - packages → services ya da core,
  - core → services,
  - bir servisten başka bir servise.
- Web uygulaması `app-shared`'den import edebilir. Kökteki `node_modules/app-shared` symlink'i ve kökten çalışan `vite build` sayesinde bu hem geliştirmede hem üretim derlemesinde çözülür. Ön yüz ile arka yüzün ortak kuralı için **ayna kopya yazılmaz**. İki yolun aynı modülü verdiğini `toEqual` ile değil `toBe` ile test et; `toEqual`, birinin yeniden kopya kurduğunu görmez.

### 6.3 `app-shared`: genel olan ve projeye özel olan

**Genel, kopyala** (bu dosyalar yalnızca birbirine, `app-datasource`'a, `lodash`'a ve `xml2js`'e bağlıdır):

| Dosya | İçerik |
|---|---|
| `api/envelope.js` | `ok(data)` → `{ success:true, data }`, `err(code, message, details)` |
| `api/errors.js` | `ApiError` + fabrikalar: `badRequest` 400, `unauthorized` 401, `paymentRequired` 402, `forbidden` 403, `notFound` 404, `conflict` 409, `gone` 410, `rateLimited` 429, `serverError` 500, `serviceUnavailable` 503 (geçici ve tekrar denenebilir) |
| `api/wrap.js` | `wrap(handler, { isPublic, successStatus })`: `(req, caller, res)` imzalı handler'ı Express route'una çevirir, zarflar, `ApiError`'u ve `*ValidationError` / `*NotFoundError` hatalarını HTTP'ye çevirir. Handler yanıtı kendisi yazdıysa (CSV, dosya akışı) dokunmaz. |
| `api/wrap-internal.js` | `wrapInternal(handler)`: `x-auth-token === INTERNAL_API_KEY` kontrolü (`timingSafeEqual`; üretimde anahtar en az 32 karakter) |
| `auth/guards.js` | `isAnonymousCaller`, `requireAuthenticatedCaller`, `requireCallerPermission`, `requireAnyCallerPermission`, `requireCallerRole`, `requireOrganizationType`, `requireAnyOrganizationType` |
| `auth/session-store.js` | Redis oturum anahtar şeması (`session:<sid>`, `refreshIdx:<hash>`, `userSessions:<userId>`, `roleSessions:<role>`, `jtiBlacklist:<jti>`) ve iptal işlemleri. Gateway ve identity **aynı** modülü kullanır. |
| `auth/tokens.js` | OTP yardımcıları (HMAC, `OTP_PEPPER`). Yalnızca OTP ile giriş varsa. |
| `persistence/tx.js` | `withTransaction(fn)`, `rawQuery(sql, params)` |
| `persistence/cron-lock.js` | `makeWithCronLock(datasources)` (§12.2) |
| `http/internal-fetch.js` | `fetchInternal`, `internalHeaders`, `INTERNAL_TIMEOUTS`, `isInternalUnavailable` (§10.2) |
| `ports/mail.js`, `ports/mail-provider.js` | e-posta portu ve env'den kurulum |
| `ports/storage.js`, `ports/storage-provider.js`, `ports/storage-postgres.js` | kalıcı dosya deposu (§11.3; `storage` şeması gerekir) |
| `ports/sms.js`, `ports/sms-provider.js` | SMS portu. Sağlayıcı adaptörünü projeninkiyle değiştir. Yalnızca SMS varsa. |
| `ports/fx.js` | döviz kuru portu. Yalnızca çoklu para birimi varsa. |
| `utils/general.js` | `getCaller`, `executeScript`, `convertObjectToCamelCase`, `toCamelCase`, `toSnakeCase`, `safeJSONParse`... |
| `utils/xml.js` | yalnızca XML entegrasyonu varsa |
| `permissions.js` | **Yapısı** kopyalanır (`PERMISSIONS`, `ROLES`, `ROLE_PERMISSIONS`, `requirePermission`, `requireInternal`, `ANY_AUTHENTICATED`). **İçeriği** projeye göre yazılır (§8.13). |

**Tropiq'e özel, kopyalama**: `rfq-*.js`, `bid-*.js`, `subscription/`, `auth/plan-gate.js`, `document-requirements.js`, `system-org.js`, `plan-labels.js`, `persistence/{notification-*,sms-budget,fx-rate,reputation-status,bid-outcome,contract-status,platform-setting}.js`, `ports/{iyzico*,gib,fx-tcmb,sms-foniva,card-result-store,recurring-charge}.js`.

- `index.js`'i yalnızca kopyalanan modülleri export edecek şekilde yeniden yaz.
- Yeni projede servisler arası ortak **iş kuralları** `packages/modules/shared/domain/<konu>.js` altına konur ve `index.js`'ten export edilir. Tropiq'te bunlar kökte altyapıyla karışıktır (§22).

### 6.4 query-builder sözleşmesi

- `initQueryBuilder(tableDefinitions)` durumu **modül düzeyinde** tutar. Bu yüzden:
  - her servis, `boot.js` en başta `core/.../init-query-builder.js`'i import eder,
  - testlerde her suite `beforeAll` içinde kendi tablolarıyla yeniden çağırır. Aynı Jest worker'ında birden fazla servisin suite'i koşarsa durum kirlenir.
- **Çağıran kapsamı**: `...TenantCode` ya da `...OrganizationId` ile biten ve `excludeFromCallerScope` taşımayan kolonlar READ sorgusunda `WHERE`'e, INSERT'te varsayılan değere girer. Bir tabloda birden fazla aday kolon varsa açılışta hata verir.
- **`'none'` sentineli**: çağıran bir alanı bilinçli olarak veremiyorsa (ör. anonim kayıt akışı) o kolon enjekte edilmez. Alan `undefined` ise **hata** verilir; eksik alan neredeyse her zaman bir bug'dır. `created_at` ve `updated_at` her durumda `NOW()` alır.
- Değer yazarken `key in data` kontrolü kullanılır; böylece `false`, `0` ve `''` değerleri korunur.

### 6.5 entity-factory sözleşmesi

`defineEntity({ name, schema, deps })` şunu döndürür:

```
{
  entity:     { validate, validateUpsertResult, isDeactivation },
  errors:     { <Pascal>NotFoundError, <Pascal>ValidationError },
  repository: { read, create, update, upsert, delete },   // repositoryImpl aynı nesnedir
  useCase:    { read, create, update, upsert, delete },
  controller: { name: '<Pascal>', read({ query }, caller), upsert({ body }, caller) },
}
```

- Sonuçlar `name:tableNameWithSchema` anahtarıyla önbelleğe alınır. `deps` (`readScript`, `createScript`, `updateScript`, `deleteScript`, `executeScript`, `convertObjectToCamelCase`) sonradan bağlanabilir.
- `upsert`: identity kolonu doluysa `update`, boşsa `create` çağırır.
- Repository imzası: `(data, caller, { conn, readOptions: { selectColumns, joins, groupBy }, createOptions, updateOptions, deleteOptions })`. `conn` verilirse işlem o transaction içinde çalışır.
- Controller:
  - `sensitive: true` alanları yanıttan siler,
  - organizasyon kapsamlı bir tabloda anonim (`'none'`) çağırana 401 döner.
- `entity.validate` otomatik çağrılmaz; üretilen unit testleri tarafından kullanılır.

### 6.6 example-builder

- **`applyDefaultPermissions(tableDefs)`**: `table.permissions` taşımayan tabloya şemanın varsayılanını ekler.
  - `SCHEMA_DEFAULT_PERMISSIONS` içinde olmayan bir şema açılışta **hata** verir.
  - Organizasyon kapsamı olmayan tabloda (`enums` ve `reference` hariç) `read: false` olur (fail-closed). Gerekçe: yalnızca tenant'a göre süzülen bir tablo, tek tenant'lı platformda oturumu olan herkese **tüm** satırları döndürür.
- **`SCHEMA_DEFAULT_PERMISSIONS` projeye göre yeniden yazılır**:

  ```js
  const SCHEMA_DEFAULT_PERMISSIONS = {
    enums:     { read: '*',                   write: false },
    reference: { read: '*',                   write: false },
    identity:  { read: 'user:read',           write: false },
    audit:     { read: 'platform:audit:read', write: false },
    <şema>:    { read: '<domain>:read',       write: false },   // her domain şeması için bir satır
  };
  const UNSCOPED_READ_SCHEMAS = new Set(['enums', 'reference']);
  ```

- **`buildShard(schema)`** iki uç üretir: `GET /v1/<kebab(tablo)>s` ve `POST /v1/<kebab(tablo)>s`.
  - Çoğul ekleme naiftir: ad `s` ile bitmiyorsa `s` eklenir, yani `country` tablosunun ucu `countrys` olur.
  - `x-functionName` değerleri: `get<Pascal>` ve `post<Pascal>`.
  - `read: false` iken GET, `write: false` iken POST üretilmez. `permissions` tanımı yoksa açılışta hata verir.
- **`buildTestPayload(schema, overrides)`**: seed'li faker ile deterministik bir payload üretir; testler kullanır.

### 6.7 config (`app-config`)

- `NODE_ENV=development` iken kökteki `.env` dosyası (`<servis cwd>/../../.env`) yüklenir; diğer ortamlarda yalnızca `process.env` kullanılır.
- Bu yükleme **modül yüklenirken** yapılır. Gerekçe: container'lar modül düzeyinde kurulur. Env daha sonra yüklenseydi, `process.env.X || 'http://localhost:...'` gibi varsayılanlar kalıcı olarak donardı (§21).
- `configs/app-config.js` bildirimseldir (12factor-config): `{ anahtar: { env, type, default, values } }`.
- **Port**, servis URL env'inin son `:` işaretinden sonraki kısmıdır.
- **Host** şu sırayla belirlenir: `LISTEN_HOST` varsa o; yoksa URL'nin host'u IP ya da `localhost` ise o; bunun dışında `0.0.0.0`. Gerekçe: servisler kimliği gateway'in yazdığı başlıklardan okur. Portu dışarıya açık bir servis, sahte bir `useraccountorganizationid` başlığıyla taklit edilebilir.
- `nodeEnv` değerleri: `fake`, `development`, `production`, `test`. `fake` modunda core route'ları OpenAPI örneklerini döndürür; bu, DB olmadan UI geliştirmeye yarar.

### 6.8 datasource (`app-datasource`)

- `createDatasources(appConfig)`, datasource-config'teki girdileri **sabit** adlarla kurar: `coreAppDb` (postgre), `coreAppRedis`, `serviceDiscoveryRedis`. Paylaşılan kod bu adlara güvenir.
- postgre connector'ı `query(script, params)` (pg `Result` döner, `rows` alanıyla) ve `executeTransaction(cb)` (commit/rollback otomatik; `tx.query` aynı biçimde döner) sağlar; ayrıca `disconnect` ve `health`.
- Oturumlar, cron kilitleri ve servis kaydı `serviceDiscoveryRedis` üzerindedir.
- Tropiq'te `connectors/kafka.js`, `@confluentinc/kafka-javascript`'i **statik** olarak import ediyor ama hiçbir servis kafka datasource'u tanımlamıyor. Yeni projede Kafka yoksa connector'ı ve `index.js`'teki case'ini çıkar.

### 6.9 service-discovery (`app-service-discovery`)

- Açılışta şunları yapar:
  - OpenAPI'yi zenginleştirir (`createOpenApiDoc`: ad, `rootUrl`, `basePath`, `basePathPrefix`),
  - route listesini ve buna eklenen `/app/health`, `/app/info`, `/app/metrics` uçlarını Redis'e hash olarak yazar,
  - route'ları Express'e bağlar: `routes/` klasörünün export'ları okunur, eşleştirme anahtarı `x-functionName`'dir,
  - `app.fct.servicerestarted` kanalına yayın yapar,
  - 3 saniyede bir heartbeat gönderir.
- Her servisin **doğrudan kendi portunda** iki canlılık ucu vardır:
  - `GET /api/online` → `true`,
  - `GET /api/<basePath>/app/health` → datasource sağlığı ve son 30 dakikanın hataları.

  Bunlar gateway üzerinden public **değildir**.
- `x-internal: true` işaretli (`requireInternal()`) route'lar gateway'de dışarıya kapalıdır (401 `INTERNAL_ENDPOINT_BLOCKED`).

---

## 7. `core/`: üretilen CRUD katmanı

### 7.1 Ne olduğu, ne olmadığı

- Her domain için `core/service-<domain>/` klasörü vardır. İçinde `table-definitions.js` ve tablolar üzerinde dönen **jenerik** dosyalar bulunur. Bu jenerik dosyalar tüm servislerde **birebir aynıdır**; Tropiq'te diff ile doğrulandı. Servisler arasında farklı olan yalnızca `package.json` ve `table-definitions.js`'tir.
- Tropiq'te bu klasör harici bir jeneratörle üretildi. Jeneratör repoda **yoktur ve gerekmez**: aşağıdaki şablonları kopyala ve `<domain>`'i değiştir.
- core'a iş mantığı **yazılmaz**. Tek değişiklik noktası `table-definitions.js`'tir; iş mantığı `services/` altında yaşar.
- Eski dokümandaki "core = saf domain, services = ince kabuk" anlatımı yanlıştı. Gerçek tam tersidir: Tropiq'te rfq servisi için `core/` altında 9, `services/` altında 126 JS dosyası var.

### 7.2 Dosyalar (tam şablonlar)

```
core/service-<domain>/
├── package.json
├── definitions/{_shared.openapi.js, rest-api-definition.js}
├── routes/rest-routes.js
├── test/helpers/index.js
└── src/
    ├── domain/{index.js, errors/{application-error.js, domain-error.js, infrastructure-error.js}}
    ├── application/use-cases/index.js
    ├── infrastructure/persistence/{init-query-builder.js, repositories/index.js, schemas/table-definitions.js}
    └── interfaces/http/index.js
```

`package.json`:

```json
{
  "name": "service-<domain>-core",
  "version": "0.0.1",
  "description": "service-<domain> core (scaffold: yalnızca table-definitions.js düzenlenir)",
  "type": "module"
}
```

`src/domain/index.js`:

```js
import { defineEntity } from 'entity-factory';
import {
  readScript,
  createScript,
  updateScript,
  deleteScript,
} from 'persistence-utils';
import tableDefs from '../infrastructure/persistence/schemas/table-definitions.js';
import { executeScript, convertObjectToCamelCase } from 'app-shared';

const deps = {
  readScript,
  createScript,
  updateScript,
  deleteScript,
  executeScript,
  convertObjectToCamelCase,
};

const domain = {};
for (const [name, schema] of Object.entries(tableDefs)) {
  if (!schema?.table) continue;
  domain[name] = defineEntity({ name, schema, deps });
}

export default domain;
```

`src/application/use-cases/index.js`:

```js
import domain from '../../domain/index.js';

const useCases = {};
for (const [name, entry] of Object.entries(domain)) {
  useCases[name] = entry.useCase;
}

export default useCases;
```

`src/interfaces/http/index.js`:

```js
import domain from '../../domain/index.js';

const controllers = {};
for (const [name, entry] of Object.entries(domain)) {
  controllers[name] = entry.controller;
}

export default controllers;
```

`src/infrastructure/persistence/repositories/index.js`:

```js
import domain from '../../../domain/index.js';

const repositoryImpls = {};
for (const [name, entry] of Object.entries(domain)) {
  repositoryImpls[name] = entry.repositoryImpl;
}

export default repositoryImpls;
```

`src/infrastructure/persistence/init-query-builder.js`:

```js
import tableDefinitions from './schemas/table-definitions.js';
import { initQueryBuilder } from '../../../../../packages/query-builder/index.js';
initQueryBuilder(tableDefinitions);
```

`src/domain/errors/domain-error.js`. `application-error.js` ve `infrastructure-error.js` aynı kalıptadır; yalnızca `name` alanı değişir. Bu `(message, context)` imzası **yalnızca iskeletindir**. Servisler kendi `DomainError`'larını `(code, message, details)` imzasıyla yazar (§8.5).

```js
export class DomainError extends Error {
  constructor(message, context) {
    super(message);
    this.name = 'DomainError';
    this.context = context;
  }
}
```

`definitions/_shared.openapi.js`:

```js
export default {
  responseGet: {
    type: 'object',
    properties: {
      code: { type: 'string', example: 'success' },
      message: { type: 'string', example: 'Success' },
      list: { type: 'array', example: [] },
    },
  },
  responsePost: {
    type: 'object',
    properties: {
      code: { type: 'string', example: 'success' },
      message: { type: 'string', example: 'Success' },
      item: { type: 'object', example: {} },
    },
  },
  QueryParameters: {
    type: 'object',
    properties: {
      startRow: { type: 'number', example: 0 },
      endRow: { type: 'number', example: 100 },
      sortModel: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            colId: { type: 'string', example: 'id' },
            sort: { type: 'string', example: 'asc' },
          },
        },
      },
      filterModel: {
        type: 'object',
        properties: {
          id: {
            type: 'object',
            properties: {
              type: { type: 'string', example: 'equals' },
              filter: { type: 'string', example: '2' },
            },
          },
        },
      },
    },
  },
  xml: {
    type: 'object',
    xml: { name: 'XXX_Document' },
  },
};
```

`definitions/rest-api-definition.js`:

```js
import sharedSchemas from './_shared.openapi.js';
import { buildShard } from 'example-builder';
import tableDefs from '../src/infrastructure/persistence/schemas/table-definitions.js';

const components = { schemas: { ...sharedSchemas } };
const paths = {};

for (const schema of Object.values(tableDefs)) {
  if (!schema?.table) continue;
  const shard = buildShard(schema);
  Object.assign(components.schemas, shard.schemas);
  Object.assign(paths, shard.paths);
}

export default {
  openapi: '3.0.0',
  info: {
    title: 'REST API',
    version: '1.0.0',
    description: 'A dynamically generated API from the database schema.',
  },
  components,
  paths,
};
```

`routes/rest-routes.js`:

```js
import { getCaller } from 'app-shared';
import appConfig from 'app-config';
import handleErrors from 'app-errors';
import faker from '../test/helpers/index.js';
import controllers from '../src/interfaces/http/index.js';

const { routeFunctionErrorHandler, HTTP_STATUS } = handleErrors;

const base = async (req, res, next, callerName, serviceFunction, isPublic = false) => {
  try {
    if (typeof serviceFunction !== 'function') {
      throw new Error('Invalid service function provided');
    }
    const caller = getCaller(req.headers, isPublic);
    const response = await serviceFunction(req, caller);
    res.status(HTTP_STATUS.OK).json(response);
  } catch (error) {
    const errorContext = { callerName, path: req.path, method: req.method };
    routeFunctionErrorHandler(errorContext, error, next);
  }
};

const routeResponse = appConfig.nodeEnv === 'fake' ? faker : base;

const routes = {};

for (const ctrl of Object.values(controllers)) {
  if (!ctrl || typeof ctrl.read !== 'function' || typeof ctrl.upsert !== 'function') continue;
  const getName = `get${ctrl.name}`;
  const postName = `post${ctrl.name}`;
  routes[getName] = (req, res, next) => routeResponse(req, res, next, getName, ctrl.read);
  routes[postName] = (req, res, next) => routeResponse(req, res, next, postName, ctrl.upsert);
}

export default routes;
```

`test/helpers/index.js` (`fake` modunda OpenAPI örneğini döndürür):

```js
import handleErrors from '../../../../packages/modules/errors/handleErrors.js';
import openApi from '../../definitions/rest-api-definition.js';
const { routeFunctionErrorHandler } = handleErrors;

export default async (req, res, next, callerName, serviceFunction) => {
  try {
    let { schemas } = openApi?.components || {};
    let responseProperties = schemas[callerName + 'Response'].properties;
    let response = Object.keys(responseProperties).reduce((acc, key) => {
      acc[key] = responseProperties[key].example;
      return acc;
    }, {});
    res.status(200).json(response);
  } catch (error) {
    routeFunctionErrorHandler(error, req, next);
  }
};
```

### 7.3 Auto-CRUD uçlarının davranışı

- **Yollar**: `/api/<proje>-service-<domain>/v1/<kebab(tablo)>s`.
  - GET listeler. `queryParams` AG Grid biçimindedir: `{ startRow, endRow, sortModel, filterModel }`.
  - POST upsert yapar.
- **Yanıt**: GET **zarfsız, ham bir dizi** döndürür; POST satır dizisi döndürür. Elle yazılan uçlar ise `{ success, data }` zarfıyla döner. Frontend iki biçimi de tanır (§16.4).
- **İzin**: `table.permissions` → OpenAPI `x-serviceDiscovery.permissionList` → gateway bu listeye göre kontrol eder.
- Domain tablolarında POST kapalıdır (`write: false`). Yazma yalnızca use-case'lerden yapılır.
- ⚠️ Auto-CRUD'da varsayılan bir LIMIT yoktur; bu Tropiq'te bilinen bir eksik. Büyük tablolar için elle bir liste ucu yazılır.

---

## 8. `services/`: elle yazılan servis

### 8.1 Klasör ağacı

```
services/<proje>-service-<domain>/
├── package.json
├── main.js
├── configs/{app-config.js, datasource-config.js}
├── definitions/rest-api-definition.js     # core OpenAPI + özel yollar
├── routes/rest-routes.js                  # core route'ları + özel handler'lar
├── middlewares/index.js
└── src/
    ├── boot.js                            # port kurulumları + cron
    ├── container.js                       # composition root
    ├── domain/
    │   ├── errors/{domain-error.js, infrastructure-error.js}
    │   └── <aggregate>/{index.js, <aggregate>-status.js, <kural>.js}
    ├── application/use-cases/<aggregate>/{<eylem>.use-case.js, <aggregate>.helpers.js}
    ├── infrastructure/persistence/{repositories/<ad>.repository.js, sql/}
    ├── interfaces/http/{index.js, <aggregate>.js, translate-domain-error.js}
    └── shared/{constants/, utils/, helpers.js}
```

Servis başına `ecosystem.config.js`, `deploy.sh`, `commit-and-tag*.js` ya da postman koleksiyonu **yazılmaz** (§22).

### 8.2 Kabuk dosyaları

`package.json`:

```json
{ "name": "<proje>-service-<domain>", "version": "0.0.1", "description": "service-<domain>", "type": "module" }
```

`configs/app-config.js`:

```js
import path from 'path';
import packageJson from '../package.json' with { type: 'json' };
global.dirName = path.resolve('../');
const { name, description, version } = packageJson;

export default {
  name: { default: name },
  url: { env: 'SERVICE_<DOMAIN>_REST_URL', type: 'string' },
  basePath: { default: '/<proje>-service-<domain>' },
  basePathPrefix: { default: '/api' },
  description: { default: description },
  version: { default: version },
  validateRequests: { type: 'boolean', default: false },
  validateResponses: { type: 'boolean', default: false },
  nodeEnv: {
    env: 'NODE_ENV',
    type: 'enum',
    values: ['fake', 'development', 'production', 'test'],
    default: 'production',
  },
  debug: { env: 'DEBUG', type: 'string', default: '' },
  remoting: {
    default: {
      json: { strict: false, limit: '10mb' },          // referansta 100000kb: gereksiz büyük
      urlencoded: { extended: true, limit: '10mb' },
    },
  },
};
```

`configs/datasource-config.js`:

```js
export default [
  {
    name: { default: 'coreAppDb' },
    type: { default: 'postgre' },
    connectionString: { env: 'CORE_APP_DB_CONNECTION_STRING', type: 'string' },
  },
  {
    name: { default: 'coreAppRedis' },
    type: { default: 'redis' },
    url: { env: 'CORE_REDIS_URL', type: 'string' },
    password: { env: 'CORE_REDIS_PASSWORD', type: 'string' },
    dbName: { default: 'default' },
  },
  {
    name: { default: 'serviceDiscoveryRedis' },
    type: { default: 'redis' },
    url: { env: 'CORE_DISCOVERY_REDIS_URL', type: 'string' },
    password: { env: 'CORE_DISCOVERY_REDIS_PASSWORD', type: 'string' },
  },
];
```

`main.js` servisler arasında birebir aynıdır. Test ortamında datasource config'i `test/services/<servis>/configs/` altından okunur.

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import datasources, { createDatasources } from '../../packages/modules/datasource/index.js';
import appConfig, { createAppConfig } from '../../packages/modules/config/index.js';
import serviceDiscovery from '../../packages/modules/service-discovery/index.js';
import helper from '../../packages/modules/helper/index.js';
import rawAppConfig from './configs/app-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceName = path.basename(__dirname);
const datasourceConfigPath =
  process.env.NODE_ENV === 'test'
    ? `../../test/services/${serviceName}/configs/datasource-config.js`
    : './configs/datasource-config.js';
const { default: rawDatasourceConfig } = await import(datasourceConfigPath);
import middlewareFactory from './middlewares/index.js';
import boot from './src/boot.js';
import openApi from './definitions/rest-api-definition.js';

async function initialize() {
  const app = express();
  app.set('query parser', 'extended');
  createAppConfig(rawAppConfig, rawDatasourceConfig);
  if (appConfig?.nodeEnv !== 'production') global.logMode = 'trace';

  await createDatasources(appConfig).catch((error) => {
    console.error(error);
    helper.application.exitOnError();
  });
  const sd = await serviceDiscovery(
    app,
    openApi,
    datasources.serviceDiscoveryRedis,
    datasources.coreAppRedis,
  ).catch((error) => {
    console.error(error);
    helper.application.exitOnError();
  });
  app.use(middlewareFactory(appConfig, sd, openApi));
  sd.setAllServiceApis(app).catch((error) => {
    console.error(error);
    helper.application.exitOnError();
  });
  const server = app.listen(appConfig.port, appConfig.host);
  helper.application.appStarted(appConfig);
  await boot().catch((error) => {
    console.error(error);
    helper.application.exitOnError();
  });

  // Graceful shutdown: PM2 kill_timeout (30 sn) bu drain'den UZUN olmalı.
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received, draining...`);
    try {
      await new Promise((resolve) => server.close(resolve));
      await datasources.coreAppDb?.disconnect?.();
      await datasources.coreAppRedis?.redisClient?.quit?.();
      await datasources.serviceDiscoveryRedis?.redisClient?.quit?.();
      process.exit(0);
    } catch (error) {
      console.error('[shutdown] error during drain', error);
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

initialize();
```

`middlewares/index.js`. Dosya yükleme varsa referanstaki `services/*-service-rfq/middlewares/index.js` multipart middleware'ini ekle (multer bellek deposu, dosya başına 10 MB, `payload` alanında JSON):

```js
import sharedFactory from 'app-middlewares';

export default (config, serviceDiscovery, openApi) => [
  ...sharedFactory(config, serviceDiscovery, openApi),
];
```

### 8.3 `src/boot.js`

```js
// Servis açılış kancası. main.js, datasource'lar ve route'lar hazır olduktan sonra çağırır.
import cron from 'node-cron';
import '../../../core/service-<domain>/src/infrastructure/persistence/init-query-builder.js';
import datasources from 'app-datasource';
import { makeWithCronLock, installMailProviderFromEnv } from 'app-shared';
import container from './container.js';

const withCronLock = makeWithCronLock(datasources);

export default async () => {
  // 1) PORTLAR: bu süreçte kullanılan HER port burada kurulur (§11.2).
  //    Cron kapalı olsa da kurulmaları gerektiği için cron guard'ından ÖNCE gelir.
  installMailProviderFromEnv({ serviceName: 'service-<domain>' });
  // await installAndAssertStorage({ serviceName: 'service-<domain>' });  // dosya saklıyorsa

  // 2) ZAMANLANMIŞ İŞLER: testte ve DISABLE_CRON=true iken kapalı.
  const cronDisabled = process.env.NODE_ENV === 'test' || process.env.DISABLE_CRON === 'true';
  if (cronDisabled) return;

  cron.schedule(
    '15 * * * *', // ağır işleri aynı dakikaya koyma; servisler arasında dakikayı kaydır
    () =>
      withCronLock('cron:<domain>:<is-adi>', 50 * 60, async () => {
        try {
          const result = await container.useCases.<aggregate>.<sweepFn>();
          if (result?.changed) console.log(`[<domain>-<is>] degisen=${result.changed}`);
        } catch (error) {
          console.error('[service-<domain>] <is> failed', error);
        }
      }),
    { timezone: '<TZ>' }, // ZORUNLU: cron sunucu saatiyle, CURRENT_DATE DB oturum saatiyle çalışır
  );
};
```

### 8.4 `src/container.js`: composition root

Kurallar (ZORUNLU):
- DI kütüphanesi kullanılmaz. Her use-case `make<Eylem>(deps)` biçiminde bir factory'dir: bağımlılıklarını parametre olarak alır ve `async (input) => sonuç` döndürür.
- Kablolama sırası: repo'lar → ham use-case'ler (`<aggregate>Raw`) → HTTP hata çevirisiyle sarılmış ve **dondurulmuş** harita.
- **Her use-case dondurulmuş haritada olmak zorundadır.** Yalnızca `*Raw`'a eklenen bir fonksiyon, handler ya da cron'dan çağrıldığında `is not a function` hatası verir. Bu hata çoğu zaman bir `catch` tarafından sessizce yutulur (bug-1488, 1504). Factory'yi doğrudan import eden birim testleri bu boşluğu görmez; bu yüzden ayrı bir kablolama testi yazılır (§15.4).

```js
import { rawQuery } from 'app-shared';
import { makeBookingRepository } from './infrastructure/persistence/repositories/booking.repository.js';
import { wrapWithHttpTranslation } from './interfaces/http/translate-domain-error.js';
import { makeListBookings } from './application/use-cases/booking/list-bookings.use-case.js';
import { makeConfirmBooking } from './application/use-cases/booking/confirm-booking.use-case.js';

export const buildContainer = ({ rawQueryFn = rawQuery, translateHttpErrors = true, nowFn } = {}) => {
  const repos = {
    bookingRepo: makeBookingRepository({ rawQuery: rawQueryFn }),
  };
  const wrap = translateHttpErrors ? wrapWithHttpTranslation : (fn) => fn;
  const deps = { rawQuery: rawQueryFn, ...repos, ...(nowFn ? { nowFn } : {}) };

  const bookingRaw = {
    list: makeListBookings(deps),
    confirm: makeConfirmBooking(deps),
  };
  const bookingUseCases = Object.freeze({
    list: wrap(bookingRaw.list),
    confirm: wrap(bookingRaw.confirm),
    raw: bookingRaw,
  });

  const useCases = Object.freeze({ booking: bookingUseCases });
  return Object.freeze({ repos, useCases });
};

const container = buildContainer();
export default container;
```

- `translateHttpErrors: false` ile kurulan container testte saf `DomainError`'u görür.
- `nowFn` enjekte edilebilir; zaman testleri bu sayede deterministik olur.

### 8.5 Domain katmanı

`src/domain/errors/domain-error.js` (ZORUNLU imza):

```js
// (code, message, details). translate-domain-error bu imzaya dayanır: CODE_TO_FACTORY[err.code].
export class DomainError extends Error {
  constructor(code, message, details) {
    super(message || code);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}
export default DomainError;
```

`infrastructure-error.js` aynı imzayla yazılır (`name = 'InfrastructureError'`).

`src/domain/<aggregate>/index.js`:

```js
import coreDomain from '../../../../../core/service-<domain>/src/domain/index.js';

// Aggregate: core entity referansları + genişleme noktası
// (değer nesneleri, invariant'lar, durum makinesi).
const entities = {
  booking: coreDomain.booking,
  bookingItem: coreDomain.bookingItem,
};
export default entities;
```

Durum makinesi (`src/domain/booking/booking-status.js`):

```js
export const BOOKING_STATUSES = Object.freeze(['pending', 'confirmed', 'canceled']);
const FORWARD = Object.freeze({ pending: ['confirmed', 'canceled'], confirmed: ['canceled'] });
export const canTransition = (from, to) => (FORWARD[from] || []).includes(to);
```

Kurallar:
- OpenAPI'deki `enum` değerleri, domain fonksiyonunun dönebileceği kümeyle **birebir** aynıdır; bu eşitliği bir test kilitler.
- Geri alma (revert) geçişleri ileri matrise **eklenmez**. Onlar için ayrı bir küme, ayrı bir uç ve ayrı bir assert yazılır.
- Geri alma, ileri geçişin bıraktığı damgaları (`_loaded_at` gibi) da temizler.

### 8.6 Use-case şablonu

```js
import { PERMISSIONS, requireCallerPermission, withTransaction } from 'app-shared';
import { DomainError } from '../../../domain/errors/domain-error.js';

// <İş referansı> — <ne yapar, tek cümle>.
// TASARIM KARARLARI: <neden böyle; alternatif neden reddedildi>
export const makeConfirmBooking = ({ bookingRepo, nowFn = () => new Date() } = {}) => {
  if (!bookingRepo) throw new Error('makeConfirmBooking requires { bookingRepo }');

  return async ({ caller, bookingCode } = {}) => {
    requireCallerPermission(caller, PERMISSIONS.bookingManage);
    if (!bookingCode) throw new DomainError('BOOKING_CODE_REQUIRED', 'bookingCode is required');

    const row = await withTransaction(async (tx) => {
      // Durum kapısı WHERE'de: iki eşzamanlı istekten ikincisi 0 satır günceller.
      // Önce okuyup sonra yazan bir kontrol bu yarışı kaybederdi.
      const { rows } = await tx.query(
        `UPDATE <şema>.booking
            SET booking_status = 'confirmed',
                booking_updated_at = $4,
                booking_updated_by = $3
          WHERE booking_code = $1
            AND booking_organization_id = $2
            AND booking_status = 'pending'
          RETURNING booking_code, booking_status`,
        [bookingCode, caller.callerOrganizationId, caller.callerUserId, nowFn()],
      );
      if (!rows.length) {
        throw new DomainError('BOOKING_NOT_CONFIRMABLE', 'Booking is not pending');
      }
      return rows[0];
    });

    // Yan etkiler (bildirim, e-posta, başka servis) commit'ten SONRA ve best-effort (§10.3).
    return row;
  };
};
```

Kurallar (ZORUNLU):
- Girdi, `caller`'ı da içeren **tek bir nesnedir**.
- Sıra: guard → doğrulama → transaction → commit sonrası yan etkiler.
- Durum geçişi kapısı SQL'in `WHERE` koşulundadır (koşullu UPDATE).
- Her sorgu organizasyona göre süzülür. Çapraz organizasyon okuması ancak sahiplik doğrulandıktan sonra ve bilinçli olarak yapılır.
- Hata kodları SCREAMING_SNAKE biçimindedir ve aggregate adıyla başlar (`BOOKING_...`).
- Zaman `nowFn` üzerinden alınır; iş günü sınırları `<TZ>`'ye göre hesaplanır.
- Açık bir transaction içinden başka servise HTTP çağrısı yapılmaz (§10.2).

### 8.7 Repository şablonu

```js
// SQL burada yaşar; use-case SQL metnini bilmez.
// Transaction içinden çağrılabilmesi için { tx } seçeneği alır.
export const makeBookingRepository = ({ rawQuery }) => {
  if (!rawQuery) throw new Error('makeBookingRepository requires { rawQuery }');
  const run = (tx) => (tx ? (sql, params) => tx.query(sql, params) : rawQuery);

  return {
    findByCode: async ({ bookingCode, caller }, { tx } = {}) => {
      const { rows } = await run(tx)(
        `SELECT booking_code, booking_status, booking_total_amount, booking_total_currency
           FROM <şema>.booking
          WHERE booking_code = $1 AND booking_organization_id = $2`,
        [bookingCode, caller.callerOrganizationId],
      );
      return rows[0] || null;
    },
  };
};
```

SQL takma adları rakamla başlamaz (`AS 2x_total` gibi). Rakamla başlayan bir takma ad, JS tarafında camelCase dönüşümünden sonra alanın sessizce `undefined` gelmesine yol açabilir (§21).

### 8.8 `interfaces/http`

`src/interfaces/http/booking.js`:

```js
import container from '../../container.js';

export const bookingListHandler = (req, caller) =>
  container.useCases.booking.list({ query: req.query, caller });

export const bookingConfirmHandler = (req, caller) =>
  container.useCases.booking.confirm({ bookingCode: req.params?.bookingCode, caller });
```

`src/interfaces/http/index.js`:

```js
import coreControllers from '../../../../../core/service-<domain>/src/interfaces/http/index.js';

export { bookingListHandler, bookingConfirmHandler } from './booking.js';

export default { ...coreControllers };
```

`src/interfaces/http/translate-domain-error.js`:

```js
import { badRequest, conflict, forbidden, notFound, serverError } from 'app-shared';
import { DomainError } from '../../domain/errors/domain-error.js';
import { InfrastructureError } from '../../domain/errors/infrastructure-error.js';

// DomainError.code → HTTP fabrikası. Haritada olmayan kod 400'e düşer
// (DomainError = istemcinin düzeltebileceği iş kuralı ihlali).
// Var olmayan bir kaydı 404 yerine 409 ile bildirmek bazen doğrudur:
// 404 dönmek, hangi kodların var olduğunu doğrulayan bir kanal açar.
const CODE_TO_FACTORY = Object.freeze({
  BOOKING_FORBIDDEN: forbidden,
  BOOKING_NOT_FOUND: notFound,
  BOOKING_CODE_REQUIRED: badRequest,
  BOOKING_NOT_CONFIRMABLE: conflict,
});

export const toHttpError = (err) => {
  if (err instanceof DomainError) {
    const factory = CODE_TO_FACTORY[err.code] || badRequest;
    return factory(err.code, err.message, err.details);
  }
  if (err instanceof InfrastructureError) {
    return serverError(err.code || 'INTERNAL_ERROR', err.message);
  }
  return err;
};

export const wrapWithHttpTranslation =
  (fn) =>
  async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      throw toHttpError(err);
    }
  };

export default { toHttpError, wrapWithHttpTranslation };
```

### 8.9 `definitions/` ve `routes/`

`definitions/rest-api-definition.js`:

```js
import coreDefinition from '../../../core/service-<domain>/definitions/rest-api-definition.js';
import { PERMISSIONS, requirePermission, requireInternal } from 'app-shared';

// `x-functionName` değerleri routes/rest-routes.js anahtarlarıyla BİREBİR aynı olmalı;
// uyuşmazsa route hiç bağlanmaz (gateway ROUTE_NOT_FOUND ya da handler undefined).
const headerParams = [
  { in: 'header', name: 'userid', schema: { type: 'string' } },
  { in: 'header', name: 'tenantcode', schema: { type: 'string' } },
  { in: 'header', name: 'organizationid', schema: { type: 'string' } },
];
const queryParam = {
  in: 'query',
  name: 'queryParams',
  schema: { $ref: '#/components/schemas/QueryParameters' },
};
const pathParam = (name) => ({ in: 'path', name, required: true, schema: { type: 'string' } });
const okResponse = {
  200: {
    description: 'OK',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/apiResponse' } } },
  },
};
const jsonBody = (ref, { required = true } = {}) => ({
  required,
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } },
});

const op = ({
  summary,
  functionName,
  tag,
  method = 'post',
  permission,          // PERMISSIONS.x | '*' (oturumu olan herkes) | 'a:read,b:read' (herhangi biri)
  internal = false,    // true: gateway dışarıya kapatır; handler wrapInternal ile sarılır
  isPublic = false,    // true: + wrap(handler,{isPublic:true}) + gateway public-paths.js girdisi
  requestBodyRef,
  requestRequired = true,
  pathParams = [],
  query = false,
}) => ({
  [method]: {
    summary,
    'x-functionName': functionName,
    tags: [tag],
    ...(internal ? requireInternal() : {}),
    ...(permission ? requirePermission(permission) : {}),
    ...(requestBodyRef ? { requestBody: jsonBody(requestBodyRef, { required: requestRequired }) } : {}),
    parameters: [...(isPublic ? [] : headerParams), ...pathParams, ...(query ? [queryParam] : [])],
    responses: okResponse,
  },
});

const schemas = {
  apiResponse: {
    type: 'object',
    properties: { success: { type: 'boolean' }, data: {}, error: { type: 'object' } },
  },
  bookingConfirmRequest: {
    type: 'object',
    properties: { note: { type: 'string', maxLength: 500 } },
  },
};

const customPaths = {
  '/v1/bookings/list': op({
    summary: 'Organizasyonun rezervasyonları',
    functionName: 'getBookingsList',
    tag: 'Booking',
    method: 'get',
    permission: PERMISSIONS.bookingRead,
    query: true,
  }),
  '/v1/bookings/{bookingCode}/confirm': op({
    summary: 'Rezervasyonu onayla',
    functionName: 'postBookingConfirm',
    tag: 'Booking',
    permission: PERMISSIONS.bookingManage,
    requestBodyRef: 'bookingConfirmRequest',
    requestRequired: false,
    pathParams: [pathParam('bookingCode')],
  }),
};

export default {
  ...coreDefinition,
  components: {
    ...(coreDefinition.components || {}),
    schemas: { ...(coreDefinition.components?.schemas || {}), ...schemas },
  },
  paths: { ...(coreDefinition.paths || {}), ...customPaths },
};
```

`routes/rest-routes.js`:

```js
import { wrap, wrapInternal } from 'app-shared';
import coreRoutes from '../../../core/service-<domain>/routes/rest-routes.js';
import { bookingListHandler, bookingConfirmHandler } from '../src/interfaces/http/index.js';

// Anahtarlar = OpenAPI `x-functionName`.
export default {
  ...coreRoutes,
  getBookingsList: wrap(bookingListHandler),
  postBookingConfirm: wrap(bookingConfirmHandler),
  // getPublicX:   wrap(publicXHandler, { isPublic: true }),   // + gateway public-paths.js
  // postInternalX: wrapInternal(internalXHandler),            // + op({ internal: true })
};
```

Özel yollar auto-CRUD yollarını (`/v1/<tablo>s`) yeniden kullanmaz. Aynı yol ve method yazılırsa özel olan kazanır ve kafa karışıklığı doğar.

### 8.10 Public ve internal uçlar

**Public uç** üç yerde işaretlenir (ZORUNLU):
1. `op({ isPublic: true })`,
2. `wrap(handler, { isPublic: true })`: işaret olmazsa `getCaller` kimlik başlığı bulamayıp hata verir,
3. gateway `src/constants/public-paths.js` girdisi: `{ path, match: 'exact' | 'prefix', methods: ['GET'] }`. Girdi olmazsa istek gateway'de 401'de takılır.

Public handler içinde çağıran anonimdir (`'none'`). Organizasyon kapsamlı veri okunmaz; yanıt, beyaz listeye alınmış alanlardan oluşan bir DTO'dur.

**Internal uç** (servisten servise):
- `op({ internal: true })` + `wrapInternal(handler)`,
- çağıran taraf `fetchInternal` + `internalHeaders(caller)` kullanır (§10.2),
- gateway bu route'u dışarıdan gelen isteklere kapatır.

### 8.11 Yanıt zarfı ve hata kodları

- **Başarı**: `{ success: true, data }`. Özel bir durum kodu gerekiyorsa handler `{ success: true, data, __statusCode: 201 }` döndürür.
- **Hata**: `{ success: false, error: { code, message, details? } }`.
- Yeni bir `DomainError` kodu şu **üç yere birlikte** eklenir (ZORUNLU):
  1. kodun fırlatıldığı yer,
  2. `CODE_TO_FACTORY` haritası,
  3. web i18n `apiErrors.<KOD>` anahtarı, her dilde.

  Çevirisi olmayan kod, backend'in ham mesajına düşer ve kullanıcı yanlış dilde hata görür.

### 8.12 Giriş (identity) sözleşmesi

- Identity kimliği doğrular ve login ya da kayıt uçlarında şu yanıtı döndürür:

  ```json
  {
    "success": true,
    "data": {
      "user": {
        "userAccountId": 12,
        "userAccountTenantCode": 1,
        "userAccountOrganizationId": 34,
        "userAccountRole": "<org_tipi>_admin",
        "userAccountOrganizationType": "<org_tipi>"
      },
      "rolePermissionList": ["booking:read", "booking:manage"]
    }
  }
  ```

- Identity token **üretmez**; oturumu gateway açar (§9.4).
- `rolePermissionList` her girişte **çalışan veritabanından** okunur (`enums.role_permission`).
- Kullanıcının rolünü yükselten uçlar (ör. firma kaydını tamamlama) aynı biçimde `{ user, rolePermissionList }` döndürür ve gateway'in `SESSION_REFRESH_PATHS` listesine eklenir.
- Tek bir public ve yan etkisiz sağlık ucu bulunur: `GET /v1/public/ping` → `{ success: true, data: 'pong' }`. Gateway'in public listesine eklenir. E2E hazır-olma yoklaması bunu kullanır (§12.4).
- **Giriş yöntemi**: proje tanımına göre seçilir. Tanımda belirtilmemişse VARSAYILAN e-posta + şifredir (`bcrypt`); dış bağımlılığı yoktur. Telefon + OTP (Tropiq'teki yöntem) ancak bir SMS sağlayıcısı sözleşmesi varsa kullanılır (§11).

### 8.13 İzin ekleme adımları (ZORUNLU sıra)

1. `packages/modules/shared/permissions.js` içinde `PERMISSIONS` nesnesine kodu ekle. Biçim: `<alan>:<kaynak>:<eylem>` ya da `<alan>:<eylem>`.
2. `ROLE_PERMISSIONS` haritasında ilgili rollere ekle. VARSAYILAN roller: `superadmin`, `platform_support`, `<org_tipi>_admin`, `<org_tipi>_user`, `anonymous`.
3. `npm run build-role-permission-seed` çalıştır; `00-enums-schema.sql` içindeki `enums.user_account_role`, `enums.permission` ve `enums.role_permission` seed'leri yeniden üretilir.
4. İlgili `rest-api-definition.js` dosyasında `op({ permission: PERMISSIONS.x })` kullan.
5. Frontend'deki `shared/auth/route-permissions.js` haritasını (`ROUTE_PERMISSIONS`) güncelle, gerekiyorsa.
6. `npm run validate-auth-config` çalıştır; exit 0 dönmeli. Script kod, seed, OpenAPI referansları, frontend haritası ve public path'ler arasındaki sapmayı yakalar.
7. Çalışan veritabanları için `npm run sync-role-permissions -- --apply` çalıştır. JWT izinleri şema dosyasından değil **canlı DB**'den geldiği için 6. adımdaki kontrol tek başına yetmez.

---

## 9. Gateway

### 9.1 Sorumluluklar

- kimlik doğrulama, oturum, CSRF ve rate limit,
- route bazlı izin kontrolü,
- kimlik başlıklarının temizlenmesi ve yeniden yazılması,
- servislere proxy,
- `/api/gateway/*` uçları: `me`, `refresh`, `logout`, `logout-all`, oturum iptalleri.

Servisler kendi auth mantığını **yazmaz**; gateway'in doğrulayıp yazdığı kimliğe güvenir.

### 9.2 Klasör ağacı

```
services/<proje>-web-gateway/
├── main.js  package.json  configs/  definitions/  routes/  README.md
└── src/
    ├── boot.js                     # middleware sırası + discovery + subscribe (§9.3, §9.8)
    ├── route.js                    # dinamik proxy router'ı
    ├── gateway-handlers.js         # /api/gateway/* uçları
    ├── config-guards.js            # açılış doğrulamaları (§9.9)
    ├── auth/{jwt.js, cookies.js, session.js, refresh.js, route-registry.js, identity-client.js}
    ├── middlewares/{authenticate-jwt-middleware.js, csrf-middleware.js, security-middleware.js,
    │                http-proxy-middleware.js, cookie-parser.js, helmet-middleware.js, ...}
    ├── constants/{public-paths.js, index.js, error.js, message.js, redis.js}
    └── modules/utils.js
```

Referans repodan kopyala. Ardından:
- tüm `tropiq` dizgelerini değiştir: çerez adları, public path'ler ve health hedef filtresindeki sabit `'tropiq-'` dahil,
- `public-paths.js`'i **sıfırdan** yaz,
- `jwt.js`'i anahtarı env'de verilen yoldan okuyacak şekilde değiştir (§9.4).

### 9.3 Middleware sırası (ZORUNLU)

```
1. GET /health, GET /test                               ← auth'tan önce
2. commonMiddleware: cookieParser(COOKIE_SECRET), helmet, cors(CORS_ORIGINS),
   body-parser, compression, log
3. uç bazlı rate limit kovaları (commonMw'den SONRA, auth'tan ÖNCE; anonim istekler de sayılsın):
   giriş/OTP (IP başına), public paylaşım linki (IP), geri bildirim (oturum),
   ödeme callback'i ve webhook'u (ayrı kovalar)
4. gateway'in kendi route'ları (/api/gateway/*): kendi auth ve CSRF kontrolleri
5. authenticateJwt + koşullu CSRF (public path'ler atlanır)
6. dinamik servis router'ı (proxy)
7. unRoutedRouteErrorHandler
```

### 9.4 Oturum modeli

- Gateway şu iki tür yanıtı yakalar: public bir POST'un yanıtı ya da `SESSION_REFRESH_PATHS` listesindeki bir yolun yanıtı. Yanıtın durum kodu 400'ün altında olmalı ve gövdesi `{ user.userAccountId, rolePermissionList }` içermelidir. Bu koşullar sağlanınca:
  1. **`createSession`** çalışır:
     - RS256 imzalı access JWT'yi üretir. Claim'ler: `sub`, `tenantCode`, `organizationId`, `role`, `organizationType`, `sid`, `perms`, `jti`.
     - Rastgele bir refresh token üretir.
     - Redis'e `session:<sid>` hash'ini yazar, `refreshIdx`, `userSessions` ve `roleSessions` kayıtlarını ekler. TTL, refresh süresidir.
  2. **`setAuthCookies`**: httpOnly ve `COOKIE_SECRET` ile imzalı çerezleri basar.
  3. **CSRF çifti**: httpOnly imzalı `<proje>_csrf` + JS'in okuyabildiği `<proje>_xsrf`. Axios `<proje>_xsrf`'i okur ve `X-XSRF-TOKEN` başlığıyla geri gönderir. Bu çift olmazsa girişten sonraki tüm POST'lar `403 EBADCSRFTOKEN` alır.
  4. Yanıtta `rolePermissionList` alanı `user.permissions`'a taşınır.
- `/api/gateway/refresh` CSRF'ten muaftır; oturumu döndürür ve taze bir CSRF çifti basar.
- Her istekte `session:<sid>` anahtarının var olduğu kontrol edilir. Rol düşürme ya da organizasyonu askıya alma oturumu iptal eder; iptal ortak `session-store` ile yapılır.
- **JWT anahtarları repoda durmaz** (Tropiq'te gateway klasöründe commit'liydi; §22).
  - Dev için üret: `mkdir -p secrets && openssl genrsa -out secrets/jwt-private.pem 2048 && openssl rsa -in secrets/jwt-private.pem -pubout -out secrets/jwt-public.pem`.
  - `jwt.js`, `JWT_PRIVATE_KEY_PATH` ve `JWT_PUBLIC_KEY_PATH` değerlerini okur. Göreli yol repo köküne göre çözülür (`path.resolve(process.cwd(), '..', '..', değer)`). Dosya yoksa açılış düşer.
  - Sunucuda anahtarlar `../env/keys/` altında durur.

### 9.5 Kimlik başlıkları (ZORUNLU)

- Proxy, isteği iletmeden önce istemcinin gönderdiği şu başlıkların hepsini **siler** ve JWT'den türetilmiş değerlerle yeniden **yazar**: `userAccountId`, `userAccountTenantCode`, `userAccountOrganizationId`, `userAccountRole`, `userAccountOrganizationType`, `userAccountSessionId`, `userAccountPermissionList` (virgülle ayrılmış), `userAccountIp`.
- Anonim istekte kimlik başlıklarının hepsine `'none'` yazılır; izin listesi boş kalır.
- Servis tarafında `getCaller` bu başlıkları okur. Geriye uyumluluk için `userid`, `tenantcode` ve `organizationid` başlıkları da yedek olarak okunur.

### 9.6 Route registry ve izin kontrolü

- `buildRegistry(services)`: Redis'teki route kayıtlarından `{ regex, method, path, permissionList, internal }` girdileri üretir ve bunları **özgüllüğe** göre sıralar. Aynı uzunluktaki iki desende, ilk farklı segmentte sabit olan, parametreli olandan önce gelir. Gerekçe: Redis SCAN sırası garanti değildir. Parametreli kayıt öne geçerse, sabit yolun isteğine yanlış izin uygulanır (bug-2331).
- `authenticateJwt` karar sırası:
  1. yol public mi?
  2. JWT doğrulaması ve oturumun varlığı,
  3. route bulunamazsa 404,
  4. route internal ise 401,
  5. `permissionList` boşsa 500,
  6. `'*'` ise geçer,
  7. değilse listedeki herhangi bir izin JWT'de varsa geçer; yoksa 403.

### 9.7 Public path listesi

```js
// Method'a duyarlı public yol listesi. Her girdi: { path, match: 'exact' | 'prefix', methods? }.
// `methods` yazılmazsa tüm method'lar public olur. `endsWith` gibi eşleşmeler YASAK.
const PUBLIC_PATHS = [
  { path: '/api/<proje>-service-identity/v1/auth/login', match: 'exact', methods: ['POST'] },
  { path: '/api/<proje>-service-identity/v1/auth/register', match: 'exact', methods: ['POST'] },
  { path: '/api/<proje>-service-identity/v1/public/ping', match: 'exact', methods: ['GET'] },
  { path: '/openapi-ui/', match: 'prefix' },   // ek olarak ?apikey=OPENAPI_UI_KEY ister
  // referans veri okumaları (enums, reference): yalnızca GET
];
```

### 9.8 Açılış ve sıralama (ZORUNLU)

- Gateway açılışta Redis'teki route kayıtlarının bir anlık görüntüsünü alır ve registry'yi kurar. Ardından `servicerestarted` kanalına abone olur ve **bir kez daha** yeniler. Gerekçe: aynı anda kalkan bir servisin yayını, abonelik kurulmadan önce kaybolabilir.
- PM2 manifestinde gateway **en son** başlar. Deploy sonunda gateway 2 saniye beklenip bir kez daha restart edilir. Bunlar yapılmazsa ilk isteklerde `ROUTE_NOT_FOUND` görülür.
- `PROJECT_PREFIX=service`: gateway yalnızca `basePath` değerinde `service-` geçen kayıtları route'lar.

### 9.9 Config guard'ları: açılışı düşüren kontroller

- `ACCESS_TOKEN_EXPIRY` ve `REFRESH_TOKEN_EXPIRY` **tam sayı saniye** olmalıdır. 12factor-config `2880m` gibi bir soneki sessizce atar; değer 60 kat küçük okunur ve oturumlar dakikalar içinde kapanır.
- Refresh süresi access süresinden uzun olmalıdır.
- Sızmış ya da örnek sır denylist'i: `.env.example`'da bir zamanlar duran değerlerden biri canlıda kullanılıyorsa açılış reddedilir.
- Üretimde `INTERNAL_API_KEY` en az 32 karakter olmalıdır.

---

## 10. Servisler arası iletişim

### 10.1 Keşif

Keşif gateway içindir: servisler route'larını Redis'e kaydeder, gateway bu kayıtları okur (§6.9, §9.8). Servisler birbirini keşif üzerinden aramaz; birbirlerinin adresini `SERVICE_<DOMAIN>_REST_URL` env'inden bilir.

### 10.2 Doğrudan çağrı (ZORUNLU desen)

```js
import { fetchInternal, internalHeaders, INTERNAL_TIMEOUTS, isInternalUnavailable } from 'app-shared';

// Env ÇAĞRI ANINDA okunur. Modül düzeyinde bir sabite atanırsa değer donar (§21).
const identityUrl = () => process.env.SERVICE_IDENTITY_REST_URL;

const res = await fetchInternal(
  `${identityUrl()}/api/<proje>-service-identity/v1/internal/usage/consume`,
  {
    method: 'POST',
    headers: internalHeaders(caller),     // x-auth-token + çağıranın kimlik başlıkları
    body: { units: 1 },
    timeoutMs: INTERNAL_TIMEOUTS.gate(),  // gate 3 sn · usage 5 sn · bestEffort 2 sn (env ile ayarlanır)
  },
);
```

- Zaman aşımı zorunludur. Hem zaman aşımı hem ağ hatası `503 INTERNAL_SERVICE_UNAVAILABLE` olarak yükselir (tekrar denenebilir). Çağıran bunu kendi alan koduna çevirebilir (`isInternalUnavailable`).
- HTTP yanıtı olduğu gibi döner; yorumlamak çağıranın işidir.
- Açık bir transaction ya da satır kilidi varken başka servise çağrı yapılmaz. Zorunluysa `gate` süresi kullanılır. Gerekçe: karşı servis askıda kalırsa kilitler de askıda kalır ve aynı kaynaktaki diğer istekler donar.
- Karşı taraf uç `wrapInternal` ile sarılır (§8.10).

### 10.3 Commit sonrası yan etkiler

- Bildirim, push, e-posta ve başka servise yapılan çağrılar commit'ten **sonra** çalışır, best-effort'tur ve `INTERNAL_TIMEOUTS.bestEffort()` sınırıyla koşar. Başarısız olurlarsa ana işlem geri alınmaz.
- Kaybolmaması gereken yan etkiler için **outbox** deseni kullanılır: transaction içinde bir outbox tablosuna satır yazılır, bir cron bu satırları işler. Tropiq örneği: `referral_event` outbox'ı.

---

## 11. Dış entegrasyonlar: port/adaptör deseni

### 11.1 Dosya düzeni (`packages/modules/shared/ports/`)

| Dosya | Görevi |
|---|---|
| `<x>.js` | **Port**: dışa açılan fonksiyonlar (`sendMail`, `putBlob`...), süreç-içi `impl` ve `set<X>Provider(impl)`. Varsayılan `impl` bellek içidir ya da hiçbir şey yapmaz. |
| `<x>-provider.js` | `install<X>ProviderFromEnv({ serviceName })`: tetikleyici env varsa gerçek adaptörü kurar. `is<X>Configured()` durumu bildirir. |
| `<x>-<sağlayıcı>.js` | Gerçek adaptör (SMTP, SMS sağlayıcısı, S3...). |

### 11.2 Kurallar (ZORUNLU)

1. **Tek bir tetikleyici env anahtarı** vardır (ör. `SMTP_HOST`). Boşsa adaptör kurulmaz ve port hata fırlatmaz; ama `is<X>Configured()` `false` döner ve teslimat kaydına `not_configured` yazılır.
2. **Port durumu süreç içidir.** Porta dokunan **her** servis, kendi `boot.js`'inde kurulum yapar. Bir serviste kurmak, diğer servisleri kör bırakır. Tropiq'te bu hata mail, SMS ve döviz kuru için ayrı ayrı yaşandı.
3. **Kalıcı veri taşıyan port bellek içi varsayılanla çalışmaz.** `installAndAssertStorage`, üretimde kalıcı bir sağlayıcı yoksa açılışı düşürür. Gerekçe (bug-1796): varsayılan depo süreç içi bir Map'ti; PM2 restart'ı yüklenmiş tüm dosyaları sildi.
4. **Sahte adaptör** yalnızca açıkça seçilir (`PAYMENT_PROVIDER=fake`) ve `NODE_ENV=production` ortamında kurulmayı reddeder.
5. **Gerçek dış etkisi olan kanallar** (SMS, e-posta, ödeme) test ve E2E'de açık bir bayrakla kapatılır (`SMS_DISABLED=true`). `NODE_ENV==='test'` kontrolüne güvenilmez, çünkü E2E `development` modunda koşar.
6. **Test bypass'ları** (ör. OTP) **iki anahtar** ister: bypass kodu ve kanalın kapalı olduğunu söyleyen bayrak. Üretimde hiç çalışmazlar. `'123456'` gibi sabit arka kapılar YASAK. Test verisi gerçek görünen telefon numarası ya da e-posta üretmez; ayrılmış test aralıkları ve alan adları kullanılır.

### 11.3 Depolama (İSTEĞE BAĞLI)

- Varsayılan kalıcı sağlayıcı Postgres'tir: `storage.blob` tablosu (bytea) ve `db://` şeması (`15-storage-schema.sql`).
- Tablo `storage` şemasındadır, çünkü dosyalar birçok servise aittir (belge, logo, fatura PDF'i...).
- S3 ya da disk adaptörü aynı portu uygular.

---

## 12. Arka plan işleri ve süreç yaşam döngüsü

### 12.1 Cron kuralları

- Zamanlanmış işler servislerin `boot.js` dosyalarında tanımlanır (§8.3).
- `NODE_ENV=test` ya da `DISABLE_CRON=true` iken kapalıdır.
- Saat dilimi (`timezone`) açıkça verilir.
- Aynı tabloya dokunan ağır işler farklı dakikalara konur.
- Her işin gövdesi `try/catch` ile sarılır ve özet loglanır.
- İşin **kendisi** idempotent olmalıdır: koşullu UPDATE ya da lease. Kilit yalnızca gürültüyü azaltır.

### 12.2 Cron kilidi

- `makeWithCronLock(datasources)(key, ttlSeconds, fn)`: Redis üzerinde `SET NX EX` ile kilit alır. Değer süreç başına rastgele bir jetondur; kilit, Lua ile atomik karşılaştır-ve-sil yapılarak bırakılır.
- Redis yoksa iş yine koşar (best-effort). Asıl güvence sorgunun kendisidir.
- Kilit sahipli bırakılır. Gerekçe: iş TTL'den uzun sürerse, koşulsuz `DEL` başka bir sürecin aldığı kilidi silerdi.

### 12.3 Kapanış

`main.js` SIGTERM ve SIGINT'te şu sırayla kapanır: `server.close` → pg havuzunu kapat → Redis bağlantılarını `quit` et → çık (§8.2). PM2'deki `kill_timeout: 30000` bu süreden uzun olmalı. PM2'nin varsayılanı olan 1600 ms, drain'in ortasında SIGKILL gönderir.

### 12.4 Sağlık ve hazır olma

- **Süreç sağlığı**: servisin kendi portunda `GET /api/online` ve `GET /api/<basePath>/app/health` (§6.9). Gateway için `GET /health`.
- **Compose healthcheck**: her servis kendi portuyla yazılır.

  ```yaml
  healthcheck:
    test: ['CMD', 'node', '-e', "fetch('http://127.0.0.1:<PORT>/api/online').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
    interval: 3s
    timeout: 3s
    retries: 40
  ```

- **Uçtan uca hazır olma** (E2E ve deploy sonrası): gateway üzerinden public ve yan etkisiz ping ucu çağrılır. Başarılı yanıt; gateway'in, keşfin ve identity route'larının birlikte hazır olduğunu kanıtlar.

  ```
  GET http://127.0.0.1:<PORT_BASE>/api/<proje>-service-identity/v1/public/ping
  ```

  Yan etkili uçlarla (OTP gönderimi, SMS) yoklama **YASAK**. Tropiq'in E2E çalıştırıcısı OTP ucunu yokladığı için compose dosyasında uzun bir "gerçek SMS gidebilir" uyarısı gerekti.

---

## 13. Ortamlar, config ve sırlar

### 13.1 Ortamlar

| Ortam | `NODE_ENV` | Env kaynağı | Veritabanı |
|---|---|---|---|
| Yerel geliştirme | `development` | kökteki `.env` (config kendisi yükler) | `docker-compose.dev.yml` |
| Birim ve entegrasyon testi | `test` | `.env.test` + `test/services/*/configs/` | worker başına `<proje_db>_test_<N>` |
| E2E | `development` | `docker-compose.e2e.yml` env bloğu | compose içinde, geçici |
| Staging / prod | `production` | `../env/.env` → `.env.generated.json` → PM2 | sunucu |

### 13.2 Kurallar (ZORUNLU)

- Sırlar repo dışında durur. Sunucuda `../env/.env` dosyasında tutulur, izni `chmod 600`'dür ve değerler **tek tırnak** içinde yazılır. Tırnaksız bir değerin içindeki `$X`, source sırasında sessizce boşa açılır.
- Örnek dosyalarda gerçek değer olmaz. Bir değer yanlışlıkla commit'lendiyse dosyadan silmek yetmez: değer **döndürülür** (yenisi üretilir) ve eski değer config guard denylist'ine eklenir.
- Anahtar dosyaları (JWT pem, servis hesabı JSON'ları) repo dışında durur; yolları env'de verilir. Dev'de bu dosyalar `secrets/` altındadır (gitignore'da).
- Superuser bağlantı dizesi yalnızca `../env/migration.env` içindedir; PM2'ye gitmez.
- Frontend env: yalnızca `<proje>-web-app/.env` dosyası ve yalnızca `VITE_` önekli değişkenler kullanılır. Kökteki `.env` web'e geçmez. `VITE_` değerleri gizli **değildir**, tarayıcıya gömülür.

---

## 14. Çalıştırma ve dağıtım

### 14.1 Yerel çalıştırma

```bash
npm run build-schema          # ilk kez ve şema değiştiğinde
npm run db:up                 # Postgres + Redis
npm run dev:backend           # PM2: scripts/ecosystem.config.cjs; gateway en son + 2 sn sonra restart
npm run dev:local             # Vite :3000 → gateway :<PORT_BASE>
pm2 logs | pm2 status | pm2 restart all
```

`npm run dev`, backend kurmadan arayüz çalışması için Vite'ı **staging**'e proxy'ler (§16.12). Üretime bakmak ancak `VITE_PROXY_TARGET` ile açıkça verilerek mümkündür.

`scripts/ecosystem.config.cjs` (yerel PM2; `.cjs` uzantısı ZORUNLU, çünkü kök `"type": "module"` olduğu için `.js` uzantılı PM2 config'i `module is not defined` hatası verir):

```js
/** Yerel PM2 manifesti: npm run dev:backend. */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const servicesDir = path.join(root, 'services');
const gateway = '<proje>-web-gateway';

const appFor = (name) => {
  const cwd = path.join(servicesDir, name);
  if (!fs.existsSync(path.join(cwd, 'main.js'))) return null;
  return {
    name,
    script: 'main.js',
    cwd,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    kill_timeout: 30000,
    env: { NODE_ENV: 'development' },
  };
};

const names = fs
  .readdirSync(servicesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

// Gateway EN SON: açılışta Redis'teki route kaydının anlık görüntüsünü alır.
module.exports = { apps: [...names.filter((n) => n !== gateway), gateway].map(appFor).filter(Boolean) };
```

`scripts/start-backend.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
command -v pm2 >/dev/null 2>&1 || { echo "pm2 gerekli: npm install -g pm2" >&2; exit 1; }
pm2 startOrReload "$ROOT/scripts/ecosystem.config.cjs" --update-env
sleep 2
pm2 restart <proje>-web-gateway --update-env   # downstream'ler yayın yaptıktan sonra registry'yi tazele
pm2 status
```

### 14.2 Sunucu yerleşimi

```
~/services/<proje>/
├── <proje>-mono-repo/        # git clone
└── env/
    ├── .env                  # chmod 600: tüm servis env'i (.env.example şablonu)
    ├── migration.env         # chmod 600: <PROJE>_MIGRATION_DB_CONNECTION_STRING (PM2'ye GİTMEZ)
    └── keys/                 # jwt-private.pem, jwt-public.pem, servis hesabı JSON'ları
```

TLS'i nginx (ya da eşdeğeri) sonlandırır. `<app-host>` üzerinde `/` statik SPA'ya (`<proje>-web-app/dist`), `/api` ise gateway'e gider. SPA ile API aynı origin'dedir; landing ayrı bir origin'dedir (§17).

### 14.3 `ecosystem.config.cjs` (kök, sunucu için)

```js
// Sunucu PM2 manifesti. Normalde elle çağrılmaz; `npm run update` kullanılır.
//   ENV_FILE=.env.generated.json pm2 startOrReload ecosystem.config.cjs --update-env
// ENV_FILE ZORUNLU ve fail-fast: onsuz başlamak, operatörün kabuğunu sessizce
// miras almak demektir. Staging'in üretim veritabanına bağlanması tam olarak böyle olur.
const fs = require('fs');
const path = require('path');

const envFile = process.env.ENV_FILE;
if (!envFile) {
  console.error('[ecosystem] ENV_FILE tanımsız. Kullanım: npm run update');
  process.exit(1);
}
const envPath = path.isAbsolute(envFile) ? envFile : path.join(__dirname, envFile);
if (!fs.existsSync(envPath)) {
  console.error(`[ecosystem] ENV_FILE bulunamadı: ${envPath}`);
  process.exit(1);
}
const env = JSON.parse(fs.readFileSync(envPath, 'utf8'));

const servicesDir = path.join(__dirname, 'services');
const gateway = '<proje>-web-gateway';
const names = fs
  .readdirSync(servicesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(servicesDir, d.name, 'main.js')))
  .map((d) => d.name)
  .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

module.exports = {
  apps: [...names.filter((n) => n !== gateway), gateway].map((name) => ({
    name,
    cwd: path.join(servicesDir, name),
    script: './main.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    kill_timeout: 30000,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    env,
  })),
};
```

### 14.4 `scripts/update.sh` (sunucuda: `npm run update`)

Sıra **bilinçlidir**: build → migration → pm2. Derleme başarısız olursa veritabanına hiç dokunulmamış olur. PM2 sonda gelir, çünkü yeni kod eski şemaya karşı ayağa kalkarsa `42703` hatası ve 500'ler başlar. Migration başarısız olursa `set -e` script'i keser, PM2 reload hiç çalışmaz ve eski sürüm ayakta kalır.

```bash
#!/usr/bin/env bash
# Sunucuda güncelle: kod çek → env → bağımlılık → build → migration → env JSON → pm2 (gateway en son).
# Bayraklar: SKIP_GIT=1 · SKIP_BUILD=1 · SKIP_DB=1 · <PROJE>_ENV_FILE=../env/staging.env
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ENV_DIR="$(dirname "$ROOT")/env"
ENV_FILE="${<PROJE>_ENV_FILE:-$ENV_DIR/.env}"
MIGRATION_ENV_FILE="${<PROJE>_MIGRATION_ENV_FILE:-$ENV_DIR/migration.env}"
GENERATED="$ROOT/.env.generated.json"
GATEWAY="${GATEWAY:-<proje>-web-gateway}"

[ -f "$ENV_FILE" ] || { echo "HATA: env yok: $ENV_FILE (şablon .env.example, chmod 600)" >&2; exit 1; }

[ "${SKIP_GIT:-}" = "1" ] || git pull --ff-only

# Env build'den ÖNCE: web derlemesi VITE_* ve APP_BASE değerlerini okur.
set +u; set -a; . "$ENV_FILE"; set +a; set -u

if [ "${SKIP_BUILD:-}" != "1" ]; then
  npm ci --include=dev          # env NODE_ENV=production taşısa da vite gibi devDeps kurulmalı
  npm run build
fi

if [ "${SKIP_DB:-}" != "1" ]; then
  # Superuser dizesini runner KENDİSİ okur. Kabukta source edilmez; edilseydi PM2 ortamına sızardı.
  <PROJE>_MIGRATION_ENV_FILE="$MIGRATION_ENV_FILE" node scripts/apply-migrations.mjs --pending
fi

# JSON türetme node ile yapılır: kabukta elle JSON kaçışı, sır içindeki tek bir " ile bozulur.
node scripts/env-to-json.mjs "$GENERATED" "$ENV_FILE" "$ROOT/.env.example"
ENV_FILE="$GENERATED" pm2 startOrReload "$ROOT/ecosystem.config.cjs" --update-env
sleep 2
ENV_FILE="$GENERATED" pm2 restart "$GATEWAY" --update-env
pm2 save
pm2 status
```

`scripts/env-to-json.mjs` (referanstan kopyala):
- Anahtar kümesini **env dosyasının kendisinden** okur. Kabuk değişkenleri (`PATH`, `HOME`) JSON'a sızmaz.
- `.env.example` yalnızca eksik anahtar uyarısı için kullanılır. Anahtarları örnek dosyadan süzmek sessiz veri kaybı olurdu: kodda kullanılıp örnekte olmayan anahtar PM2'ye hiç ulaşmazdı.

### 14.5 Geri alma

- Kodu geri almak için: `git checkout <önceki-sha> && SKIP_DB=1 npm run update`.
- Migration'lar geri **alınmaz**. Bu yüzden şema değişiklikleri geriye uyumlu yazılır: önce kolon eklenir, sonra kullanılır, ancak en son (ayrı bir sürümde) kaldırılır.

### 14.6 CI (ZORUNLU asgari; Tropiq'te yok)

Remote GitLab ise `.gitlab-ci.yml` kullanılır. GitHub'da aynı adımlar `.github/workflows/ci.yml` dosyasına yazılır.

```yaml
stages: [check, test, build]

default:
  image: node:24
  cache:
    key: { files: [package-lock.json] }
    paths: [.npm/]
  before_script:
    - npm ci --cache .npm --prefer-offline --no-audit --no-fund

lint:
  stage: check
  script: [npm run lint]

auth-config:
  stage: check
  script: [npm run validate-auth-config]

test-web:
  stage: test
  script: [npm run test:web]

test-backend:            # DB'li iş. pg_dump sürümü sunucu sürümünden küçük olamaz (PG 18).
  stage: test
  services:
    - name: timescale/timescaledb:2.27.2-pg18
      alias: pg
    - name: redis:7-alpine
      alias: redis
  variables:
    POSTGRES_USER: ci_user
    POSTGRES_PASSWORD: ci_pass
    POSTGRES_DB: <proje_db>
    CORE_APP_DB_CONNECTION_STRING: postgres://ci_user:ci_pass@pg:5432/<proje_db>
    TEST_DB_HOST: pg
    TEST_DB_PORT: '5432'
    TEST_DB_USER: ci_user
    TEST_DB_PASSWORD: ci_pass
    TEST_REDIS_URL: redis://redis:6379
    TEST_DISCOVERY_REDIS_URL: redis://redis:6379
  script:
    - apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg
    - install -d /usr/share/postgresql-common/pgdg
    - curl -fsSo /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
    - echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo $VERSION_CODENAME)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
    - apt-get update && apt-get install -y --no-install-recommends postgresql-client-18
    - npm run build-schema
    - PGPASSWORD=ci_pass psql -h pg -U ci_user -d <proje_db> -v ON_ERROR_STOP=1 -f db-schemas/_combined.sql
    - npm run test:backend

build:
  stage: build
  script: [npm run build]
```

---

## 15. Test stratejisi

### 15.1 Katmanlar

| Katman | Nerede | Ne doğrular | DB |
|---|---|---|---|
| Paket testleri | `packages/**/__tests__/` | paylaşılan kütüphaneler | gerekiyorsa |
| Üretilen servis testleri | `test/services/<svc>/{unit,integration,e2e}/` (üç dosya) | her tablo için: validator, repository okuması, route kablolaması | evet |
| Elle servis testleri | `test/services/<svc>/custom/` + `integration/*.integration.test.js` | domain kuralları, use-case'ler, handler'lar, gerçek SQL akışları | kısmen |
| Web birim testleri | `<proje>-web-app/src/**/__tests__/` | hook'lar, bileşenler, yardımcılar | hayır |
| E2E | `e2e/tests/` | gerçek tarayıcıda çok aktörlü kullanıcı akışları | compose |

### 15.2 `jest.config.js`

İki proje vardır:
- **`backend`**: `node` ortamı, `transform: {}`, DB kurulumu (globalSetup ve globalTeardown), worker başına DB, `testTimeout: 20_000`.
- **`web`**: `jsdom` ortamı, izole babel, alias eşlemeleri.

```js
// Vite/jsconfig alias'larının jest aynası. Yeni alias ÜÇ yere birden eklenir:
// vite.config.js resolve.alias, jsconfig.json paths, burası.
const W = '<rootDir>/<proje>-web-app/src';
const webAliases = {
  '^@assets/(.*)$': `${W}/assets/$1`,
  '^@components/(.*)$': `${W}/components/$1`,
  '^@container/(.*)$': `${W}/container/$1`,
  '^@hooks/(.*)$': `${W}/hooks/$1`,
  '^@layouts/(.*)$': `${W}/layouts/$1`,
  '^@pages/(.*)$': `${W}/pages/$1`,
  '^@router/(.*)$': `${W}/router/$1`,
  '^@shared/(.*)$': `${W}/shared/$1`,
  '^@store$': `${W}/store/index.jsx`,   // ÇIPLAK barrel da eşlenir (Vite ikisini de çözer)
  '^@store/(.*)$': `${W}/store/$1`,
  '^@styles/(.*)$': `${W}/styles/$1`,
  '^@api/(.*)$': `${W}/api/$1`,
  '^@utils/(.*)$': `${W}/utils/$1`,
  '^@features/(.*)$': `${W}/features/$1`,
};

export default {
  rootDir: '.',
  maxWorkers: 4,   // ÖLÇÜLEREK seçildi (uzak DB'de daha fazla worker kazanç getirmedi); ortam değişirse yeniden ölç
  forceExit: true, // YALNIZCA kök config'te tanınır; projects içine yazılırsa sessizce yok sayılır
  collectCoverageFrom: ['core/**/src/**/*.js', 'services/**/src/**/*.js', '!**/boot.js', '!**/node_modules/**'],
  projects: [
    {
      displayName: 'backend',
      rootDir: '.',
      transform: {},
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/test/services/**/unit/**/*.test.js',
        '<rootDir>/test/services/**/integration/**/*.test.js',
        '<rootDir>/test/services/**/e2e/**/*.test.js',
        '<rootDir>/test/services/**/custom/**/*.test.js',
        '<rootDir>/packages/**/__tests__/**/*.test.js',
      ],
      globalSetup: '<rootDir>/test/config/db-setup.js',
      globalTeardown: '<rootDir>/test/config/db-teardown.js',
      setupFiles: ['<rootDir>/test/config/worker-db.js'], // test modülü import EDİLMEDEN önce koşar
      testTimeout: 20_000,
    },
    {
      displayName: 'web',
      rootDir: '.',
      testEnvironment: 'jsdom',
      testMatch: [
        '<rootDir>/<proje>-web-app/src/**/__tests__/**/*.test.{js,jsx}',
        '<rootDir>/<proje>-landing-app/src/**/__tests__/**/*.test.js',
      ],
      extensionsToTreatAsEsm: ['.jsx'],
      transform: {
        '^.+\\.jsx?$': [
          'babel-jest',
          {
            babelrc: false,
            configFile: false, // kök babel config'i vite build'e karışmasın
            presets: [
              ['@babel/preset-env', { targets: { node: 'current' } }],
              ['@babel/preset-react', { runtime: 'automatic' }],
            ],
          },
        ],
      },
      moduleNameMapper: {
        '\\.(css|scss|sass)$': 'identity-obj-proxy',
        '\\.(svg|png|jpe?g|gif|webp|avif|woff2?|ttf|eot)$': '<rootDir>/test/config/file-stub.js',
        // import.meta.glob kullanan barrel'lar Jest'te ÇALIŞMAZ → stub
        '^@api$': '<rootDir>/test/config/api-stub.js',
        '^@layouts$': '<rootDir>/test/config/layouts-stub.jsx',
        '^@shared/axios/axios$': '<rootDir>/test/config/axios-stub.js',
        ...webAliases,
      },
      setupFilesAfterEnv: ['<rootDir>/test/config/web-setup.js'], // import '@testing-library/jest-dom'
    },
  ],
};
```

Çalıştırma: `node --experimental-vm-modules node_modules/.bin/jest --selectProjects backend --testPathPattern <desen>`. Bayrak tekildir: `--testPathPattern` (Jest 29).

### 15.3 Test veritabanı

`test/config/` klasörü referanstan kopyalanır: `db-setup.js`, `db-teardown.js`, `worker-db.js`, `db-client.js`, `test-server.js` ve stub dosyaları.

Sözleşme:
- **Şema kaynağı**: `.env.test` içindeki `CORE_APP_DB_CONNECTION_STRING` ile verilen kaynak DB'dir (yerelde dev DB). Kaynak DB migrate edilmiş olmalıdır.
- `pg_dump --schema-only` çıktısı, şemanın **parmak izine** göre `node_modules/.cache/<proje>-test-schema` altında önbelleğe alınır. Şema değişmedikçe dump tekrar çalışmaz; değişince önbellek kendiliğinden tazelenir. Böylece bayat şemayla yeşil test mümkün olmaz.
- **Worker başına ayrı DB**: `worker-db.js`, `TEST_DB_NAME` değerini `<TEST_DB_BASE_NAME || '<proje_db>_test'>_<JEST_WORKER_ID>` olarak ayarlar. Paylaşılan tek bir DB, paralel koşuda `deadlock detected` üretiyordu.
- **Bayraklar**:
  - `TEST_REUSE_DB=1` (`npm run test:fast`): var olan worker DB'lerini yeniden kullanır. DB boşsa (0 tablo) test **patlar**; sessizce geçmez.
  - `TEST_DB_REFRESH=1`: önbelleği yok sayar.
- Tüm dış komutların zaman aşımı vardır; asılı kalmak yerine sebebini söyleyen bir hatayla düşer.
- Gereken istemci araçları: `pg_dump` ve `psql` (macOS: `brew install libpq && brew link --force libpq`). `pg_dump` sürümü sunucu sürümünden küçük olamaz.
- Referans erişilemiyorsa daha basit bir yedek uygulama yazılır: her worker DB'si `_combined.sql` üzerinden `psql -v ON_ERROR_STOP=1 -f` ile kurulur. Aynı `TEST_REUSE_DB` sözleşmesi korunur.

### 15.4 `test/services/<svc>/` düzeni

```
test/services/service-<domain>/
├── configs/datasource-config.js     # test DB bağlantısı: TEST_DB_* env'lerinden kurulur
├── unit/entities.test.js            # ÜRETİLEN: describe.each(tableDefs) → validator'lar
├── integration/repositories.test.js # ÜRETİLEN: her tablo için repo.read({}, caller) SQL'i koşuyor mu
├── e2e/controllers.test.js          # ÜRETİLEN: her OpenAPI yolunun handler'ına ULAŞILIYOR mu
├── integration/<konu>.integration.test.js   # ELLE: gerçek DB akışları (yarış, idempotency...)
└── custom/                           # ELLE: domain/, application/, interfaces/
```

- Üç "ÜRETİLEN" dosya `tableDefs` üzerinde parametreli çalışır. Tablo sayısı ne olursa olsun servis başına yalnızca üç dosya vardır ve yeni tabloyu kendiliğinden kapsar. Bu dosyalar düzenlenmez; referanstan kopyalanır ve servis yolları değiştirilir.
- **Elle yazılan testlerin yerleri**:

| Test konusu | Dosya |
|---|---|
| saf domain kuralı | `custom/domain/<kural>.test.js` |
| use-case (sahte repo ile) | `custom/application/<eylem>.test.js` |
| handler ya da route | `custom/interfaces/<uç>.test.js` |
| gerçek SQL | `integration/<konu>.integration.test.js` |

- **Kablolama testi** (ZORUNLU, servis başına bir tane): `custom/interfaces/container-wiring.test.js`. Container'ın dondurulmuş haritasındaki her use-case'in `typeof === 'function'` olduğunu ve route'ların handler'lara bağlandığını doğrular.
- `e2e/controllers.test.js` nasıl çalışır:
  - izin başlığını (`useraccountpermissionlist`) gönderir,
  - OpenAPI'deki `{param}` biçimini Express'in `:param` biçimine çevirir,
  - tüm route'lardan sonra 599 dönen bir **nöbetçi** route bağlar. Yanıt nöbetçiden geliyorsa route hiç eşleşmemiştir.
  - 200 beklemez; uydurma bir parametre için dürüst yanıt 404 olabilir.
- Zaman ve saat dilimi testleri `TZ=UTC` ve `TZ=Asia/Tokyo` ile de koşulur.

### 15.5 Web testleri

- Test dosyaları `src/**/__tests__/*.test.{js,jsx}` altındadır ve Testing Library kullanır.
- Olumsuz iddialar (`queryByText(...)).toBeNull()`) metni elle yazarak **kurulmaz**; beklenen metin `i18n.t('anahtar')` ile çözülür. Elle yazılan Türkçe bir metin, en-US koşan testte hiçbir zaman bulunmaz ve iddia her zaman geçer.
- Gerçek router ile yapılan testlerde jsdom için `TextEncoder` polyfill'i eklenir, router dinamik import edilir ve `notistack` mock'lanır.

### 15.6 E2E: Playwright

**Genel kurallar (ZORUNLU)**:
- Önkoşullar (kullanıcı, organizasyon, veri) API ya da SQL yardımcılarıyla kurulur. **Kullanıcıya görünen sonuç arayüzden doğrulanır.**
- E2E `workers: 1` ile koşar; ortak sayaçları okuyan testler paralel koşamaz.
- Filtreleme dosya adıyla yapılır (`npx playwright test e2e/tests/<dosya>.spec.js`), `-g` ile değil. `-g` büyük/küçük harf duyarsızdır ve alakasız testleri de içeri alır.
- Test verisi benzersiz ve rastgele üretilir; gerçek görünen telefon numarası ya da e-posta üretilmez. SQL yardımcısı yalnızca isimli E2E yığınına bağlanır ve komutu `psql`'e stdin'den gönderir.

`e2e/` düzeni:

```
e2e/
├── run.js  playwright.config.js  README.md
├── fixtures/                  # örnek dosyalar (PDF...)
├── helpers/{api-client.js, setup-user.js, test-data.js, db.js, ui-<akış>.js}
└── tests/<alan>/<akış>.spec.js
```

`e2e/run.js`:

```js
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
const COMPOSE = ['compose', '-p', '<proje>-e2e', '-f', 'docker-compose.e2e.yml'];
const READY_URL = 'http://127.0.0.1:<PORT_BASE>/api/<proje>-service-identity/v1/public/ping';
const READY_TIMEOUT_MS = 120_000;
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: 'inherit', ...opts });

// Koşu başına test JWT anahtarları (gitignore'da; gateway'e volume olarak bağlanır).
const ensureJwtKeys = () => {
  const dir = path.join(ROOT, 'e2e/.jwt');
  if (existsSync(path.join(dir, 'private.pem'))) return;
  mkdirSync(dir, { recursive: true });
  if (run('openssl', ['genrsa', '-out', `${dir}/private.pem`, '2048']).status !== 0) throw new Error('openssl genrsa');
  if (run('openssl', ['rsa', '-in', `${dir}/private.pem`, '-pubout', '-out', `${dir}/public.pem`]).status !== 0) throw new Error('openssl rsa');
};

const waitReady = async () => {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(READY_URL)).ok) return true;
    } catch {
      // Backend henüz ayakta değil; bu beklenen bir durum.
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
};

let started = false;
let exitCode = 1;
try {
  // Açık bir yığını yeniden kullanma ya da silme: taze şema ve güncel imaj ön koşuldur.
  const existing = spawnSync('docker', [...COMPOSE, 'ps', '-aq'], { encoding: 'utf8' });
  if (existing.status !== 0) throw new Error('docker compose durumu okunamadı');
  if (existing.stdout.trim()) throw new Error('<proje>-e2e yığını zaten açık: kapat ya da doğrudan playwright çalıştır');
  if (run('node', ['scripts/build-schema.js']).status !== 0) throw new Error('şema üretilemedi');
  ensureJwtKeys();
  // İmaj TEK KEZ build edilir; compose'un paralel build'i Docker daemon'unu çökertebiliyor.
  if (run('docker', ['build', '-f', 'Dockerfile.e2e', '-t', '<proje>-e2e:latest', '.']).status !== 0) throw new Error('imaj build edilemedi');
  started = true;
  if (run('docker', [...COMPOSE, 'up', '-d', '--no-build']).status !== 0) throw new Error('compose up başarısız');
  if (!(await waitReady())) throw new Error('backend hazır olmadı');
  exitCode = run('npx', ['playwright', 'test', '--config', 'e2e/playwright.config.js', ...process.argv.slice(2)]).status ?? 1;
} catch (error) {
  console.error(`✗ ${error.message}`);
} finally {
  if (started) run('docker', [...COMPOSE, 'down', '-v']); // yalnızca KENDİ açtığı yığını kapatır
}
process.exit(exitCode);
```

`e2e/playwright.config.js`:

```js
import { defineConfig, devices } from '@playwright/test';

// APP_BASE, vite.config.js ile AYNI env'den okunur; ayrışırsa her UI testi 404'te takılır.
const APP_BASE = globalThis.process?.env?.APP_BASE || '/';
const APP_URL = `http://localhost:4317${APP_BASE.startsWith('/') ? '' : '/'}${APP_BASE}`;

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  preserveOutput: 'always',
  timeout: process.env.HEADED === '1' ? 180_000 : 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: './playwright-report' }]],
  use: {
    baseURL: APP_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on',
    actionTimeout: 15_000,
    locale: 'en-US',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], headless: process.env.HEADED !== '1' } }],
  webServer: {
    // Üretim paketi derlenir ve preview ile sunulur. Dev modunun soğuk başlangıç
    // zamanlaması, uygulama hatalarını spinner'ların arkasına saklıyordu.
    // npm script'i DEĞİL binary çağrılır: script içindeki satır içi env ataması buradaki env'i ezer.
    command: 'npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 4317 --strictPort',
    cwd: '../<proje>-web-app',
    url: APP_URL,
    reuseExistingServer: false,
    timeout: 240_000,
    env: { VITE_PROXY_TARGET: 'http://127.0.0.1:<PORT_BASE>' },
  },
});
```

`docker-compose.e2e.yml`:

```yaml
x-service-base: &service-base
  image: <proje>-e2e:latest        # run.js tek kez build eder; compose build ETMEZ
  restart: on-failure
  depends_on:
    e2e-db: { condition: service_healthy }
    e2e-redis: { condition: service_healthy }

x-common-env: &common-env
  NODE_ENV: development
  CORE_APP_DB_CONNECTION_STRING: postgres://test_user:test_pass@e2e-db:5432/<proje_db>_e2e
  CORE_REDIS_URL: redis://e2e-redis:6379
  CORE_REDIS_PASSWORD: ''
  CORE_DISCOVERY_REDIS_URL: redis://e2e-redis:6379
  CORE_DISCOVERY_REDIS_PASSWORD: ''
  PROJECT_PREFIX: service
  PUBSUB_CHANNEL: app.fct.servicerestarted
  CORS_ORIGINS: '*'
  ACCESS_TOKEN_EXPIRY: '9000'
  REFRESH_TOKEN_EXPIRY: '12096000'
  INTERNAL_API_KEY: e2e_internal_api_key_shared_across_all_services
  OPENAPI_UI_KEY: e2e_openapi_ui_key
  COOKIE_SECRET: e2e_cookie_secret_value
  LISTEN_HOST: '0.0.0.0'            # hostname bir servis adı: 0.0.0.0'a bağlanır
  RATE_LIMIT_MAX: '100000'
  RATE_LIMIT_AUTH_MAX: '100000'
  # ⚠️ Dış etki kanalları KAPALI. NODE_ENV burada 'development'; `=== 'test'` kontrolleri bu ortamı YAKALAMAZ.
  SMS_DISABLED: 'true'
  PAYMENT_PROVIDER: fake
  PAYMENT_FAKE_SECRET: e2e-fake-secret-not-for-production
  # Tarayıcının açabileceği adres (Docker ağının içindeki adlar tarayıcıdan çözülemez).
  PUBLIC_APP_BASE_URL: http://localhost:4317
  GATEWAY_REST_URL: http://gateway:<PORT_BASE>
  SERVICE_IDENTITY_REST_URL: http://identity:<PORT_BASE+1>
  SERVICE_<DOMAIN>_REST_URL: http://<domain>:<PORT_BASE+N>

services:
  e2e-db:
    image: timescale/timescaledb:2.27.2-pg18
    environment:
      POSTGRES_USER: test_user
      POSTGRES_PASSWORD: test_pass
      POSTGRES_DB: <proje_db>_e2e
    ports: ['5434:5432']           # yerel dev Postgres (5432) ile çakışmaz
    volumes: ['./db-schemas/_combined.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U test_user -d <proje_db>_e2e']
      interval: 3s
      timeout: 3s
      retries: 20
  e2e-redis:
    image: redis:7-alpine          # host portu YAYINLANMAZ: yerel test Redis'iyle çakışırdı
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 3s
      timeout: 3s
      retries: 20
  identity:
    <<: *service-base
    working_dir: /app/services/<proje>-service-identity
    command: node main.js
    environment: *common-env
    healthcheck:
      test: ['CMD', 'node', '-e', "fetch('http://127.0.0.1:<PORT_BASE+1>/api/online').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 3s
      timeout: 3s
      retries: 40
  # <domain>: identity ile aynı kalıp, kendi portuyla
  gateway:
    <<: *service-base
    working_dir: /app/services/<proje>-web-gateway
    command: node main.js
    environment:
      <<: *common-env
      JWT_PRIVATE_KEY_PATH: /keys/private.pem
      JWT_PUBLIC_KEY_PATH: /keys/public.pem
    volumes: ['./e2e/.jwt:/keys:ro']
    ports: ['<PORT_BASE>:<PORT_BASE>']
    depends_on:
      e2e-db: { condition: service_healthy }
      e2e-redis: { condition: service_healthy }
      identity: { condition: service_healthy }
```

Belirli bir davranışı hızlandıran env'ler (ör. yayın bekleme süresi `0`) host'tan ezilebilir tutulur: `'${X:-0}'`. O davranışı gerçek süreyle test eden spec, ilgili komutla ayrıca koşulur.

### 15.7 E2E teşhisi: belirti ≠ sebep

- **Test süresi ipucudur.** Test 2 saniyede düşüyorsa sorun kurulumda ya da API'dedir. 15–17 saniyede düşüyorsa test gerçekten o locator'ı beklemiştir.
- Kaynak koddan tahmin yürütmeden önce ekran görüntüsünü ve `error-context.md` dosyasını oku.
- Bir onarım "işe yaramadı" gibi görünüyorsa belirtinin aynı kalıp kalmadığına bak. Süre değiştiyse onarım tutmuş, bir alt katman açılmıştır.

| Görülen belirti | Referans projede çıkan gerçek sebep |
|---|---|
| Playwright `webServer` zaman aşımı | port başıboş bir süreç tarafından tutuluyordu (`lsof -nP -iTCP:<port> -sTCP:LISTEN`) |
| Seed ya da plan bulunamadı | `_combined.sql` bayattı (git'te değil, git söylemez) |
| Giriş ekranında locator zaman aşımı | Vite proxy'si yanlış porta gidiyordu |
| Beklenen modal bulunamadı | MUI base Modal `role="presentation"` basar; `getByRole('dialog')` bulamaz |
| Sayfa boş, uygulama JSON almış | Playwright `**/api/**` deseni Vite dev'de `/src/api/*.js` modüllerini de yakalıyordu |
| "Channel closed" | turun kendisi kesilmişti, uygulama kusuru değildi |
| 500 | gerçek uygulama kusuru (Postgres parametre tipi) |

---

## 16. Frontend

### 16.1 Yığın

- **Temel**: React 19 + Vite 8 (`@vitejs/plugin-react`). Yalnızca **JS/JSX** kullanılır; TypeScript yasaktır. Tek istisna `.d.ts` tip bildirimleridir (ör. `styles.d.ts`).
- **Routing**: React Router 7.
- **State**: React Query 5 (sunucu verisi) + Zustand 5 (istemci durumu).
- **UI**: MUI 7, ama yalnızca wrapper bileşenleri üzerinden. SCSS modülleri ve global token'lar.
- **Diğer**: react-i18next, React Hook Form (tam sürüm sabit), axios, notistack, dayjs.
- **İSTEĞE BAĞLI**: AG Grid (lisans), ECharts, OpenLayers, Firebase push.

### 16.2 Dizin yapısı

```
<proje>-web-app/
├── index.html  vite.config.js  jsconfig.json  eslint.config.js  .prettierrc.json  .env.example
├── public/                    # favicon; push varsa firebase-messaging-sw.js
├── scripts/                   # validate-translations.mjs, reorder-translation-keys.mjs
├── .cursor/rules/*.mdc        # §16.13
└── src/
    ├── main.jsx               # createRoot → <Container><App/></Container>
    ├── api/                   # servis başına modül (default export: fonksiyon nesnesi) + index.jsx (glob)
    ├── assets/
    ├── components/            # global MUI wrapper'ları (MuiButton, MuiSelect...) + index.jsx (glob)
    ├── container/             # Container.jsx (provider ağacı), AuthBootstrap.jsx
    ├── features/<domain>/     # components/ forms/ hooks/ store/ utils/ __tests__/
    ├── hooks/                 # global hook'lar
    ├── layouts/               # sayfa iskeletleri + index.jsx (glob)
    ├── pages/                 # route seviyesinde ince sayfalar
    ├── router/                # App.jsx, routes/{public,protected,error}Routes.jsx, routeUtils/
    ├── shared/
    │   ├── auth/              # permissions.jsx, route-permissions.js (ROUTE_PERMISSIONS)
    │   ├── axios/axios.jsx
    │   ├── constant/          # api-constant.js, route-paths.js, queryKeys.js
    │   ├── providers/         # QueryProvider, ThemeProvider, NotificationProvider
    │   ├── translation/       # i18n.js, locales.js, keys/<alan>Keys.js
    │   └── utils/
    ├── store/                 # Zustand: authStore, themeStore, appStore (slices/), uiStore, gridStore, modalStore + index.jsx
    └── styles/                # _globals, _colors, _typography, _spacing, _mixins, _shadows, _animations, _utilities, _ui, index.scss, globalStyles.css
```

- `pages/` ince kalır; asıl UI ve mantık `features/<domain>/` altındadır. Böylece bir özellik başka bir sayfada da kullanılabilir.
- Testler `features/<domain>/__tests__/` altında, özelliğin yanında durur.

### 16.3 Provider sırası (ZORUNLU)

```
ThemeProvider → NotificationProvider (notistack) → QueryProvider → BrowserRouter(basename=import.meta.env.BASE_URL)
  → AuthBootstrap → <küresel diyalog provider'ları> → App
```

- Navigate eden, sorgu çalıştıran ya da toast gösteren küresel diyaloglar (ör. 402 alındığında açılan plan limiti diyaloğu) Router, Query ve Snackbar'ın **içinde** durur.
- `main.jsx`, URL'den okunması gereken değerleri (davet kodu gibi) mount'tan **önce** yakalar; router ilk gezinmede query string'i temizleyebilir.

### 16.4 API katmanı

- `src/api/<servis>.jsx` dosyası default export olarak bir fonksiyon nesnesi verir. `api/index.jsx`, `import.meta.glob` ile bu nesnelerin hepsini **tek bir düz nesnede** birleştirir. Bu yüzden fonksiyon adları **tüm modüller genelinde benzersiz** olmalıdır; çakışan adda son yazılan sessizce kazanır.
- Servis yolları `shared/constant/api-constant.js` içinde tanımlıdır: `API`, `<DOMAIN>_SERVICE`...
- İki yanıt biçimi vardır:
  - elle yazılan uçlar `{ success, data }` döndürür; hook bunu `select` ile açar (`r.data.data`),
  - auto-CRUD uçları ham dizi döndürür (`r.data`).
- React Query:
  - key'ler kararlı dizilerdir: `['<feature>', '<eylem>', params]`,
  - `QueryProvider` varsayılanları: `retry: false`, `refetchOnWindowFocus: false`,
  - mutation'lardan sonra ilgili key'ler invalidate edilir.

### 16.5 axios (`shared/axios/axios.jsx`)

- Yapılandırma: `withCredentials: true`, `xsrfCookieName: '<proje>_xsrf'`, `xsrfHeaderName: 'X-XSRF-TOKEN'`.
- **401 geldiğinde tek uçuşlu (single-flight) refresh** yapılır: `refreshInFlight` adlı paylaşılan bir promise, aynı anda düşen isteklerin hepsinin tek bir refresh'i beklemesini sağlar. İstek `_retry` bayrağıyla bir kez tekrarlanır; `_skipRefresh` ile bu davranıştan çıkılabilir.
- Login ekranına **yalnızca oturumu açık** bir kullanıcı yönlendirilir. Anonim bir 401 yönlendirilirse remount → `/me` → 401 döngüsü doğar (bug-1747).

### 16.6 AuthBootstrap: önce hydration, sonra doğrulama

- Zustand'ın persist ettiği auth durumunun yüklenmesi beklenir, ardından `/api/gateway/me` ile oturum doğrulanır.
- 8 saniyelik zaman aşımı (`HYDRATION_TIMEOUT_MS`) dolarsa kullanıcı `unauthenticated` durumuna düşer. Böylece yavaş bir ağ ya da çökmüş bir gateway kullanıcıyı sonsuza kadar bekletmez.

### 16.7 State

- Zustand yalnızca **istemci durumunu** tutar: tema (persist edilir), UI, modal, grid, auth özeti. Sunucu verisi burada tutulmaz.
- Store'a erişimde selector zorunludur: `useAuthStore((s) => s.isLoggedIn)`. React dışında `useXStore.getState()` kullanılır.
- Büyük store'lar slice deseniyle kurulur: `slices/` + `create()`.

### 16.8 Routing ve yetki

- Route tanımları `router/routes/{public,protected,error}Routes.jsx` dosyalarındadır. Path sabitleri `shared/constant/route-paths.js` içindedir.
- `routeUtils/` bileşenleri:
  - `ProtectedRoute`: oturum var mı,
  - `RoleProtectedRoute`: rol,
  - `PermissionProtectedRoute`: izin (`ROUTE_PERMISSIONS`),
  - `RoleHomeRedirect`: role göre ana sayfa,
  - `RedirectHome`: olmayan ya da yetkisiz sayfa → ana sayfa + bildirim.
- `*` catch-all route'u `ProtectedRoute`'un arkasındadır; oturumu olmayan kullanıcı giriş sayfasına gider.

### 16.9 Alias'lar

13 alias vardır: `@assets`, `@components`, `@container`, `@hooks`, `@layouts`, `@pages`, `@router`, `@shared`, `@store`, `@styles`, `@api`, `@utils`, `@features`. Üç yerde **aynı** tutulur (ZORUNLU):
- `vite.config.js` → `resolve.alias`,
- `jsconfig.json` → `paths`,
- `jest.config.js` → `webAliases`.

Import sırası: 1) üçüncü taraf paketler, 2) `@alias` importları, 3) göreli importlar, 4) stil dosyaları.

Registry ve doğrudan import:
- birden fazla ortak bileşen gerekiyorsa `import Components from '@components'; const { MuiButton } = Components;`,
- bir iki bileşen gerekiyorsa `import MuiButton from '@components/MuiButton/MuiButton'`.

### 16.10 Stil

- **Bileşen stili**: bileşenin yanında `ComponentName.module.scss` dosyası, `styles` adıyla import edilir. Koşullu sınıflar için `classnames` kullanılır.
- **Global SCSS** yalnızca `src/styles/` altındadır ve yalnızca token, reset, utility ve kütüphane override'ı içerir. Tek bir bileşen için yeni bir global stylesheet açılmaz.
- `_globals.scss`, `vite.config.js` içindeki `additionalData: '@use "@styles/globals" as *;'` ile her modüle enjekte edilir.
- Ham MUI bileşeni kullanılmaz; wrapper'lar kullanılır: `MuiButton`, `MuiSelect`, `MuiTextInput`, `MuiCheckbox`, `MuiSwitch`, `MuiComboBox`... Wrapper'ların ortak prop'ları: `size: lg|md|sm|xs`, `variant`, `infoLabel`, ikon prop'ları. Gerekçe: bir tasarım kararı (ör. köşe yuvarlaklığı) tek bir dosyada değişir.
- Media query bir grid şablonunu değiştiriyorsa, o bloktaki **tüm** görünür çocukların satır ve kolon atamaları açıkça yazılır (§21).

### 16.11 i18n

- Kullanıcıya görünen her metin `t('anahtar')` ile gelir; hardcode metin yasaktır.
- Anahtarlar `shared/translation/keys/<alan>Keys.js` dosyalarında, `<diller>` için tutulur.
- API hata kodları `apiErrors.<KOD>` altında çevrilir (§8.11).
- `npm run validate:translations` (web) eksik anahtarları yakalar. Bu komut anahtar dosyalarını yeniden sıralar; oluşan sıralama diff'i commit'lenmez.
- Dağıtım doğrulaması UI **metniyle** değil, i18n **anahtar adıyla** ve bundle hash'iyle yapılır. Farklı iki anahtar aynı metni taşıyabilir; metin eşleşmesi yanlış pozitif üretir.

### 16.12 `vite.config.js`

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

// Varsayılan STAGING: yerel geliştirme üretim verisine dokunmasın.
// Üretime bakmak ancak VITE_PROXY_TARGET ile açıkça verilerek mümkün.
const proxyTarget = globalThis.process?.env?.VITE_PROXY_TARGET || 'https://<staging-app-host>';
// SPA'nın servis edildiği yol. Sunucu tarafı linkler ve Playwright AYNI APP_BASE'i okur.
const appBase = globalThis.process?.env?.APP_BASE || '/';
// Build kimliği: hata raporlarına hangi derlemede oluştuğu yazılır. git yoksa 'unknown'.
const appVersion = (() => {
  if (globalThis.process?.env?.APP_VERSION) return globalThis.process.env.APP_VERSION;
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
})();

export default defineConfig({
  base: appBase,
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  css: { preprocessorOptions: { scss: { additionalData: '@use "@styles/globals" as *;' } } },
  server: {
    port: 3000,
    proxy: { '/api': { target: proxyTarget, changeOrigin: true, secure: false } },
  },
  resolve: {
    alias: {
      '@assets': '/src/assets',
      '@components': '/src/components',
      '@container': '/src/container',
      '@hooks': '/src/hooks',
      '@layouts': '/src/layouts',
      '@pages': '/src/pages',
      '@router': '/src/router',
      '@shared': '/src/shared',
      '@store': '/src/store',
      '@styles': '/src/styles',
      '@api': '/src/api',
      '@utils': '/src/utils',
      '@features': '/src/features',
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/react-router-dom/')) return 'vendor-react';
          if (id.includes('@mui/') || id.includes('@emotion/')) return 'vendor-mui';
          if (id.includes('ag-grid')) return 'vendor-ag-grid';
          if (id.includes('echarts')) return 'vendor-echarts';
          if (id.includes('/node_modules/ol/') || id.includes('/node_modules/ol-mapbox-style/')) return 'vendor-ol';
        },
      },
    },
  },
});
```

`<staging-app-host>` henüz yoksa `http://127.0.0.1:<PORT_BASE>` yaz ve DECISIONS'a `BEKLİYOR` ekle. `vite preview`, `server.proxy` ayarını miras alır; E2E bunu kullanır.

### 16.13 `.cursor/rules/*.mdc` (web)

Cursor, glob'a göre kural enjekte eder. `CLAUDE.md` ile aynı konvansiyonları, dosya tipine göre parçalanmış halde taşır. Referans repodaki `<proje>-web-app/.cursor/rules/` klasöründen kopyalanır:

| Dosya | Kapsam |
|---|---|
| `core-js-formatting.mdc` | yalnızca JS (TS yasak), Prettier hizası |
| `imports-aliases-order.mdc` | alias tercihi ve import sırası |
| `components-registry-vs-direct-imports.mdc` | registry mi doğrudan import mu |
| `react-components-default-export.mdc` | function component + default export |
| `mui-wrapper-components.mdc` | ham MUI yerine wrapper |
| `zustand-store-patterns.mdc` | selector, slice, `getState()` |
| `react-query-patterns.mdc` | provider varsayılanları, key biçimi, invalidation |
| `scss-modules-conventions.mdc` | SCSS modülü, global stil sınırları |
| `i18n-translation-usage.mdc` | `t()` zorunluluğu |
| `karpathy-guidelines.mdc` | minimal değişiklik, varsayım yerine sor, doğrulanabilir başarı ölçütü |

### 16.14 Web push (İSTEĞE BAĞLI)

- Dört değer zorunludur: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_VAPID_KEY`. Biri bile eksikse push devre dışı sayılır ve opt-in düğmesi görünmez. Uygulama içi bildirim merkezi yine tam çalışır.
- Service worker dosyası: `public/firebase-messaging-sw.js`.
- Sunucu tarafı servis hesabı JSON'u repo dışında durur (`FCM_SERVICE_ACCOUNT_JSON_PATH`). `project_id` üç yerde aynı olmalıdır: web config'i, `FCM_PROJECT_ID` ve JSON'un kendisi.

---

## 17. Landing ve ortak içerik paketleri (İSTEĞE BAĞLI)

- **Yığın**: Astro 6, `output: 'static'`, Tailwind 4 (`@tailwindcss/vite`), `@astrojs/sitemap`, `astro-icon`, i18n.
- **Ayrı origin**: landing `<landing-host>`'ta, uygulama `<app-host>`'ta çalışır. Gerekçe: landing'e eklenen üçüncü taraf script'ler (pixel, tag) aynı origin'de olsaydı oturum çerezli API çağrısı yapabilir, localStorage'ı okuyabilirdi. Ayrı host ve kapalı CORS ile bu sınırı tarayıcı uygular.
- **Derleme zamanı veri**: landing, içeriği (ör. makaleler) public bir GET ucundan **derleme sırasında** çeker. Son başarılı çekim `src/data/<ad>.cache.json` olarak **commit'lenir**; API kapalıysa derleme bu dosyayla çıkar. Görseller derlemede indirilir ve gitignore'dadır.
- **Ortak içerik paketi** `@<proje>/legal-content` (`packages/legal-content`):
  - JS modülleri + `index.d.ts`, `package.json` içinde `exports` alanı,
  - web ve landing ikisi de import eder,
  - kök workspaces listesindedir.
- **Testler**: landing'in kendi test koşucusu yoktur. Testleri Jest `web` projesinde koşar; TS import etmez, kaynak dosyaları **metin olarak** okuyup yapısal değişmezleri doğrular.
- **Kurulum**: `update.sh` landing bağımlılıklarını ayrıca kurar (`cd <proje>-landing-app && npm ci --include=dev`). Kök `build` script'i landing'i de derler.

---

## 18. AI katmanı

### 18.1 Dosyalar

| Dosya / klasör | Git | Rolü |
|---|---|---|
| `CLAUDE.md` | izlenir | Claude Code'un giriş noktası. Kısadır; kurallara ve skill'e yönlendirir. |
| `AGENTS.md` | izlenir | Codex ve diğer ajanlar için: `@.wolf/OPENWOLF.md` |
| `.claude/settings.json` | izlenir | **Paylaşılan** hook'lar; yalnızca `$CLAUDE_PROJECT_DIR` ile yazılır |
| `.claude/settings.local.json` | izlenmez | kişisel izin listesi, statusLine, `defaultMode` |
| `.claude/rules/openwolf.md` | izlenir | her oturumda yüklenen kısa kurallar |
| `.claude/commands/{handoff,designqc,reframe,security-audit}.md` | izlenir | slash komutları (OpenWolf ile gelir) |
| `.claude/skills/{openwolf,design-qc,reframe-ui}/SKILL.md` | izlenir | isteğe bağlı yüklenen protokoller (OpenWolf ile gelir) |
| `.mcp.json` | izlenir | proje MCP sunucuları (codegraph) |
| `.codegraph/` | izlenmez | kod grafiği indeksi (`codegraph init`) |
| `.cursor/rules/openwolf.mdc` | izlenir | `alwaysApply: true` |
| `.wolf/OPENWOLF.md`, `STATUS.md`, `cerebrum.md`, `cerebrum-archive.md`, `buglog.json`, `buglog-archive.json`, `config.json`, `cron-manifest.json`, `plans/` | izlenir | kalıcı bilgi ve devir notu |
| `.wolf/hooks/`, `anatomy*`, `memory.md`, `token-ledger.json`, `backups/`, daemon dosyaları | izlenmez | makineye yerel; yüksek değişim hızlı, çakışmaya açık |

### 18.2 Kurulum sırası

```bash
npm i -g openwolf @colbymchenry/codegraph     # sürümleri DECISIONS'a yaz; tüm makinelerde AYNI sürüm
openwolf init                                 # .wolf/ ve hook'lar (referansta sürüm 1.0.4)
codegraph init                                # .codegraph/ indeksi
ls .wolf/hooks                                # settings.json YALNIZCA burada var olan script'leri çağırır
```

- `openwolf init`'in `.wolf/` dışında hangi dosyaları oluşturduğu sürüme göre değişir. Kurulumdan sonra `git status` ile bak.
- `.claude/{rules,commands,skills}` oluşmadıysa referans repodan kopyala.
- `openwolf init` kullanıcı seviyesindeki `~/.claude/settings.json`'a hook yazdıysa o girdileri sil ve hook'ları proje seviyesine taşı (§18.6).

Kurulumdan sonra şunları yaz ya da düzelt (§18.3): `.claude/settings.json`, `.mcp.json`, `CLAUDE.md`, `AGENTS.md`, `.claude/rules/openwolf.md`, `.cursor/rules/openwolf.mdc`. Web için `.cursor/rules` klasörü referanstan kopyalanır (§16.13).

### 18.3 Şablonlar

`.claude/settings.json`:
- Mutlak yol, izin listesi ya da `defaultMode` içermez.
- Yalnızca `.wolf/hooks/` altında gerçekten var olan script'lere bağlanır. Daha yeni OpenWolf sürümleri `pre-bash`, `post-bash`, `user-prompt-submit`, `post-batch`, `precompact` ve `session-end` hook'larını da ekler; bunlar yalnızca dosyaları varsa yazılır.

```json
{
  "hooks": {
    "SessionStart": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.wolf/hooks/session-start.js\"", "timeout": 5 }] }
    ],
    "PreToolUse": [
      { "matcher": "Read", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.wolf/hooks/pre-read.js\"", "timeout": 5 }] },
      { "matcher": "Write|Edit|MultiEdit", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.wolf/hooks/pre-write.js\"", "timeout": 5 }] }
    ],
    "PostToolUse": [
      { "matcher": "Read", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.wolf/hooks/post-read.js\"", "timeout": 5 }] },
      { "matcher": "Write|Edit|MultiEdit", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.wolf/hooks/post-write.js\"", "timeout": 10 }] }
    ],
    "Stop": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.wolf/hooks/stop.js\"", "timeout": 10 }] }
    ]
  }
}
```

`.mcp.json`:

```json
{
  "mcpServers": {
    "codegraph": { "type": "stdio", "command": "codegraph", "args": ["serve", "--mcp"] }
  }
}
```

`CLAUDE.md`:

```markdown
# OpenWolf

This project uses OpenWolf for context management. The always-on rules live in `.claude/rules/openwolf.md`; the hooks handle bookkeeping (anatomy index, memory log, read tracking) automatically.

For the full operating protocol (session handoff, memory discipline, bug logging), load the `openwolf` skill, or read `.wolf/OPENWOLF.md`. Regenerate the session handoff with `/handoff`.

# Proje
- Mimari: `docs/ARCHITECTURE.md` · Kararlar: `docs/DECISIONS.md`
- Çalıştırma: `npm run db:up` → `npm run dev:backend` → `npm run dev:local`
- Test: `npm run test:fast` (backend+web) · `npm run test:e2e:full` (E2E)
```

`AGENTS.md`:

```markdown
# OpenWolf

@.wolf/OPENWOLF.md

This project uses OpenWolf for context management. Read and follow .wolf/OPENWOLF.md every session. Check .wolf/cerebrum.md before generating code. Check .wolf/anatomy.md before reading files.
```

`.claude/rules/openwolf.md`:

```markdown
- To locate a symbol or file, run `openwolf find <name>` first when the installed OpenWolf has it; otherwise grep `.wolf/anatomy.md` for the path. Never read .wolf/anatomy.md whole; it is an index.
- Check .wolf/cerebrum.md Do-Not-Repeat list before generating code (grep "## Do-Not-Repeat"); after a user correction, update cerebrum.md immediately.
- Do NOT manually update .wolf/anatomy.md or .wolf/memory.md; the OpenWolf hooks maintain them.
- BEFORE fixing any bug: grep .wolf/buglog.json for the error. AFTER fixing one: log it there (error_message, root_cause, fix, tags).
- When resuming a session, read .wolf/STATUS.md first; regenerate it with /handoff when a quest finishes.
```

`.cursor/rules/openwolf.mdc`:

```markdown
---
description: OpenWolf project protocol (context management via .wolf/)
alwaysApply: true
---

# OpenWolf

This project uses OpenWolf for context management. Read and follow .wolf/OPENWOLF.md at session start. Check .wolf/cerebrum.md before generating code. Grep .wolf/anatomy.md for a file's path before reading it (never read the whole index).
```

### 18.4 Hafıza katmanları: hangi bilgi nereye

| Katman | İçerik | Kim yazar |
|---|---|---|
| `.wolf/cerebrum.md` | **Kalıcı kurallar**: `## User Preferences`, `## Key Learnings`, `## Do-Not-Repeat` (tarihli), `## Decision Log` | ajan, kullanıcı düzelttiği anda |
| `.wolf/buglog.json` | hata indeksi: `id`, `error_message`, `file`, `root_cause`, `fix`, `tags`, `occurrences`, `last_seen` | ajan, her düzeltmeden sonra |
| `.wolf/STATUS.md` | devir notu: `## ✅ Done`, `## 🚀 Next quest`, `## Context`; yaklaşık 2 bin token altında | `/handoff` |
| `.wolf/memory.md` | oturum anlatısı (makineye yerel) | hook'lar |
| `.wolf/anatomy.md` | dosya indeksi (makineye yerel) | hook'lar ve `openwolf scan` |
| Claude Code auto-memory | kişisel ve makineye özel notlar | Claude Code |
| `docs/DECISIONS.md` | projenin mimari kararları (insanlar için) | ajan ve ekip |

### 18.5 Büyüme bütçesi (ZORUNLU)

Hafıza dosyaları büyüyünce kendi amacını baltalar. Tropiq'te `cerebrum.md` 16.870 satıra, `buglog.json` 1013 kayda çıktı; "her kod üretiminden önce oku" protokolü yaklaşık 800 bin tokena mal olmaya başladı. Kurallar:
- `cerebrum.md` yalnızca kalıcı kuralları tutar. Tarihli oturum anlatısı `memory.md`'ye gider.
- Bütçe: `cerebrum.md` en fazla ~100 KB. Aşılınca eski girdiler `cerebrum-archive.md`'ye taşınır; silinmez, arşiv grep'lenebilir kalır.
- Dosyalar bütün halinde okunmaz, grep'lenir (`grep -n -A15 "<konu>" .wolf/cerebrum-archive.md`).
- `buglog.json` alan adları değiştirilmez: `pre-write` hook'u `error_message`, `root_cause`, `fix`, `file` ve `tags` alanlarını doğrudan okur.
- `config.json` içindeki `cerebrum.max_tokens: 2000` değeri gerçekçi değildir; asıl sınır yukarıdaki bütçedir.

### 18.6 Taşınabilirlik (ZORUNLU)

- Proje hook'ları **proje** seviyesinde (`.claude/settings.json`) ve `$CLAUDE_PROJECT_DIR` ile yazılır. Kullanıcı seviyesine (`~/.claude/settings.json`) proje script'i yazılmaz; yazılırsa o makinede açılan **her** projede çalışır.
- OpenWolf ve codegraph sürümleri `docs/DECISIONS.md`'de yazılıdır ve tüm makinelerde aynıdır. Kurallar kurulu sürümde olmayan bir komutu (`openwolf find` gibi) isterse sessizce işe yaramaz.
- "Bu hata önceden de var mıydı?" kontrolü `git stash` ile **yapılmaz**. Hook'lar izlenen dosyaları yeniden yazdığı için `stash pop` yarıda kalır. Bunun yerine `git worktree add /tmp/x HEAD` ya da `git show HEAD:<dosya>` kullanılır.

---

## 19. Kurulum rehberi: faz faz

Her faz sırasıyla uygulanır. "Bitti sayılır" komutları yeşil olmadan sonraki faza geçilmez.

### Faz 0: Hazırlık
1. Bu dosyayı `docs/ARCHITECTURE.md` olarak kopyala. `docs/DECISIONS.md`'yi §0.5'teki içerikle oluştur.
2. Araçları kur:
   - Node 24: `nvm install 24 && nvm use 24`,
   - Docker,
   - `pg_dump` ve `psql`: macOS'ta `brew install libpq && brew link --force libpq`,
   - global paketler: `npm i -g pm2 openwolf @colbymchenry/codegraph`.
3. Depoyu başlat: `git init -b main`.

**Bitti sayılır:** `node -v` → `v24.*` · `docker info` hatasız · `pg_dump --version` → 18 veya üstü · `pm2 -v` · `openwolf --version` · `codegraph --version`

### Faz 1: Kök iskelet ve AI katmanı
1. Klasörleri oluştur (§2).
2. Kök dosyaları yaz:
   - `package.json` (§3.1),
   - `.gitignore` (§3.2),
   - `eslint.config.js` ve prettier (§3.3),
   - `.env.example` ve `.env.test.example` (§3.4),
   - `docker-compose.dev.yml` (§3.5).
3. Bağımlılıkları kur (§3.1 tablosu). `package-lock.json`'ı commit'le.
4. AI katmanını kur (§18.2–18.3).
5. `README.md`'yi komut listesi ve §14.1 akışıyla yaz.
6. İlk commit'i at.

**Bitti sayılır:** `npm ls --depth=0` hatasız · `npm run lint` exit 0 · `docker compose -f docker-compose.dev.yml config -q` hatasız · `ls .wolf/hooks` dolu · `.claude/settings.json` içinde `grep -c "/Users/"` → 0

### Faz 2: `packages/`
1. §6.1 ve §6.3'e göre kopyala ya da yaz.
2. `app-shared/index.js`'i yeniden yaz.
3. `permissions.js` kataloğunu ve `SCHEMA_DEFAULT_PERMISSIONS`'ı yaz: `enums`, `reference`, `identity`, `audit` ve planlanan domain şemaları.
4. Kafka yoksa kafka connector'ını çıkar.
5. Tropiq temizliği yap (§0.4).

**Bitti sayılır:** `npm run test:packages` yeşil · `grep -rniE "tropiq" packages` boş · `node --input-type=module -e "import('app-shared').then(m=>console.log(Object.keys(m).length))"` hatasız

### Faz 3: Veritabanı ve script'ler
1. `db-schemas/` dosyalarını yaz:
   - `00-enums-schema.sql`: roller, izinler, org tipleri, durum sözlükleri,
   - `01-identity-schema.sql`: `global_code_seq`, `tenant`, `organization`, `user_account`,
   - `09-reference-schema.sql`,
   - `10-seed-data.sql`: tek tenant + sistem organizasyonu,
   - `A00`, `A98`, `A99`.
2. `scripts/` dosyalarını referanstan kopyala ve yeniden adlandır: `build-schema.js`, `apply-migrations.mjs`, `build-role-permission-seed.js`, `validate-auth-config.js` (kontrol listesindeki servis adlarını projeye uyarla), `sync-role-permissions.mjs`, `env-to-json.mjs`.
3. Şu komutları çalıştır: `npm run build-role-permission-seed` → `npm run build-schema` → `npm run db:up` → `node scripts/apply-migrations.mjs --baseline --yes`.

**Bitti sayılır:** `docker compose -f docker-compose.dev.yml exec dev-pg psql -U <proje>_dev -d <proje_db> -c '\dn'` şemaları listeler · `npm run migrate:status` hatasız · `npm run validate-auth-config` exit 0

### Faz 4: Test altyapısı
1. `jest.config.js` dosyasını yaz (§15.2).
2. `test/config/` klasörünü kopyala (§15.3). `.env.test`'i örnek dosyadan oluştur.
3. `test/services/repo/table-definitions-drift.test.js` testini yaz (§5.2).

**Bitti sayılır:** `npm run test:backend` yeşil (paket testleri + drift testi) · ikinci koşuda `npm run test:fast` saniyeler içinde biter

### Faz 5: identity servisi
1. `core/service-identity` (§7.2) ve `table-definitions.js`'i yaz.
2. Servis kabuğunu kur (§8.2–8.9).
3. Giriş ve kayıt sözleşmesini (§8.12) uygula: VARSAYILAN yöntem e-posta + şifre. `lookupPermissionsForRole` izinleri `enums.role_permission`'dan okur; `GET /v1/public/ping` ucunu ekle.
4. `.env`'i `.env.example`'dan oluştur. Sırları `openssl rand -hex 32` ile üret.
5. Testleri yaz: üretilen üç test dosyası + login use-case testi + kablolama testi.

**Bitti sayılır:** `pm2 start scripts/ecosystem.config.cjs` → `curl -s http://127.0.0.1:<PORT_BASE+1>/api/online` → `true` · `docker compose -f docker-compose.dev.yml exec dev-redis redis-cli --scan --pattern 'service:*' | head` kayıt listeler · `npm run test:backend -- --testPathPattern=service-identity` yeşil

### Faz 6: Gateway
1. Gateway'i kopyala ve yeniden adlandır (§9.2).
2. JWT anahtarlarını üret (§9.4). `jwt.js`'i env yolundan okuyacak şekilde değiştir.
3. `public-paths.js`'i yaz (§9.7) ve `SESSION_REFRESH_PATHS`'i tanımla.
4. Config guard'larını ve sabit `'tropiq-'` dizgelerini güncelle.

**Bitti sayılır:**
- `npm run dev:backend`
- `curl -s http://127.0.0.1:<PORT_BASE>/health` → `{"status":"ok"}`
- `curl -s http://127.0.0.1:<PORT_BASE>/api/<proje>-service-identity/v1/public/ping` → `success:true`
- login isteğinin yanıtında `Set-Cookie` içinde `<proje>_xsrf` bulunur: `curl -si -X POST .../v1/auth/login -H 'Content-Type: application/json' -d '{...}' | grep -i set-cookie`
- çerezsiz korumalı bir uç 401 döner

### Faz 7: Domain servisleri (her domain için)

İlk servis VARSAYILAN olarak `<proje>-service-app`'tir (port `<PORT_BASE>+2`). `enums` ve `reference` şemalarının sahibidir. Referans verisini (ülke, para birimi, sözlükler) auto-CRUD GET ile sunar; bu uçlar gateway'in public listesine yalnızca GET olarak eklenir. Tropiq'te bu rolü `tropiq-service-app` üstlenir. Proje referans verisi içermiyorsa `app` servisi kurulmaz ve `enums` şemasının sahibi identity olur.

Her domain için:
1. Şema dosyasını, enum tablolarını, migration'ı ve grant migration'ını yaz.
2. `core/service-<domain>` klasörünü ve `table-definitions.js`'i oluştur. Şemayı `SCHEMA_DEFAULT_PERMISSIONS`'a ekle.
3. Servis kabuğunu, izinleri (§8.13) ve use-case'leri yaz.
4. URL'yi `.env`, `.env.example` ve compose dosyasına ekle; DECISIONS'daki servis tablosunu güncelle.
5. Testleri yaz.

**Bitti sayılır:** servisin `/api/online` ucu `true` döner · gateway üzerinden çerezli bir auto-CRUD GET isteği 200 döner · `npm run test:backend` yeşil · `npm run validate-auth-config` exit 0

### Faz 8: Frontend
1. `<proje>-web-app` klasörünü kur (§16): `vite.config.js`, `jsconfig.json`, eslint.
2. Provider ağacını, axios'u, API modüllerini, auth store'u ve AuthBootstrap'ı yaz.
3. Router'ı ve `routeUtils`'i yaz.
4. i18n'i `<diller>` için ve `apiErrors` ile kur.
5. MUI wrapper'larını yaz.
6. `.cursor/rules` klasörünü kopyala.

**Bitti sayılır:** `npm run dev:local` → `http://127.0.0.1:3000` giriş ekranını gösterir; girişten sonra korumalı sayfa açılır · `npm run test:web` yeşil · `npm run build` başarılı · `npm run lint` exit 0

### Faz 9: E2E
1. Şu dosyaları yaz: `Dockerfile.e2e`, `.dockerignore`, `docker-compose.e2e.yml`, `e2e/run.js`, `e2e/playwright.config.js` ve `e2e/helpers/`.
2. İlk spec'i yaz: kayıt ya da giriş → korumalı sayfa → bir domain akışı.

**Bitti sayılır:** `npx playwright install chromium` · `npm run test:e2e:full` → `0 failed` · koşudan sonra `docker compose -p <proje>-e2e ps -a` boş döner

### Faz 10: Dağıtım ve CI
1. Şu dosyaları yaz: `ecosystem.config.cjs`, `scripts/update.sh`, `scripts/start-backend.sh`, `.gitlab-ci.yml`.
2. README'ye sunucu yerleşimini (§14.2) ekle.

**Bitti sayılır:** `node -e "require('./ecosystem.config.cjs')"` ENV_FILE yokken çıkış kodu 1 ve açıklayıcı mesaj verir · CI pipeline'ı yeşil

Sunucuya ilk deploy dış yayın sayılır: `BEKLİYOR` olarak işaretle ve sor.

### Faz 11: Landing (İSTEĞE BAĞLI)
§17'ye göre kur.

**Bitti sayılır:** `cd <proje>-landing-app && npm run build` başarılı · landing testleri `npm run test:web` içinde yeşil

---

## 20. Tek servisli sadeleştirilmiş varyant

Proje tek bir backend servisiyle başlıyorsa:
- `core/` ve `services/` ayrımı **korunur**. Auto-CRUD, OpenAPI üretimi ve üretilen testler servis sayısından bağımsız olarak kazanç sağlar.
- Gateway **korunur** (VARSAYILAN). Auth, oturum ve CSRF tek bir yerde kalır; servislerin başlıklara güvenme modeli de gateway'e dayanır. Kopyalama maliyeti düşüktür.
  - Çok küçük bir projede alternatif: gateway'in auth, CSRF ve oturum middleware'lerini servisin içine al, service-discovery'yi atla, route'ları doğrudan bağla. Bu kararı DECISIONS'a gerekçesiyle yaz.
- `db-schemas/` numaralı dosya düzeni korunur; ileride bölünmek kolaylaşır.
- Test, E2E, deploy ve AI katmanı ölçekten bağımsız olarak aynıdır.

---

## 21. Bilinen tuzaklar

Her madde referans projede en az bir kez yaşanmış bir hatadır. Madde yapısı: **kural**, ardından kısa gerekçe.

**Veritabanı ve migration**
- **`_combined.sql` bayatlayabilir ve git bunu söylemez** (gitignore'dadır). E2E ya da dev reset'ten önce `npm run build-schema` çalıştırılır. E2E kırmızıysa ve hatalar seed ya da profil katmanındaysa önce şema yeniden üretilir ve `down -v` yapılır.
- **Defter yokken `--baseline` tek başına tuzaktır** (§4.8). Doğrulama şemadan yapılır.
- **Idempotency yalnızca `IF NOT EXISTS` değildir.** Verinin anlamı korunur (`NULL` = sınırsız gibi); mümkünse yeniden koşma testi yazılır.
- **Yeni tablo yetkisiz kalabilir.** Her tablo için ayrı bir grant migration'ı yazılır (`permission denied for table`).
- **Kolon adı ve enum değeri tahmin edilmez.** Kaynak; `enums.<ad>` tablosu ya da o tabloya zaten yazan mevcut koddur (`42703`).
- **`COALESCE($n, kolon)` ile yapılan kısmi güncelleme, değeri silme yolunu kapatır.** Silme için ayrı bir uç açılır; silinen değerden sonra "güncel değer" kalanlardan yeniden türetilir.
- **TimescaleDB hypertable'ının sıkıştırılmış chunk'ında DELETE hata verir.** Silme bir zaman penceresiyle sınırlanır; aksi halde hata, çağıran transaction'ın tamamını geri alır.
- **Seed ve purge tekrar çalıştırılabilir olmalıdır.** UNIQUE kısıtlı tablolara yazmadan önce mevcut anahtarlar okunur. Kod aralığıyla yapılan purge'lerde "aralık dışı çocuk" satırları FK grafiğinden (`pg_constraint`) toplanır.
- **macOS `sed` `\b` desteklemez**; yeniden yazma sessizce olmaz. `perl -pe` kullanılır.
- **Commit'lenen çıktı üreten script'lerde çıplak `localeCompare` kullanılmaz**; host locale'i sırayı değiştirir. Sabit karşılaştırma ya da `Intl.Collator('en')` kullanılır.
- **SQL takma adı rakamla başlamaz.** Camel dönüşümünden sonra alan sessizce sıfır ya da `undefined` gelebilir.

**Backend**
- **Env modül düzeyinde bir sabite atanmaz.** Container modül yüklenirken kurulur; `process.env.X || 'http://localhost:1000'` varsayılanı kalıcı olarak donar (referansta yayın akışında 500'e yol açtı). Env çağrı anında okunur.
- **Dondurulmuş container haritasına eklenmeyen use-case sessizce kırılır.** Kablolama testi yazılır.
- **Port kurulumu süreç içidir**; porta dokunan her servis kendi `boot.js`'inde kurulum yapar.
- **İki organizasyon kolonlu tabloda karşı taraf kolonu `excludeFromCallerScope` ile işaretlenir.** İşaretlenmezse süzme yanlış tarafa yapılır ya da açılış patlar.
- **`'none'` bir dizge olduğu için truthy'dir.** Anonim kontrolü `isAnonymousCaller` ile yapılır.
- **`DomainError` kodu üç yere birlikte eklenir**: fırlatma noktası, `CODE_TO_FACTORY` ve i18n `apiErrors`.
- **OpenAPI `enum` değerleri domain kümesiyle birebir aynıdır**; bir parite testiyle kilitlenir.
- **Geri geçişler ileri durum matrisine eklenmez**; ayrı küme, ayrı uç ve ayrı assert kullanılır. Geri alma, ileri geçişin bıraktığı damgaları temizler.
- **`allowed` ve `required` kümeleri tek bir sorgudan türetilmez**; sorgu filtre yerine bayrak döndürür.
- **Açık bir transaction içinden başka servise çağrı yapılmaz.**
- **Cron'a `timezone` verilir.** Gün sınırları `<TZ>`'ye göre hesaplanır ve bu hesap `TZ=UTC` ile `TZ=Asia/Tokyo` altında da test edilir.
- **Ön yüz ile arka yüzün ortak kuralı ayna kopyayla tutulmaz.** Kural `app-shared`'den import edilir; kontrat testi `toBe` ile yazılır.

**Gateway ve kimlik**
- **Süre env'lerine sonek yazılmaz.** `2880m` değeri 2880 saniye olarak okunur. Refresh süresi access süresinden uzun olmalıdır.
- **Rol yükselten uç `SESSION_REFRESH_PATHS` listesinde olmalıdır.** Değilse kullanıcı eski izinlerle kalır ve her korumalı istekte 403 alır.
- **Route registry'nin sırası Redis SCAN'e bağlıdır**; kayıtlar özgüllüğe göre sıralanır.
- **Gateway açılış yarışına karşı**: abonelikten sonra ikinci bir refresh yapılır ve gateway en son başlatılır.
- **JWT izinleri canlı DB'den gelir.** Şema dosyasını doğrulamak yetmez; `sync-role-permissions` canlı DB'ye karşı çalıştırılır.

**Test**
- **Jest 29'da filtre bayrağı `--testPathPattern`'dır (tekil).** Kökte düz `npx jest` jsdom'a takılır; `node --experimental-vm-modules node_modules/.bin/jest --selectProjects backend` kullanılır.
- **Uzak DB'de 5 saniyelik hook zaman aşımı yetmez.** Backend projesinde `testTimeout: 20_000`. Paralel çakışmanın çaresi worker başına ayrı DB'dir.
- **Tek bir suite koştuktan sonra Jest süreçten çıkmaz.** `forceExit` kök config'te tanımlanır. Sızıntıyı görmek için `--detectOpenHandles`.
- **Yerel dile bağlı metinle olumsuz iddia yazılmaz**; metin `i18n.t` ile çözülür.
- **"Önceden var mıydı?" kontrolü `git stash` ile yapılmaz**; `git worktree` kullanılır.

**E2E**
- **`docker compose up --build` aynı imajı paralel build eder** ve 16 GB bellekli bir makinede daemon'u çökertebilir. Önce tek bir `docker build`, sonra `up --no-build`.
- **npm script'indeki satır içi env ataması Playwright'ın `webServer.env` değerini ezer.** Binary doğrudan çağrılır. Hangi değerin geçtiği çalışan süreçten doğrulanır: `ps -eo pid,command | grep vite`.
- **"Ekrandaki N'inci eleman, dizinin N'inci elemanıdır" varsayılmaz.** Input'un gerçek `name` özniteliği okunur.
- **Bir düşüşü kusur saymadan önce turun kendisinin kesilip kesilmediğine bakılır.**
- **Hazır-olma yoklaması yan etkili bir uca yapılmaz** (§12.4).

**Frontend**
- **Kritik kütüphanelerin sürümü yerelde ve üretimde ayrışabilir** (referansta React Hook Form). Tam sürüm sabitlenir ve lockfile commit'lenir.
- **`npm install <paket>`, `package.json`'da kayıtlı olmayan paketleri budar.** Her paket `package.json`'a kaydedilir; kurulum node_modules'a elle yapılmaz.
- **Dağıtım doğrulaması UI metniyle yapılmaz**; i18n anahtar adıyla ve bundle hash'iyle yapılır.
- **API modüllerinde fonksiyon adı çakışırsa son yazan sessizce kazanır.**
- **Anonim 401 login'e yönlendirilmez.**
- **Alias'lar üç yerde aynı tutulur.** Çıplak barrel (`@store`) Jest'te ayrıca eşlenir; `import.meta.glob` kullanan barrel'lar stub'lanır.
- **Media query bir grid şablonunu değiştiriyorsa, bloktaki tüm çocukların satır ve kolon atamaları açıkça yazılır.** Referansta tek bir yanlış `grid-row` hem hamburger menüyü sayfanın dibine itti hem de sayfanın kaymasını engelledi.
- **Kart içindeki haritaya sabit px yükseklik verilmez**; `clamp(360px, 52vh, 620px)` gibi bir ifade kullanılır.

**AI katmanı**
- **Hafıza dosyalarının bir bütçesi vardır** (§18.5).
- **Kurallar kurulu CLI sürümünde olmayan bir komut istemez** (§18.6).
- **Birden fazla proje sunucusu açıkken tasarım denetimi yanlış uygulamayı yakalayabilir.** Doğru URL açıkça verilir.

---

## 22. Tropiq'ten bilerek farklı olanlar

Referans repo bu şablonun kaynağıdır ama kusursuz değildir. Aşağıdakiler bilinçli olarak farklı yapılır:

| Konu | Tropiq'te | Bu şablonda | Neden |
|---|---|---|---|
| `docs/` | gitignore'da; bu doküman bile git'te değil, README linkleri kırık | izlenir | mimari ve karar kayıtları kaybolmasın |
| `package-lock.json` | gitignore'da; deploy `npm install` kullanıyor | commit'lenir; `npm ci` | tekrarlanabilir build (React Hook Form sürüm olayı) |
| JWT anahtarı | gateway klasöründe commit'li `private.pem`, cwd'den okunuyor | repo dışında, `JWT_*_KEY_PATH` | sızan anahtarla her oturum taklit edilebilir |
| Firebase servis hesabı | kökte `private_key` içeren `fcm.json`, commit'li | repo dışında, yolu env'de | aynı gerekçe |
| `.claude/settings.json` | başka makinelerin mutlak yolları, bu makinede olmayan 7 hook script'i, `bypassPermissions` + kişisel izin listesi | `$CLAUDE_PROJECT_DIR`, yalnızca var olan hook'lar; izinler `settings.local.json`'da | taşınabilirlik ve güvenlik |
| Kullanıcı seviyesi hook'lar | `~/.claude/settings.json` tropiq script'lerine sabitlenmiş, hatalar `\|\| true` ile yutuluyor | yalnızca proje seviyesi | aksi halde her projede tropiq hook'u çalışır |
| Servis başına `ecosystem.config.js`, `deploy.sh`, `commit-and-tag*.js` | var ve ölü; ESM'de `module is not defined` | yok | tek kök manifest (§14) |
| Yerel Postgres ve Redis | elle `docker run` | `docker-compose.dev.yml` | tekrarlanabilir kurulum |
| E2E hazır olma | `/auth/otp/send` POST'uyla yoklama (SMS riski) | public, yan etkisiz ping | yan etki olmasın |
| E2E JWT | gateway'deki commit'li anahtar | koşu başına üretilen anahtar, volume ile bağlanır | anahtar repoya girmesin |
| Kullanılmayan bağımlılıklar | `kafkajs`, `mqtt`, `redisgraph.js`, `pg-promise`, `xss-filters` | eklenmez | ölü ağırlık |
| Kafka connector'ı | datasource tarafından statik import ediliyor, hiçbir serviste tanımlı değil | yalnızca gerekirse | gereksiz native bağımlılık |
| `app-shared` | genel altyapı ve domain kuralları kökte karışık | domain kuralları `shared/domain/` altında | neyin kopyalanacağı belli olsun |
| SQL ↔ `table-definitions` | kontrol yok | drift testi (§5.2) | `42703` / `_NOT_FOUND` hata sınıfı |
| CI | repoda yok | `.gitlab-ci.yml` (§14.6) | — |
| Makineye özel yollar | e2e README, settings ve `.agents/AGENTS.md`'de mutlak yollar | göreli yollar | taşınabilirlik |
| Kök düzeni | `.gitignore copy`, kökte büyük `.md` dosyaları (docs gitignore'da olduğu için) | belgeler `docs/` altında | düzen |
| Servis `DomainError`'u | core iskeleti `(message, context)`; servisler `(code, message, details)` | servislerde yalnızca kodlu imza | hata çevirisi koda dayanır |
| JSON gövde limiti | `100000kb` | `10mb` | gereksiz büyük limit |
| OpenAPI `apiResponse` | servis tanımlarında `$ref` var, şeması tanımsız | şema tanımlı (§8.9) | sarkan referans |
| OpenWolf sürümü | makineler arasında farklı; kurallar `openwolf find` istiyor, 1.0.4'te yok | sürüm DECISIONS'da, herkes aynı sürümde | kurallar sessizce işlemez hale gelir |

---

## 23. Bu dokümanı güncel tutma

- Başlıktaki "Son doğrulama" tarihi ve commit, doküman kodla her karşılaştırıldığında güncellenir. Bu doküman 1.0'dan 2.0'a kadar üç ay kodla karşılaştırılmadan yaşadı ve bu sürede en kritik bölümü yanlış kaldı.
- **Doğrulama listesi** (referans repoda çalıştırılır; her satırın beklenen sonucu yanındadır):

| Komut | Beklenen |
|---|---|
| `diff -r -x table-definitions.js -x package.json core/service-<a> core/service-<b>` | fark yok: core şablonları aynı |
| `git log --since=<son-doğrulama> --name-only --format= -- core \| sort -u` | yalnızca `table-definitions.js` dosyaları |
| `find core/service-<a>/src -name '*.js' \| wc -l` ve `find services/<proje>-service-<a>/src -name '*.js' \| wc -l` | core'da ~9, services'ta çok daha fazla |
| `grep -n "ENV_FILE" ecosystem.config.cjs` | fail-fast satırları mevcut |
| `grep -n "schema_migrations" scripts/apply-migrations.mjs` ve `grep -n "naturalCompare" scripts/apply-migrations.mjs` | defter ve doğal sıralama mevcut |
| `docker compose -f docker-compose.e2e.yml config --services` | `e2e-db`, `e2e-redis`, her servis ve `gateway` |
| `ls .wolf/hooks` ile `.claude/settings.json` içindeki script adları | birebir aynı |
| `git check-ignore docs/ARCHITECTURE.md` (yeni projede) | boş: dosya izleniyor |

- **Sürüm geçmişi**

| Sürüm | Tarih | Değişiklik |
|---|---|---|
| 1.0 | 2026-07-05 | İlk sürüm |
| 2.0 | 2026-09-27 | Koddan yeniden yazıldı. core ve services rolleri düzeltildi (core = üretilen CRUD). Şema üretimi, servis kabuğu ve test düzeni düzeltildi. Eklenenler: migration defteri, deploy akışı, port/adaptör, cron ve kapanış, gateway oturum modeli, servisler arası çağrı, config ve sırlar, CI, AI katmanının güncel hali, faz faz kurulum, bilinen tuzaklar ve Tropiq'ten sapmalar. |
