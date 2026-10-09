# tutor API (sinav-service-tutor, port 2005)

Tüm yollar gateway üzerinden: `{GATEWAY}/api/sinav-service-tutor/v1/...`. Yanıt zarfı `{ success:true, data }` / `{ success:false, error:{ code, message, details } }`. SDK: `packages/client-sdk/src/tutor.js` (`createTutorApi`, SSE için `tutorMessageSend`). Hata etiketleri `apiErrors.<KOD>` (`packages/i18n/keys/apiErrorsTutorKeys.js`), enum etiketleri `enums.<enum>.<değer>` (`enumsTutorKeys.js`).

Genel kurallar
- Dışa açılan kimlikler `code` (string); iç `_id` sızmaz. Tüm kullanıcı uçları yalnız çağıranın kendi verisini görür (başkasının sohbeti/mesajı → `404`).
- İzinler: `tutor:chat` (sohbet, kota, geri bildirim, bildirme), `tutor:translation` (çeviri koçu), `content:report:manage` (CMS). Misafirde `tutor:*` yoktur → `403 PERMISSION_DENIED`.
- Kota (Redis 19, app-shared): `tutor_messages_per_day`, `translation_evals_per_day`. Aşımda `402 QUOTA_EXCEEDED` (`details.feature`). Ücretsiz plan varsayılanı: 5 mesaj/gün, 3 değerlendirme/gün; premium daha yüksek/sınırsız (limit `null`). Kota **LLM yapılandırılmışken** düşer; başarısız yanıt (hiç token gelmeden) kotayı **iade eder**.
- `usage` nesnesi her yerde aynı: `{ enabled, limit (null=sınırsız), used, remaining (null=sınırsız), period:'day', periodKey:'2026-10-09' }` (periodKey kullanıcının saat dilimindeki gün).
- LLM: OpenRouter (`OPENROUTER_API_KEY`). Anahtar yoksa sohbet/değerlendirme `503 LLM_NOT_CONFIGURED` döner ve `overview.llmAvailable=false` olur; istemci "Öğretmen şu an kapalı" durumunu gösterir (kota düşmez). Yerel doğrulama için `FAKE_LLM=1` (yalnız `NODE_ENV!=production`) sahte adaptörü açar.
- Öğretmen sınav sırasında kapalıdır: devam eden bir deneme oturumuna bağlam verilirse `403 TUTOR_CONTEXT_FORBIDDEN`.
- Sohbet geçmişi modele son 20 mesajla gider; öğrenci mesajı `<ogrenci_mesaji>` etiketiyle sarılır (istem enjeksiyonuna karşı veri sayılır).

Enum değerleri
- `mode`: `free` | `explain` | `sentence_xray` | `translation_coach`.
- `contextKind`: `none` | `question` | `mock_review` | `note`.
- Mesaj `role`: `user` | `assistant`. Mesaj `status`: `complete` | `streaming` | `interrupted` | `failed`.
- Bildirme `reason`: `wrong_info` | `unclear` | `off_topic` | `inappropriate` | `other`. Rapor `status`: `open` | `in_review` | `resolved` | `rejected`.
- `preset` (hızlı istek): `simpler` ("Daha basit anlat") | `example` ("Örnek ver").

---
## 1. Ana ekran ve kota

### GET /v1/overview?limit= — TUTOR-01
İzin: `tutor:chat`. `limit` 1..100 (varsayılan 30). Sabitlenmişler önce, sonra son mesaja göre.
```json
{ "conversations": [
    { "code": "11588", "title": "Yeni başlık", "titleIsAuto": false, "mode": "free", "contextKind": "none", "context": null,
      "pinned": true, "messageCount": 4, "lastMessageAt": "2026-10-09T06:26:24.669Z", "createdAt": "2026-10-09T06:26:22.012Z",
      "lastMessagePreview": "Merhaba, ben Öğretmen; …" } ],
  "starters": [ { "code": "301", "mode": "explain", "text": "Zıtlık bağlaçlarını anlat" } ],
  "usage": { "enabled": true, "limit": 5, "used": 0, "remaining": 5, "period": "day", "periodKey": "2026-10-09" },
  "tier": "free", "llmAvailable": true }
```
`starters`: aktif başlangıç önerileri (kullanıcının kayıtlı olduğu sınav + genel); en çok 12. `context` null değilse `{ kind, label, sessionCode, position, itemCode }`.

