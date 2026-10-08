# Servis geliştirme kılavuzu (sinav)

Bağlayıcı kaynaklar: `docs/PLAN-P0.md` (şema §2, uç → tablo eşlemesi §4, Redis §3), `docs/ARCHITECTURE.md` (şablon). Referans uygulama: `services/sinav-service-identity` (burada okunacak örnek). **Test dosyası yazılmaz**; doğrulama çalıştırarak yapılır (aşağıda).

## 1. Yapı (servis başına)
```
services/sinav-service-<d>/
  src/container.js            composition root: make<X>(deps) fabrikaları, dondurulmuş useCases haritası, wrapWithHttpTranslation
  src/application/*.js        use-case grupları: export const makeX = ({ rawQuery, nowFn, ... }) => Object.freeze({ fn1, fn2 })
  src/shared/*.js             yardımcılar
  src/jobs.js                 cron işleri [{ name, schedule, lockSeconds, run(container) }]  (boot.js withCronLock ile çalıştırır)
  src/interfaces/http/endpoints.js   defineEndpoints([...]) — TEK liste: OpenAPI + route haritası (x-functionName otomatik)
```
`definitions/` ve `routes/` iskelet dosyaları endpoints.js'i okur; elle dokunma. Core (`core/service-<d>`) üretilir: `npm run gen-table-definitions` (DB şeması değişirse).

Uç tanımı: `{ method:'get'|'post'|'put'|'patch'|'delete', path:'/v1/...{param}', handler:(req, caller, res)=>result, permission:P.x | '*', isPublic?, internal?, body?:true, status? }`. `permission` (app-shared `PERMISSIONS`, `packages/modules/shared/permissions.js`) zorunludur; public/internal hariç. Yeni izin → `permissions.js` + `ROLE_PERMISSIONS` → `npm run build-role-permission-seed` → `npm run build-schema` → `npm run sync-role-permissions -- --apply` (çalışan DB). Handler dönüşü `{success:true,data}` zarfına sarılır; SSE/dosya için `res`'e kendin yaz.

`caller` (gateway başlıklarından): `callerUserId` (= `identity.user_account.user_account_id`, **iç id**), `callerOrganizationId` (iç id), `callerTenantCode`, `callerUserRole`, `callerPermissionList`, `callerIp`. Dışa açılan kimlikler **`_code`** kolonlarıdır (URL/yanıtlarda `code`); iç `_id` yanıtlara sızmaz.

## 2. SQL kuralları
- Kolon adı = `<tablo>_<kolon>` (`question_stem`, `attempt_time_ms`). İş anahtarı (eski plandaki `code`) **`<tablo>_key`** olarak adlandı: `exam_key`, `skill_key`, `question_type_key`, `product_key`. Kolon listesi için: `bash /private/tmp/claude-501/-Users-emrullah-developer-fullStack-sinav/3426c8f1-1d6a-4d94-b4a0-e9908dc07a09/scratchpad/cols.sh schema.table ...` (tablo öneki kırpılarak yazar) veya `core/service-<d>/.../table-definitions.js`.
- Ham SQL `rawQuery(sql, params)` (app-shared) ya da `withTransaction(async (tx)=> tx.query(sql, params))`. Satırlar `{rows}`; camelCase için `AS "camelAlias"` yaz (otomatik dönüşüm yok). Parametre tipi çıkarımı çatışırsa (`$5` hem kolona hem karşılaştırmaya girerse) `$5::varchar` yaz.
- Durum geçişi kapısı `WHERE`'dedir (koşullu UPDATE). Zaman `nowFn()` ile; kullanıcının günü `study-day.js` (`localDate(date, tz)`), `user_account.user_account_timezone`.
- Öğrenci verisi her zaman `user_account_id = caller.callerUserId` (ve org) ile süzülür. Şemalar arası **okuma** serbest, **yazma** yalnız sahip servis (PLAN §1.3). Başka servise yazma gerekirse `fetchInternal` (`app-shared`) ile `internal: true` uca; açık transaction içinden çağrı yapma.
- Tenant: tek (`slug='sinav'`); kolon `*_tenant_code`. Platform organizasyonu: `organization_type='platform'` (içerik sahibi org).
- Şemaya kolon/tablo eklemen gerekirse: base `db-schemas/0X-*.sql`'e işle **ve** yeni migration (`db-schemas/migrations/YYYY-MM-DD-N-ad.sql`, BEGIN/COMMIT, önce salt okunur kontrol notu) + `npm run gen-table-definitions`; `node scripts/apply-migrations.mjs <dosya>` ile çalışan DB'ye uygula. Mevcut kolon tipini değiştirme.

