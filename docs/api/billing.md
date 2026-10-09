# billing API (sinav-service-billing, port 2004)

Tüm yollar gateway üzerinden: `{GATEWAY}/api/sinav-service-billing/v1/...`. Yanıt zarfı `{ success:true, data }` / `{ success:false, error:{ code, message, details } }`. SDK: `packages/client-sdk/src/billing.js` (`createBillingApi`). Hata kodları için istemci etiketleri `apiErrors.<KOD>` (`packages/i18n/keys/apiErrorsBillingKeys.js`); enum etiketleri `enums.<enum>.<değer>` (`enumsBillingKeys.js`).

Genel kurallar
- Para birimi `TRY`; tutarlar **KDV dahil**, JSON'da sayı (`1490`, `314.1`). `taxAmount` KDV payıdır (`BILLING_VAT_RATE`, varsayılan %20).
- Dışa açılan kimlikler `code` (string). İç `_id` sızmaz.
- Public uçlar (oturumsuz): `/v1/public/*` (`GET`/`POST`). Diğerleri bearer/çerez oturumu ister; izinler `billing:read`, `billing:purchase`, `billing:manage` (öğrenci rolünde üçü de var; misafirde yok).
- Erişim kararı `entitlement_grant` (Redis `ent:{userId}`, 10 dk) ile verilir; kota sayaçları learning/tutor servislerindedir (`GET /usage` billing'de YOKTUR).
- Ödeme sağlayıcısı: `PAYMENT_PROVIDER=fake` (geliştirme). **`NODE_ENV=production` + `fake` ile servis açılmaz** (süreç `exit(1)`). iyzico adaptörü yazılmadı: `not_configured` taslağı (`src/ports/payment-iyzico.js`), çağrılar `503 PAYMENT_PROVIDER_NOT_CONFIGURED`.

---
## 1. Katalog (public)

### GET /v1/public/products — MKT-02, PAY-01, PAY-03
İzin: yok (public). Satışta (`status=active`, `is_public`) ürünler, geçerli fiyatları, özellikleri ve kampanya bilgisi.
```json
{ "products": [
  { "productKey": "exam-period", "name": "Sınav dönemi", "description": "…", "kind": "fixed_term_pass", "tier": "premium",
    "badgeKey": "recommended", "recommended": true, "trialDays": 0, "sortOrder": 3,
    "prices": [ { "priceKey": "exam-period", "amount": 1490, "currency": "TRY", "interval": "none", "intervalCount": 1,
      "periodEndRule": "next_exam_session", "maxInstallments": 6,
      "monthlyEquivalent": 298, "periodMonths": 5, "periodEndsAt": "2027-04-04T21:00:00.000Z", "campaign": null } ],
    "features": [ { "feature": "tutor_messages_per_day", "enabled": true, "limit": 40, "period": "day" } ] } ],
  "nextExam": { "sessionKey": "2026-YDS/2", "examDate": "2026-11-22", "months": 2 },
  "generatedAt": "2026-10-08T17:00:00.000Z" }
```
- `tier`: `free` | `premium` (anahtar `free` mi). `badgeKey`: `recommended` | `founder` | null. `recommended` = badge `recommended`.
- `features[].limit`: `null` = sınırsız; `period`: `day`|`month`|null. Özellik anahtarları: `questions_per_day, tutor_messages_per_day, flashcard_reviews_per_day, translation_evals_per_day, mini_exams_per_month, full_exams_per_month, detailed_analysis, score_estimate` (boolean özellikler `limit:null`).
- `monthlyEquivalent` sunucuda hesaplanır: `next_exam_session` fiyatı → `round(amount / months)`; `months` = bir sonraki **gelecek** sınav oturumuna (`content.exam_session`, iptal olmayan) kalan süre (gün/30,4375, en az 1); oturum yoksa **5**. `interval=year` → `round(amount/(12·intervalCount))` (2490 → 208); `interval=month` → `amount/intervalCount`. `periodMonths` aynı ayı, `periodEndsAt` sınav dönemi bitişini (sınav günü +1 gün 00:00 Europe/Istanbul) verir.
- `campaign` (kampanyalı fiyat): `{ campaignKey, name, kind, status, capacity, sold, remaining, soldOut, launchDate, startsAt, endsAt }`. Yalnız açık (tarih aralığında, `active`) kampanya fiyatları listelenir. Teklif-özel fiyatlar (`price.metadata.offerOnly`) listelenmez.

### GET /v1/public/campaigns/{key} — PAY-10, MKT-08
Kurucu üyelik ön satışı. `key` = `campaign_key` (ör. `founder-presale`). `sold`: Redis `billing:campaign:{key}:sold` (yoksa Postgres'te başarılı ödeme sayısı; `*/30` dk reconcile).
```json
{ "campaignKey": "founder-presale", "name": "Kurucu üyelik ön satışı", "kind": "founder_presale", "status": "active",
  "capacity": 1000, "sold": 312, "remaining": 688, "soldOut": false, "launchDate": "2027-01-31",
  "startsAt": "…Z", "endsAt": "…Z", "termsMd": "…markdown…", "open": true,
  "prices": [ { "productKey": "founder-annual", "productName": "Kurucu üyelik (yıllık)", "priceKey": "founder-annual", "amount": 1790, "currency": "TRY",
    "interval": "year", "intervalCount": 1, "periodEndRule": "interval", "maxInstallments": 6, "monthlyEquivalent": 149, "periodMonths": 12, "periodEndsAt": null, "campaign": null } ] }
```
Hata: `404 CAMPAIGN_NOT_FOUND`. `open` = tarih aralığı içinde ve kontenjan dolmamış. Satın alma `POST /checkout` (priceKey=`founder-annual`).

### GET /v1/entitlements — PAY-01, PAY-06, HOME bandı
İzin: `billing:read`. Hak + tüm özellikler için kullanım (`used/remaining`, Redis 19'dan **salt okunur**).
```json
{ "tier": "premium", "planName": "Premium aylık", "productKey": "premium-monthly", "source": "trial", "validUntil": "2026-10-15T17:06:12.194Z",
  "subscriptionStatus": "trialing", "cancelAtPeriodEnd": false, "periodEnd": "…Z",
  "trial": { "active": true, "endsAt": "…Z", "daysLeft": 7, "eligible": false, "trialDays": 7, "productKey": "premium-monthly" },
  "features": { "questions_per_day": { "feature": "questions_per_day", "enabled": true, "limit": 15, "period": "day", "used": 3, "remaining": 12, "periodKey": "2026-10-08" } } }
```
- `tier`: `free`|`premium`. `source`: `subscription|trial|promo_code|manual|null`. `trial.eligible`: deneme hakkı var (hiç denememiş, canlı aboneliği yok, ücretsiz). `limit:null` → sınırsız (`remaining:null`). Kullanım sayacı yoksa 0 sayılır.
- Not: `app-shared peekUsage` eksik anahtarı kurup learning/tutor'un Postgres tohumlamasını bozabileceğinden billing aynı Redis anahtarını (`usage:{userId}:{feature}:{periodKey}`) yalnız `GET` ile okur.

---
## 2. Ödeme

### GET /v1/billing-profile — PAY-04, ME-08
İzin: `billing:read`.
```json
{ "profile": { "partyType": "individual", "fullName": "…", "companyTitle": null, "taxOffice": null, "taxNumber": null, "nationalIdMasked": "*******0146", "hasNationalId": true,
    "email": null, "addressLine": "…", "district": "…", "city": "…", "postalCode": null, "country": "TR" },
  "prefill": { "fullName": "Hesap adı", "email": "hesap@…" } }
```
`profile` yoksa `null`.

### PUT /v1/billing-profile
İzin: `billing:manage`. Gövde: `{ partyType: 'individual'|'corporate', fullName*, addressLine*, city*, district?, postalCode?, country? (2 harf, TR), email?, nationalId? (11 hane; yoksa mevcut korunur, null/'' ile silinir), companyTitle/taxOffice/taxNumber (corporate'ta zorunlu; taxNumber 10-11 hane) }`. Yanıt `{ profile }` (GET ile aynı). Hata: `400 BILLING_PROFILE_INVALID` (`details.field`).

### POST /v1/coupons/validate — PAY-04
İzin: `billing:purchase`. Gövde `{ couponCode, priceKey }`. Geçersiz kupon **200 + valid:false** döner (satır içi hata için).
```json
{ "valid": true, "couponCode": "WELCOME10", "discountType": "percent", "discountValue": 10, "discountAmount": 34.9, "subtotal": 349, "total": 314.1, "taxAmount": 52.35, "currency": "TRY" }
{ "valid": false, "reason": "not_found", "reasonKey": "billing.coupon.not_found" }
```
`reason`: `not_found|inactive|not_started|expired|not_applicable|currency_mismatch|limit_reached|already_used` (i18n `billing.coupon.<reason>`). Hata: `404 PRICE_NOT_FOUND`.

### GET /v1/installments?priceKey=&bin=&couponCode= — PAY-04
İzin: `billing:purchase`. `bin` = kartın ilk 6+ hanesi (daha azsa yalnız tek çekim). `priceCode` takma adı da kabul edilir. **Sahte kurallar**: amex tek çekim; diğer markalarda `[1,2,3,6,9,12]` içinden `price.maxInstallments`'a kadar; faiz yok.
```json
{ "priceKey": "premium-annual", "bin": "411111", "brand": "visa", "bank": "Sahte Banka", "currency": "TRY", "total": 2490,
  "options": [ { "count": 1, "perInstallment": 2490, "total": 2490, "interestRate": 0 }, { "count": 3, "perInstallment": 830, "total": 2490, "interestRate": 0 } ] }
```

### POST /v1/checkout — PAY-04, PAY-10, deneme başlatma
İzin: `billing:purchase`. Başlık `Idempotency-Key: <uuid>` (ya da gövdede `idempotencyKey`); aynı anahtarla tekrar çağrı mevcut ödemenin durumunu `replayed:true` ile döner. Redis kilidi `billing:checkout:lock:{userId}` (2 dk): eşzamanlı ikinci ödeme `409 BILLING_CHECKOUT_IN_PROGRESS` (`details:{paymentCode, actionUrl}` — kullanıcı o ödemeye devam edebilir). Kilit ödeme sonuçlanınca (başarı/hata/iptal) açılır.

Gövde:
```json
{ "priceKey": "exam-period", "couponCode": "WELCOME10", "installmentCount": 3,
  "billingProfile": { "partyType": "individual", "fullName": "…", "addressLine": "…", "city": "…" },
  "acceptPreInfo": true, "acceptDistanceSales": true, "saveCard": true,
  "card": { "number": "4242424242424242", "holder": "A B", "expMonth": 12, "expYear": 2030, "cvc": "123" },
  "startTrial": false }
```
- `billingProfile` verilirse kaydedilir; verilmezse kayıtlı profil kullanılır (yoksa `400 BILLING_PROFILE_REQUIRED`).
- `acceptPreInfo` ve `acceptDistanceSales` **true** olmak zorunda (`400 BILLING_CONSENT_REQUIRED`); ödemeye o anki geçerli `pre_information` / `distance_sales` belgeleri bağlanır (yoksa `503 BILLING_LEGAL_NOT_CONFIGURED`).
- `saveCard`: verilmezse abonelik ürünlerinde `true`, tek seferlik pakette `false`. Kart yalnız başarılı ödemeden sonra saklanır (yalnız marka/son4/SKT/token; numara ve CVC asla saklanmaz).
- `card` (**yalnız sahte sağlayıcı**): verilmezse test kartı kullanılır. Sahte kart kuralları: sonu `0002` → `insufficient_funds`, `0003` → `card_blocked_online`, `0004` → ilk ödeme geçer ama yenileme `insufficient_funds`; 3DS sayfasında Reddet → `3ds_failed`. Gerçek sağlayıcıda kart bilgisi sağlayıcının kendi alanından gelir.
- `installmentCount`: 1..`price.maxInstallments` (`400 BILLING_INSTALLMENT_INVALID`).
- Mevcut canlı abonelik varken satın alma: yalnız **deneme (trialing)** ya da **iptal edilmiş (cancel_at_period_end)** aboneliğin üstüne izinli (abonelik yerinde güncellenir, kalan süre devredilmez); aksi halde `409 BILLING_SUBSCRIPTION_ALREADY_ACTIVE`.
- Kampanyalı fiyat: kampanya açık değilse `409 CAMPAIGN_CLOSED`, kontenjan doluysa `409 CAMPAIGN_SOLD_OUT`. Abonelik `locked_amount` = kampanya fiyatı (yenilemede korunur).

**Ücretli yanıt (3D Secure):**
```json
{ "paymentCode": "5892", "status": "requires_action", "actionUrl": "http://127.0.0.1:2000/api/sinav-service-billing/v1/public/fake-3ds/5892?t=…", "amount": 1341, "currency": "TRY" }
```
İstemci kullanıcıyı `actionUrl`'e yönlendirir (web: tam sayfa; mobil: uygulama içi tarayıcı). Sonuç sayfası `PUBLIC_APP_BASE_URL/odeme/sonuc?payment={paymentCode}`; orada `GET /payments/{code}`. Toplam 0 olan ödeme (%100 kupon) 3DS'siz anında `status:'succeeded'` döner.

**Deneme yanıtı** (`startTrial:true`; ürünün `trialDays>0` ve kullanıcının daha önce hiç denemesi olmaması gerekir; ödeme alınmaz; `card` verilirse yalnızca kaydedilir ve deneme sonunda ondan tahsil edilir, verilmezse deneme bitince abonelik `expired` olur):
```json
{ "paymentCode": null, "status": "trialing", "actionUrl": null, "subscriptionCode": "5826", "trialEndsAt": "2026-10-15T17:06:12.194Z", "hasPaymentMethod": false }
```
Hatalar: `400 BILLING_PRICE_REQUIRED|BILLING_CONSENT_REQUIRED|BILLING_PROFILE_REQUIRED|BILLING_PROFILE_INVALID|BILLING_COUPON_INVALID(details.reason)|BILLING_INSTALLMENT_INVALID|BILLING_CARD_INVALID|BILLING_TRIAL_NOT_AVAILABLE`, `404 PRICE_NOT_FOUND`, `409 BILLING_CHECKOUT_IN_PROGRESS|BILLING_SUBSCRIPTION_ALREADY_ACTIVE|BILLING_TRIAL_ALREADY_USED|CAMPAIGN_CLOSED|CAMPAIGN_SOLD_OUT`, `503 BILLING_LEGAL_NOT_CONFIGURED|PAYMENT_PROVIDER_NOT_CONFIGURED`.

### GET /v1/public/fake-3ds/{code}?t=…[&json=1] — sahte 3D Secure sayfası (yalnız `PAYMENT_PROVIDER=fake`)
Public, `text/html`. İki düğme (Onayla / Reddet) HMAC imzalı form olarak `POST /v1/public/payments/{code}/callback`'e gider. `t` sayfa bağlantı imzasıdır (`403 BILLING_CALLBACK_SIGNATURE_INVALID`). Ödeme artık beklemede değilse sonuç sayfasına 303 yönlendirir. Sağlayıcı fake değilse `404`.

### POST /v1/public/payments/{code}/callback[?json=1] — sağlayıcı dönüşü
Public. Gövde (form-urlencoded ya da JSON): `{ decision: 'approve'|'reject', sig }`; `sig = HMAC-SHA256(PAYMENT_FAKE_SECRET, "{code}:{decision}")` hex. Geçersiz imza `403 BILLING_CALLBACK_SIGNATURE_INVALID`. İdempotent: `billing.provider_event (provider, "{code}:{decision}")`; tekrar çağrı durumu değiştirmez.
- Varsayılan: `303 Location: {PUBLIC_APP_BASE_URL}/odeme/sonuc?payment={code}`.
- `?json=1`: `200 { success:true, data: <GET /payments/{code} gövdesi> }`.
Başarıda: ödeme `succeeded`; abonelik (`active`; dönem: `interval` kuralı → aylık/yıllık; `next_exam_session` → sınav günü +1 gün; deneme üstüne alım yerinde dönüştürülür), `entitlement_grant`, `invoice` (`pending_issue`), kayıtlı kart, kupon kullanımı, Redis 20/21, identity bildirimi `payment_receipt` ({planName, amount, validUntil}) ve denetim kaydı. Başarısızlıkta `failed` + `failureCode`/`failureReasonKey`, `payment_failed` uygulama içi bildirimi.

### GET /v1/payments/{code} — PAY-06, PAY-07
İzin: `billing:read`; yalnız kendi ödemesi (`404 PAYMENT_NOT_FOUND`).
```json
{ "paymentCode": "5892", "status": "succeeded", "amount": 1341, "discountAmount": 149, "taxAmount": 223.5, "currency": "TRY", "installmentCount": 2,
  "planName": "Sınav dönemi", "productKey": "exam-period", "priceKey": "exam-period", "actionUrl": null,
  "failureCode": null, "failureReasonKey": null, "paidAt": "…Z", "createdAt": "…Z", "card": { "brand": "visa", "last4": "4242" },
  "invoice": { "code": "5897", "status": "pending_issue" }, "subscription": { "code": "5878", "status": "active", "validUntil": "…Z", "trialEndsAt": null } }
```
`status`: `pending|requires_action|succeeded|failed|refunded|canceled`. `failureReasonKey` (PAY-07 metni, doğrudan i18n anahtarı): `billing.failure.insufficient_funds|3ds_failed|card_blocked_online|timeout|generic`. `actionUrl` yalnız `requires_action` iken dolu.

### POST /v1/payments/{code}/cancel
İzin: `billing:purchase`. Bekleyen (`pending|requires_action`) ödemeden vazgeç ("Geri dön"), kilidi açar. Yanıt `GET /payments/{code}` gövdesi. `409 PAYMENT_NOT_PENDING`. 30 dk içinde sonuçlanmayan ödemeler cron ile `canceled` (`billing.failure.timeout`) olur.

---
## 3. Abonelik

### GET /v1/subscription — ME-07, PAY-08, ME-10
İzin: `billing:read`.
```json
{ "tier": "premium", "hasSubscription": true, "status": "active",
  "plan": { "productKey": "premium-monthly", "name": "Premium aylık", "kind": "subscription", "priceKey": "premium-monthly", "amount": 349, "currency": "TRY",
            "interval": "month", "intervalCount": 1, "periodEndRule": "interval", "monthlyEquivalent": 349 },
  "subscription": { "code": "5878", "status": "active", "channel": "web", "currentPeriodStart": "…Z", "currentPeriodEnd": "…Z", "trialEndsAt": null,
    "cancelAtPeriodEnd": false, "canceledAt": null, "cancelReason": null, "pausedUntil": null,
    "willRenew": true, "renewalDate": "…Z", "renewalAmount": 349, "renewalAttempts": 0, "graceEndsAt": null, "accessUntil": "…Z" },
  "paymentMethod": { "code": "5895", "brand": "visa", "last4": "4242", "expMonth": 12, "expYear": 2029 },
  "store": { "managed": false, "channel": "web", "noteKey": null },
  "validUntil": "…Z", "nextExamDate": "2026-11-22" }
```
- Abonelik yoksa: `{ tier:'free', hasSubscription:false, status:'none', plan:{productKey:'free', name:'Ücretsiz', kind:null}, subscription:null, paymentMethod:null, store:null, validUntil, nextExamDate }`.
- `status`: `trialing|active|past_due|canceled|expired|paused` (son biten abonelik de dönebilir; `hasSubscription` yalnız canlı durumlarda true). `past_due`: `graceEndsAt` = dönem sonu + 3 gün; erişim `accessUntil`'e kadar sürer.
- `willRenew`: otomatik yenileme var (abonelik türü, iptal yok, kayıtlı kart var). `store.managed=true` (App Store / Google Play) ise **iptal ve yönetim mağazadadır**; metin için `store.noteKey` (`billing.store.manage_in_app_store|…google_play`). ME-10 hesap silme ekranı bu alanla mağaza uyarısı gösterir.

### GET /v1/subscription/cancel-offers?reason= — PAY-09
İzin: `billing:read`. `reason`: `exam_done|too_expensive|not_using|content_insufficient|technical_issue|other` (`400 BILLING_CANCEL_REASON_INVALID`).
```json
{ "reason": "too_expensive",
  "offers": [ { "offerKey": "276", "kind": "discounted_annual", "title": "…", "body": "…", "params": {}, "pauseUntil": null,
                "price": { "priceKey": "premium-annual", "amount": 2490, "currency": "TRY", "interval": "year", "intervalCount": 1, "monthlyEquivalent": 208, "productKey": "premium-annual", "productName": "Premium yıllık" } } ],
  "cancelEffective": { "until": "…Z", "cancelable": true, "store": null } }
```
`kind`: `pause_until_next_exam` (`pauseUntil` = sonraki sınav tarihi; yaklaşan sınav yoksa teklif listelenmez), `discounted_annual`, `shorter_daily_plan`. `cancelEffective.until` = "Premium … tarihine kadar sürer" tarihi. Başlık/gövde seed metnidir (sunucudan).

### POST /v1/subscription/offers/{offerKey}/accept — PAY-09
İzin: `billing:manage`. `offerKey` = teklifin `offerKey`'i. Gövde isteğe bağlıdır; yanıtta `outcome` ayırt eder:
- `pause_until_next_exam` → `{ outcome:'paused', pausedUntil:'2026-11-22', subscription:{…} }`. Yalnız `active|trialing` **abonelik** (kind=subscription) için. Hak (grant) iptal edilir, dönemde kalan süre saklanır; `pausedUntil` günü ya da `POST /subscription/resume` ile kaldığı yerden devam eder. `400 BILLING_OFFER_NOT_APPLICABLE`, `400 BILLING_NO_UPCOMING_EXAM`.
- `discounted_annual` → gövdede ödeme alanları yoksa `{ outcome:'checkout_required', priceKey, price:{…}, validForSeconds:3600 }` (istemci bu `priceKey` ile PAY-04'e gider; fiyat 1 saat boyunca bu kullanıcı için satın alınabilir ve mevcut aboneliğin yerine geçer). Gövdede `acceptPreInfo:true, acceptDistanceSales:true, billingProfile?, card?, installmentCount?, saveCard?` varsa checkout oluşturur: `{ outcome:'checkout_created', checkout:{ paymentCode, status:'requires_action', actionUrl } }`.
- `shorter_daily_plan` → `{ outcome:'client_action', action:'shorter_daily_plan', params }`; bekleyen iptal kaldırılır, günlük plan süresi learning servisinin tercihleriyle istemci tarafından güncellenir.
Hatalar: `404 OFFER_NOT_FOUND|SUBSCRIPTION_NOT_FOUND`, `409 BILLING_STORE_MANAGED`.

### POST /v1/subscription/cancel — PAY-09
İzin: `billing:manage`. Gövde `{ reason (zorunlu, enum), note? (≤1000) }`. Dönem sonunda iptal (`cancel_at_period_end=true`, `canceled_at`, `cancel_reason`); erişim dönem sonuna kadar sürer (deneme iptalinde deneme sonuna kadar). e-posta + uygulama içi `subscription_canceled` ({until}), denetim kaydı.
```json
{ "canceled": true, "until": "2026-11-22T21:00:00.000Z", "subscription": { "code": "…", "status": "active", "cancelAtPeriodEnd": true, "…": "…" } }
```
Hatalar: `400 BILLING_CANCEL_REASON_INVALID`, `404 SUBSCRIPTION_NOT_FOUND`, `409 BILLING_SUBSCRIPTION_ALREADY_CANCELED`, `409 BILLING_STORE_MANAGED` (`details:{channel, noteKey}`).

### POST /v1/subscription/resume
İzin: `billing:manage`. Bekleyen iptali kaldırır ya da dondurulmuş aboneliği hemen sürdürür. Yanıt `{ resumed:true, subscription }`; `400 BILLING_NOTHING_TO_RESUME`, `404 SUBSCRIPTION_NOT_FOUND`.

---
## 4. Ödeme yöntemleri ve faturalar — ME-08

### GET /v1/payment-methods
`{ "items": [ { "code": "5895", "provider": "fake", "brand": "visa", "last4": "4242", "expMonth": 12, "expYear": 2029, "holderName": "A B", "isDefault": true, "status": "active" } ] }`

### POST /v1/payment-methods
İzin: `billing:manage`. Gövde `{ card:{ number, holder, expMonth, expYear, cvc } }` — **yalnız sahte sağlayıcı** (gerçek sağlayıcıda sağlayıcı formu kullanılacak). Yeni kart varsayılan olur ve canlı aboneliğe bağlanır; abonelik `past_due` ise hemen yeniden tahsilat denenir. Yanıt `{ paymentMethod, retry: null | { retried:true, ok:boolean } }`. `400 BILLING_CARD_INVALID`.

### DELETE /v1/payment-methods/{code}
`billing:manage`. Kartı kaldırır (`status=removed`). Yanıt `{ removed:true, affectedSubscriptions:n }` — `n>0` ise o aboneliğin otomatik yenilemesi kartsız kalır (başka etkin kart varsa ona bağlanır). `404 PAYMENT_METHOD_NOT_FOUND`.

### POST /v1/payment-methods/{code}/default
`billing:manage`. Varsayılan kartı değiştirir (canlı abonelik de bu karta bağlanır). Yanıt `{ paymentMethod }`.

### GET /v1/invoices
`{ "items": [ { "code": "5897", "paymentCode": "5892", "status": "pending_issue", "invoiceNumber": null, "planName": "Sınav dönemi", "subtotal": 1117.5, "taxAmount": 223.5, "total": 1341, "currency": "TRY", "issuedAt": null, "createdAt": "…Z", "documentAvailable": true, "eArchiveReady": false } ] }`
`status`: `pending_issue|issued|failed|canceled`. e-Arşiv entegratörü bağlanana kadar tüm faturalar `pending_issue`'dur.

### GET /v1/invoices/{code}/pdf[?format=json]
`billing:read`. e-Arşiv gelene kadar PDF yerine **`text/html` ödeme makbuzu** (oturumlu istekle indirilir, doğrudan bağlantı olarak açılamaz). `?format=json` ile veri: `{ code, status, invoiceNumber, pending, note, planName, subtotal, taxAmount, total, currency, paidAt, createdAt, paymentCode, billing:{fullName, companyTitle, taxOffice, taxNumber, addressLine, district, city} }`. `404 INVOICE_NOT_FOUND`.

---
## 5. Dahili (servisler arası)

### GET /v1/internal/entitlements/{userId}
`x-auth-token: INTERNAL_API_KEY`. `userId` = `identity.user_account.user_account_id`. Yanıt = `app-shared getEntitlements` + `planName`: `{ tier, productKey, source, features:{ [feature]:{ enabled, limit, period } }, validUntil, trialEndsAt, subscriptionStatus, cancelAtPeriodEnd, periodEnd, planName }`.

---
## 6. Zamanlanmış işler (`src/jobs.js`, Europe/Istanbul, cron kilidi `cron:billing:{iş}`)
| İş | Zaman | Ne yapar |
|---|---|---|
| `sweep` | her dakika | Biten abonelikleri kapatır: iptal bayraklı → `canceled`; tek seferlik paket → `expired`; kartsız biten abonelik/deneme → `expired`; `past_due` + 3 gün grace sonu → `expired`; `paused_until` gelen dondurmayı sürdürür; 30 dk'dır bekleyen ödemeleri `canceled` yapar; biten haklar için `ent:{userId}` önbelleğini siler |
| `renewals` | 5 dk | Dönemi dolan/deneme bitmiş abonelikleri kayıtlı kartla `provider.charge` ile yeniler (başarı: yeni dönem + grant + fatura + `payment_receipt`). Başarısızlık: `past_due`, erişim dönem sonu +3 gün, ilk denemede `payment_failed` (e-posta + uygulama içi), grace içinde ~günlük yeniden dener (en çok 4 deneme) |
| `trial-ending` | 10:00 | Bitişine ≤2 gün kalan denemelere `trial_ending` bildirimi (payload `{ date, planName, amount, hasPaymentMethod }`, abonelik başına bir kez) |
| `daily-expire` | 03:30 | `sweep` + kampanya sayaç düzeltme |
| `campaign-reconcile` | 30 dk | Redis 20 sayacını Postgres'ten yeniden kurar |

## 7. Ortam değişkenleri
`PAYMENT_PROVIDER` (`fake`|`iyzico`; yoksa production'da `iyzico`, diğerlerinde `fake`), `PAYMENT_FAKE_SECRET` (fake için zorunlu), `PUBLIC_APP_BASE_URL` (sonuç yönlendirmesi), `PUBLIC_API_BASE_URL` (varsayılan `GATEWAY_REST_URL`; 3DS bağlantısı), `SERVICE_IDENTITY_REST_URL` + `INTERNAL_API_KEY` (bildirim), `BILLING_VAT_RATE` (varsayılan 0.20).

## 8. Hata kodları (özet)
`BILLING_PROFILE_INVALID, BILLING_PROFILE_REQUIRED, BILLING_CARD_INVALID, BILLING_CONSENT_REQUIRED, BILLING_LEGAL_NOT_CONFIGURED(503), BILLING_CHECKOUT_IN_PROGRESS(409), BILLING_SUBSCRIPTION_ALREADY_ACTIVE(409), BILLING_COUPON_INVALID, BILLING_INSTALLMENT_INVALID, BILLING_PRICE_REQUIRED, PRICE_NOT_FOUND(404), CAMPAIGN_NOT_FOUND(404), CAMPAIGN_CLOSED(409), CAMPAIGN_SOLD_OUT(409), BILLING_TRIAL_NOT_AVAILABLE, BILLING_TRIAL_ALREADY_USED(409), PAYMENT_NOT_FOUND(404), PAYMENT_NOT_PENDING(409), BILLING_CALLBACK_SIGNATURE_INVALID(403), PAYMENT_PROVIDER_NOT_CONFIGURED(503), PAYMENT_METHOD_NOT_FOUND(404), INVOICE_NOT_FOUND(404), SUBSCRIPTION_NOT_FOUND(404), BILLING_CANCEL_REASON_INVALID, BILLING_STORE_MANAGED(409), BILLING_SUBSCRIPTION_ALREADY_CANCELED(409), BILLING_NOTHING_TO_RESUME, OFFER_NOT_FOUND(404), BILLING_OFFER_NOT_APPLICABLE, BILLING_NO_UPCOMING_EXAM, ACCOUNT_GUEST_FORBIDDEN(403)`. Kota aşımı (`QUOTA_EXCEEDED`, 402) learning/tutor tarafından üretilir; PAY-02 verisi için `GET /entitlements` + `GET /public/products`.