### GET /v1/usage — TUTOR-05
İzin: `tutor:chat`.
```json
{ "tier": "free",
  "tutorMessages":   { "enabled": true, "limit": 5, "used": 1, "remaining": 4, "period": "day", "periodKey": "2026-10-09" },
  "translationEvals": { "enabled": true, "limit": 3, "used": 0, "remaining": 3, "period": "day", "periodKey": "2026-10-09" } }
```
Plan karşılaştırması için `billing GET /v1/public/products` (billing.md).

---
## 2. Sohbetler

### POST /v1/conversations — TUTOR-02, TUTOR-06
İzin: `tutor:chat`. Gövde (hepsi isteğe bağlı):
```json
{ "mode": "explain", "title": "Bağlaçlar",
  "context": { "kind": "question", "sessionCode": "4521", "position": 7, "itemCode": null } }
```
- `context.kind = question | mock_review`: ya `sessionCode`+`position` (çalışma/deneme oturumundaki sıra; bağlam oturum kaydından çözülür, `mock_review` yalnız deneme oturumuna) ya da `itemCode` (yayımlı soru kodu). `note`: `itemCode` (yayımlı hap not). Yanıtı bildirilmiş ücretli içerik ücretsiz kullanıcıya kapalıdır (`403 TUTOR_CONTEXT_FORBIDDEN`; oturum üzerinden gelen soru hariç).
- Bağlam varsa ve `title` verilmediyse başlık otomatik etiket olur (ör. `Soru: Dil bilgisi · Bağlaçlar 7/10`, `titleIsAuto:true`); bağlamsız ve başlıksız sohbet başlığı ilk mesajdan (ilk 60 karakter) atanır.

Yanıt `data` = sohbet nesnesi:
```json
{ "code": "11681", "title": "Soru: Diyalog tamamlama · Diyalog tamamlama", "titleIsAuto": true, "mode": "explain", "contextKind": "question",
  "context": { "kind": "question", "label": "Soru: …", "sessionCode": null, "position": null, "itemCode": "254" },
  "pinned": false, "messageCount": 0, "lastMessageAt": null, "createdAt": "2026-10-09T06:27:46.762Z" }
```
Hatalar: `400 TUTOR_MODE_INVALID|TUTOR_CONTEXT_INVALID`, `403 TUTOR_CONTEXT_FORBIDDEN`, `404 TUTOR_CONTEXT_NOT_FOUND`.

### GET /v1/conversations/{code}
İzin: `tutor:chat`. Son 200 mesaj (eskiden yeniye).
```json
{ "conversation": { …sohbet nesnesi },
  "messages": [
    { "code": "11589", "role": "user", "status": "complete", "content": "…", "blocks": [], "sources": [], "preset": null,
      "needsExpertReview": false, "errorCode": null, "feedback": null, "createdAt": "…Z", "finishedAt": null },
    { "code": "11590", "role": "assistant", "status": "complete", "content": "…", "blocks": [ …blok ], "sources": [ { "kind": "note", "code": "7863", "title": "…" } ],
      "preset": null, "needsExpertReview": false, "errorCode": null, "feedback": true, "createdAt": "…Z", "finishedAt": "…Z" } ],
  "usage": { …usage } }
```
`feedback`: `true|false|null` (kullanıcının oyu). `status:'streaming'` bir mesaj varsa akış sürüyor olabilir (sayfa yenilemesi); istemci `POST /messages/{code}/stop` ya da yeniden `GET` ile izler. 10 dk'dan eski `streaming` mesajlar cron ile `interrupted` yapılır. `404 TUTOR_CONVERSATION_NOT_FOUND`.

### PATCH /v1/conversations/{code}
İzin: `tutor:chat`. Gövde: `{ "title": "…" (1..120), "pinned": true|false }` (en az biri). Yanıt = güncel sohbet nesnesi. `400 TUTOR_TITLE_INVALID|TUTOR_UPDATE_EMPTY`, `404 TUTOR_CONVERSATION_NOT_FOUND`.

### DELETE /v1/conversations/{code}
Mesajlarla birlikte siler. Yanıt `{ "deleted": 1 }`. `404 TUTOR_CONVERSATION_NOT_FOUND`.