## 3. Hata ve i18n
- `throw new DomainError('AREA_THING_REASON', 'insan okur mesaj', details?, status?)` (`app-shared`). Durum kodu sonekten türer (`_NOT_FOUND` 404, `_FORBIDDEN` 403, `_QUOTA_EXCEEDED`/`QUOTA_EXCEEDED` 402, `_CONFLICT`/`_ALREADY_*`/`_NOT_EDITABLE`… 409, `_RATE_LIMITED` 429, `_UNAVAILABLE`/`_NOT_CONFIGURED` 503, diğer 400) ya da 4. parametreyle ver.
- **Her yeni hata kodu için** `packages/i18n/keys/apiErrors<Servis>Keys.js` dosyasına `'apiErrors.KOD': { tr, en }` ekle (ses: sakin, suçlamayan, "sen" hitabı, ünlem/emoji yok; tasarım dokümanı §9). Sonra `node packages/i18n/build-index.mjs`. Enum değerleri için istemci etiketleri `enums.<enumAdı>.<değer>` anahtarlarıyla `packages/i18n/keys/enums<Servis>Keys.js` dosyasına eklenir (yalnız o servisin istemciye gösterdiği değerler).
- Ürün metinleri (ekranda görünen sabit metinler) servis tarafında üretilmez; API **veri** döner, istemci i18n ile çevirir. İstisna: içerik (soru, not, açıklama), e-posta şablonları ve bildirim metinleri.

## 4. İstemci SDK ve API belgesi (ZORUNLU çıktılar)
- `packages/client-sdk/src/<servis>.js`: `export const create<Servis>Api = (http, { api='/api' } = {}) => ({ <servis><Eylem>: (…) => http.get(...) })`. **Fonksiyon adları servis önekli ve tüm paketlerde benzersiz** (`learningTodayGet`, `contentExamsList`). Örnek: `packages/client-sdk/src/identity.js`. Sonra `node packages/client-sdk/build-index.mjs`.
- `docs/api/<servis>.md`: her uç için **yöntem + yol, izin, istek gövdesi/sorgu alanları (tip), yanıt `data` şekli (örnek JSON), hata kodları**. Web ve mobil ekran ajanları yalnız bu belgeye ve SDK'ya bakarak çalışacak; belirsizlik bırakma. Çıktı şekli kararlı kalmalı; değiştirirsen belgeyi ve SDK'yı güncelle.
- React Query anahtarları gerekiyorsa `packages/client-sdk/src/queryKeys.js` içine kendi alanını ekle (başkasınınkini bozma).