### DELETE /v1/conversations
Çağıranın tüm sohbetlerini siler (ME ayarları / geçmişi temizle). Yanıt `{ "deleted": 3 }`.

---
## 3. Mesaj gönderme (SSE) — TUTOR-02

### POST /v1/conversations/{code}/messages
İzin: `tutor:chat`. `Content-Type: application/json`, **yanıt `text/event-stream`**. Gövde:
```json
{ "content": "Bağlaçları anlatır mısın?", "mode": "explain", "preset": "simpler", "clientRef": "0b6c0c0e-…-uuid" }
```
- `content` 1..4000 karakter (zorunlu). `mode` verilirse sohbetin modunu günceller. `preset` ile birlikte `content` yine zorunludur (ör. "Daha basit anlat" düğmesi önceki konuyu bağlam alır). `clientRef` (uuid) çift gönderimi engeller (`409 TUTOR_MESSAGE_ALREADY_EXISTS`).
- Aynı kullanıcı için aynı anda **tek** akış: ikincisi `409 TUTOR_STREAM_ALREADY_RUNNING` (Redis kilidi 120 sn, akış sürerken yenilenir).
- **SSE başlamadan** oluşan hatalar normal JSON zarfıdır (HTTP durum koduyla): `400 TUTOR_MESSAGE_INVALID|TUTOR_MODE_INVALID`, `402 QUOTA_EXCEEDED`, `404 TUTOR_CONVERSATION_NOT_FOUND`, `409 …`. İstemci yanıtın `Content-Type` başlığına bakarak ayırt eder (SDK `tutorMessageSend` bunu yapar ve hatayı `error.status/code/body` ile fırlatır).
- Akış başladıktan sonra hata fırlatılmaz; `error` olayı yazılır. İstemci bağlantıyı keserse üretim durdurulur, mesaj `interrupted` kaydedilir (yazılan kısım saklanır). Her 15 sn `: ping` yorum satırı gelir.

Olaylar (her biri `event: <ad>\ndata: <JSON>\n\n`):