## 5. Çalıştırma ve doğrulama
- Altyapı çalışıyor: Postgres `127.0.0.1:5434` (kullanıcı `sinav_dev`/`dev_pass`, DB `sinav`), Redis `6380` (db0 oturum/keşif, db1 uygulama), Mailpit API `http://127.0.0.1:8025`. Servisler PM2'de: `pm2 restart sinav-service-<d>` (yalnız **kendi** servisini; gateway'i yeniden başlatman gerekirse `pm2 restart sinav-web-gateway` — rota kaydı değiştiyse servisten ~8 sn sonra), log: `pm2 logs sinav-service-<d> --lines 40 --nostream`, hata: `--err`. Gateway `http://127.0.0.1:2000`.
- Betikle doğrulama: `scripts/dev/client.mjs` (`newGuest`, `newLearner`, `loginStaff`, `call(token, method, 'sinav-service-x/v1/...', body)`) — repo'ya test olarak EKLEME; geçici betiklerini scratchpad klasöründe tut (`/private/tmp/claude-501/-Users-emrullah-developer-fullStack-sinav/3426c8f1-1d6a-4d94-b4a0-e9908dc07a09/scratchpad/`). Her uç için en az bir başarılı ve bir hatalı çağrı dene; yanıtı belgeyle karşılaştır.
- Servis kodu değişince `node --check` + PM2 restart + log kontrolü. `npm run lint` kök için çalışır.
- Git: **commit atma** (ben atarım). Başka servislerin dosyalarını düzenleme; ortak dosyalarda (`permissions.js`, `app-shared`, i18n/SDK index'leri) yalnız ekleme yap.

## 6. Ortak modüller (`app-shared`, hazır)
`rawQuery`, `withTransaction`, `DomainError`, `defineEndpoints`, `wrapWithHttpTranslation`, `PERMISSIONS`, `getEntitlements(userId)` / `invalidateEntitlements`, `consumeQuota({userId, feature, n, tz})` / `refundQuota` / `peekUsage` / `registerUsageSeed(feature, fn)` (Redis 19; özellikler: `questions_per_day`, `tutor_messages_per_day`, `flashcard_reviews_per_day`, `translation_evals_per_day`, `mini_exams_per_month`, `full_exams_per_month`, `detailed_analysis`, `score_estimate`), `writeAudit`, `storagePut/Get`, `scoreFromCounts/requiredCorrect/maxScore` + `localDate/addDays/isoWeekday/daysBetween` (saf domain: `packages/modules/shared/domain/`), `fetchInternal/internalHeaders/INTERNAL_TIMEOUTS`, `makeWithCronLock`, `datasources.coreAppRedis.client` (ioredis). Servislerarası: identity `POST /v1/internal/notifications` {userAccountId, kind, title, body, deepLink, payload, dedupeKey, scheduledFor, channels} (kind değerleri `enums.notification_kind`).

## 7. Taksonomi anahtarları (seed ile kod aynı sözlüğü kullanır)
Soru tipleri (`question_type_key`): `vocabulary`, `grammar`, `cloze`, `sentence_completion`, `translation`, `reading`, `dialogue`, `restatement`, `paragraph_completion`, `irrelevant_sentence` (YDS dağılımı 6/10/10/10/6/20/5/4/4/5). Sınav/iz anahtarları: sınav `yds`, `yokdil`; iz `yds-en`, `eyds-en`, `yokdil-health`, `yokdil-science`, `yokdil-social`. Beceri (`skill_key`, `path`=anahtar): `grammar.tenses`, `grammar.conjunctions.contrast|cause|condition|time`, `grammar.prepositions`, `grammar.relative-clauses`, `grammar.passive`, `grammar.modals`, `grammar.conditionals`, `grammar.noun-clauses`, `grammar.participles`, `grammar.quantifiers`, `grammar.comparison`, `grammar.inversion`, `vocab.academic`, `vocab.phrasal-verbs`, `vocab.collocations`, `vocab.synonyms`, `vocab.connectors`, `reading.main-idea|inference|detail|vocabulary-in-context|author-attitude`, `translation.en-tr`, `translation.structure`, `translation.tense`, `discourse.dialogue|cohesion|paragraph-completion|irrelevant-sentence`; üst düğümler `grammar`, `vocab`, `reading`, `translation`, `discourse`. Ürünler: `free`, `premium-monthly`, `exam-period`, `premium-annual`, `founder-annual`; fiyat anahtarları `free`, `premium-monthly`, `exam-period`, `premium-annual`, `founder-annual`.