| olay | data |
|---|---|
| `meta` | `{ messageCode, userMessageCode, conversationCode, mode, remaining:{ limit, used, remaining, period } }` — ilk olay; `messageCode` asistan mesajıdır (durdurma/geri bildirim/bildirme için) |
| `token` | `{ text }` — eklenecek metin parçası |
| `block` | `{ messageCode, block }` — yapılandırılmış blok (akış bitince, `done`'dan önce; aşağıda) |
| `done` | `{ messageCode, status:'complete'|'interrupted', content, usage:{ inputTokens, outputTokens, cacheReadTokens }, sources:[{kind,code,title}], needsExpertReview, remaining }` — `content` tam metindir (token'lar birleşimiyle aynı); `interrupted` = kullanıcı durdurdu/bağlantı koptu |
| `error` | `{ messageCode, code, retryable, partial, remaining }` — `code` bir `apiErrors.*` kodu (`LLM_UPSTREAM_ERROR`, `LLM_TIMEOUT`, `LLM_RATE_LIMITED`, `LLM_BAD_OUTPUT`, `LLM_NOT_CONFIGURED`, `TUTOR_INTERNAL_ERROR`); `partial:true` ise kısmi metin zaten gönderildi. Hiç token gelmediyse kota iade edilir (`remaining` iade sonrası değerdir) |

Örnek akış:
```
event: meta
data: {"messageCode":"11590","userMessageCode":"11589","conversationCode":"11588","mode":"free","remaining":{"limit":5,"used":1,"remaining":4,"period":"day"}}

event: token
data: {"text":"Merhaba,"}

event: block
data: {"messageCode":"11590","block":{"type":"sentence_xray", …}}

event: done
data: {"messageCode":"11590","status":"complete","content":"Merhaba, …","usage":{"inputTokens":1395,"outputTokens":215,"cacheReadTokens":0},"sources":[{"kind":"note","code":"7863","title":"Diyalog tamamlama: işlevi eşle"}],"needsExpertReview":false,"remaining":{"limit":5,"used":1,"remaining":4,"period":"day"}}
```

Blok türleri (`block.type`; sunucuda doğrulanıp kırpılır, en çok 4 blok):
```json
{ "type": "mini_question", "stem": "She stayed home ______ she was invited.",
  "options": [ { "label": "A", "text": "because" }, { "label": "B", "text": "although" } ],
  "answerLabel": "B", "explanation": "…" }
{ "type": "sentence_xray", "sentence": "Despite the heavy rain, the match continued.",
  "parts": [ { "no": 1, "text": "Despite the heavy rain", "role": "Zarf öbeği", "function": "Zıtlık kurar", "main": false } ],
  "skeleton": "Despite + isim öbeği -> özne -> yüklem", "translation": "Şiddetli yağmura rağmen maç devam etti." }
{ "type": "table", "title": "Zıtlık bağlaçları", "columns": ["Bağlaç", "Anlam"], "rows": [ ["although", "-e rağmen"] ] }
```
- `mini_question`: 2..5 şık; `answerLabel` şıklardan biri ya da `null`.
- `sources`: yalnız sunucunun bağlam/anahtar kelime eşleşmesinden bulduğu **yayımlı hap notlar**; model uydurma kaynak gösteremez (kod listeyle eşleşmezse atılır). Çip, hap not ekranına (`code` = not kodu) gider.
- `needsExpertReview:true`: model emin değil ("Bu yanıtı bir uzman gözden geçirsin" rozeti) ya da kullanıcı yanıtı bildirdi.

### POST /v1/messages/{code}/stop
İzin: `tutor:chat`. `code` = asistan mesajı. Akış sürüyorsa durdurur (400 ms içinde `done` olayı `status:'interrupted'` ile kapanır):
```json
{ "stopped": true, "status": "streaming" }
```
Zaten bitmişse `{ "stopped": false, "status": "complete" }` (hata değil). `404 TUTOR_MESSAGE_NOT_FOUND`.

### POST /v1/messages/{code}/feedback
İzin: `tutor:chat`. Gövde `{ "isHelpful": true }` (boolean; tekrar çağrı oyu değiştirir). Yanıt `{ "isHelpful": true }`. `400 TUTOR_FEEDBACK_INVALID` (boolean değil / kullanıcı mesajı), `404 TUTOR_MESSAGE_NOT_FOUND`.

### POST /v1/messages/{code}/reports — TUTOR-07
İzin: `tutor:chat`. Gövde `{ "reason": "wrong_info", "note": "isteğe bağlı, ≤1000" }`. Mesajın o anki içeriği, önceki kullanıcı mesajı ve bağlam **anlık görüntü** olarak editör kuyruğuna düşer (sohbet silinse de inceleme sürer); mesaj `needsExpertReview` olur.
```json
{ "code": "11648", "status": "open" }
```
Hatalar: `400 TUTOR_REPORT_REASON_INVALID`, `404 TUTOR_MESSAGE_NOT_FOUND`, `409 TUTOR_REPORT_ALREADY_EXISTS` (aynı mesaj için açık raporun var).

---
## 4. Çeviri koçu — STUDY-19

### GET /v1/translation/prompts/next?direction=&difficulty=&area=
İzin: `tutor:translation`. `direction`: `en_tr` (varsayılan) | `tr_en`; `difficulty`: `easy` | `medium` | `hard`; `area`: konu alanı anahtarı (ör. `health`). Yayımlı çeviri sorularından, kullanıcının daha az gördüğünü seçer; ücretsiz kullanıcıya yalnız `free` katman.
```json
{ "promptCode": "10652", "direction": "en_tr", "sourceText": "The findings suggest …", "difficulty": 3, "area": "health", "tier": "free", "repeat": false,
  "criteria": [ { "key": "meaning", "name": "Anlam", "description": "…", "maxPoints": 3 }, { "key": "tense", … }, { "key": "structure", … }, { "key": "vocabulary", … } ],
  "usage": { "enabled": true, "limit": 3, "used": 0, "remaining": 3, "period": "day" } }
```
`difficulty`: 1..5 sayısal (istek parametresi etiket, yanıt sayı). `repeat:true`: havuz tükendi, daha önce çözülen verildi. Hatalar: `400 TUTOR_TRANSLATION_DIRECTION_INVALID|TUTOR_TRANSLATION_DIFFICULTY_INVALID`, `404 TUTOR_TRANSLATION_PROMPT_NOT_FOUND` (süzgece uyan soru yok).

### POST /v1/translation/evaluations
İzin: `tutor:translation`. Gövde `{ "promptCode": "10652", "userText": "…" (1..2000), "clientRef": "uuid" }`. Eşzamanlı çalışır (birkaç sn); kota düşer, hata olursa iade edilir. `clientRef` aynı değerle tekrar çağrılırsa: tamamlanmış sonucu aynen döndürür (çift tıklama güvenli), `failed` ise aynı kaydı yeniden dener; kayıt hâlâ `pending` ise `409 TUTOR_EVALUATION_ALREADY_RUNNING`.
```json
{ "code": "11712", "status": "completed", "errorCode": null,
  "promptCode": "10652", "direction": "en_tr", "sourceText": "…", "userText": "…",
  "scores": [ { "key": "meaning", "name": "Anlam", "points": 3, "maxPoints": 3, "comment": "…" } ],
  "totalScore": 10, "maxScore": 12,
  "suggestedTranslation": "Bulgular, gecede altı saatten az uyuyan …",
  "feedback": { "summary": "…", "parts": [ { "kind": "kept|deleted|added", "text": "…" } ], "notes": [ "…" ] },
  "evaluatedAt": "…Z", "createdAt": "…Z",
  "usage": { "enabled": true, "limit": 3, "used": 1, "remaining": 2, "period": "day" } }
```
- `feedback.parts`: kullanıcı metni ile önerilen çeviri arasındaki **kelime düzeyi fark** (sunucuda hesaplanır): `kept` ortak, `deleted` kullanıcıda olup önerilende olmayan, `added` önerilende olup kullanıcıda olmayan.
- `status`: `completed` | `failed` (`errorCode` dolu) | `pending`. Puanlar ölçüt `maxPoints` ile kırpılır; `totalScore` toplamdır.
- Hatalar: `400 TUTOR_EVALUATION_TEXT_INVALID`, `402 QUOTA_EXCEEDED`, `404 TUTOR_TRANSLATION_PROMPT_NOT_FOUND`, `409 TUTOR_EVALUATION_ALREADY_RUNNING`, `503 TUTOR_RUBRIC_UNAVAILABLE|LLM_NOT_CONFIGURED`, `502 LLM_UPSTREAM_ERROR|LLM_BAD_OUTPUT`, `504 LLM_TIMEOUT`, `429 LLM_RATE_LIMITED`.

### GET /v1/translation/evaluations/{code}
İzin: `tutor:translation`. Yanıt: yukarıdaki nesne (`usage` olmadan değil, aynı şekil). `404 TUTOR_EVALUATION_NOT_FOUND`.

---
## 5. CMS (yanıt bildirimleri) — CMS-08

### GET /v1/cms/message-reports?status=&limit=&cursor=
İzin: `content:report:manage` (editör, gözden geçiren, destek, superadmin). `status`: `open|in_review|resolved|rejected` (yoksa hepsi); `limit` 1..100 (50); `cursor` önceki yanıtın `nextCursor`ı (id'ye göre azalan).
```json
{ "reports": [ { "code": "11648", "reason": "other", "note": "n", "status": "open", "messageCode": "11646",
    "snapshot": { "messageCode": "11646", "mode": "free", "context": null, "userMessage": "merhaba", "assistantMessage": "…", "blocks": [], "sources": [] },
    "createdAt": "…Z", "resolvedAt": null, "resolutionNote": null } ],
  "nextCursor": null }
```
`400 TUTOR_REPORT_STATUS_INVALID`; yetkisiz `403 PERMISSION_DENIED`.

### POST /v1/cms/message-reports/{code}/resolve
İzin: `content:report:manage`. Gövde `{ "status": "resolved|rejected|in_review", "note": "≤2000" }` (`status` varsayılan `resolved`). Yanıt `{ "code": "11648", "status": "resolved" }`. `resolved|rejected` raporu kapatır ve bildiren kullanıcıya uygulama içi `report_resolved` bildirimi gider (identity internal, en iyi çaba). Kapalı rapor tekrar değişmez. Hatalar: `400 TUTOR_REPORT_STATUS_INVALID`, `404 TUTOR_REPORT_NOT_FOUND`, `409 TUTOR_REPORT_NOT_EDITABLE`.

---
## 6. Dahili

### POST /v1/internal/ai/complete
`x-auth-token: INTERNAL_API_KEY` (gateway'den erişilmez). content servisinin CMS taslak üretimi ve diğer servisler için tek seferlik LLM çağrısı; maliyet `tutor.ai_usage` defterine yazılır.
```json
{ "feature": "content_draft", "model": "anthropic/claude-opus-4.1", "messages": [ { "role": "system", "content": "…" }, { "role": "user", "content": "…" } ], "json": true, "maxTokens": 4000 }
```
- `feature`: `tutor_chat` | `translation_eval` | `content_draft` (varsayılan). `messages`: 1..40, toplam ≤200 000 karakter, `role` `system|user|assistant`. `maxTokens` ≤8000. `model` yoksa özelliğe göre `TUTOR_MODEL` / `EVAL_MODEL` / `CONTENT_MODEL`.
- `json:true`: yanıt JSON ayrıştırılır (çit/çevre metne dayanıklı).
```json
{ "text": "…", "json": { }, "model": "…", "usage": { "inputTokens": 1, "outputTokens": 5, "cacheReadTokens": 0, "costMicros": 0 }, "finishReason": "stop" }
```
Hatalar: `400 TUTOR_AI_FEATURE_INVALID|TUTOR_AI_MESSAGES_INVALID`, `503 LLM_NOT_CONFIGURED`, `502 LLM_UPSTREAM_ERROR`.

---
## 7. Zamanlanmış işler (`src/jobs.js`, cron kilidi `cron:tutor:{iş}`)
| İş | Zaman | Ne yapar |
|---|---|---|
| `sweep-stale-streams` | 5 dk | 10 dk'dan uzun süredir `streaming` kalan asistan mesajlarını (süreç çökmesi) `interrupted` yapar |

## 8. Ortam değişkenleri
`LLM_PROVIDER` (`openrouter`), `OPENROUTER_API_KEY` (boşsa `LLM_NOT_CONFIGURED`), `OPENROUTER_BASE_URL`, `TUTOR_MODEL` (varsayılan `anthropic/claude-sonnet-4.5`), `EVAL_MODEL` (`anthropic/claude-haiku-4.5`), `CONTENT_MODEL` (`anthropic/claude-opus-4.1`), `FAKE_LLM=1` (yalnız geliştirme; üretimde reddedilir), `FAKE_LLM_DELAY_MS` (sahte token gecikmesi, varsayılan 70), `INTERNAL_API_KEY`, `SERVICE_IDENTITY_REST_URL`, `SERVICE_LEARNING_REST_URL`.

## 9. Hata kodları (özet)
`TUTOR_CONVERSATION_NOT_FOUND(404), TUTOR_MESSAGE_NOT_FOUND(404), TUTOR_MESSAGE_INVALID, TUTOR_MESSAGE_ALREADY_EXISTS(409), TUTOR_STREAM_ALREADY_RUNNING(409), TUTOR_MODE_INVALID, TUTOR_CONTEXT_NOT_FOUND(404), TUTOR_CONTEXT_FORBIDDEN(403), TUTOR_CONTEXT_INVALID, TUTOR_TITLE_INVALID, TUTOR_UPDATE_EMPTY, TUTOR_FEEDBACK_INVALID, TUTOR_REPORT_REASON_INVALID, TUTOR_REPORT_ALREADY_EXISTS(409), TUTOR_REPORT_NOT_FOUND(404), TUTOR_REPORT_NOT_EDITABLE(409), TUTOR_REPORT_STATUS_INVALID, TUTOR_TRANSLATION_DIRECTION_INVALID, TUTOR_TRANSLATION_DIFFICULTY_INVALID, TUTOR_TRANSLATION_PROMPT_NOT_FOUND(404), TUTOR_EVALUATION_TEXT_INVALID, TUTOR_EVALUATION_NOT_FOUND(404), TUTOR_EVALUATION_ALREADY_RUNNING(409), TUTOR_RUBRIC_UNAVAILABLE(503), TUTOR_AI_FEATURE_INVALID, TUTOR_AI_MESSAGES_INVALID, TUTOR_INTERNAL_ERROR, LLM_NOT_CONFIGURED(503), LLM_UPSTREAM_ERROR(502), LLM_TIMEOUT, LLM_RATE_LIMITED(429), LLM_BAD_OUTPUT(502)`; ayrıca ortak `QUOTA_EXCEEDED(402)`, `PERMISSION_DENIED(403)`, `TOKEN_MISSING(401)`.
