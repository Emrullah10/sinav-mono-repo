# content API

Taban: `/api/sinav-service-content/v1`. Yanıt zarfı: `{ success:true, data }` / `{ success:false, error:{ code, message, details? } }`. Kimlik ve gateway kuralları `identity.md` ile aynı (web: çerez+CSRF, mobil: bearer). SDK: `packages/client-sdk/src/content.js` (`contentPublicExamsList`, `contentCmsItemsList`, …). Hata metinleri `apiErrors.<KOD>` i18n anahtarıyla çevrilir (`packages/i18n/keys/apiErrorsContentKeys.js`).

Kimlikler: dışa açılan her `code` tablo `*_code` kolonudur (sayı); anahtarlar (`key`) iş anahtarıdır (`yds-en`, `grammar.tenses`, `2026-YDS/2`). İç `_id` yanıtlara çıkmaz. Tarihler `YYYY-MM-DD`, zamanlar ISO 8601 (UTC).

İzinler: `public` oturumsuz; `study:content:read` ve `content:report:create` öğrenci (learner); `content:*` personel rolleri (editör: read/write/generate/report:manage, gözden geçiren: read/review/report:manage, superadmin: hepsi). Misafir (`guest`) yalnızca public uçları ve `catalog:read` ile gelen uçları kullanır.

## Public katalog (oturumsuz; landing + onboarding)
| Uç | Not |
|---|---|
| `GET /public/ping` | `"pong"` |
| `GET /public/exams` | `{ items:[{ key, name, shortName, providerName, description, status, tracks:[{ key, name, deliveryMode, contentLanguage, status, notice, isDefault }], nextSession:{ key, name, deliveryMode, status, examDate, examTime, applicationStart, applicationEnd, lateApplicationEnd, resultDate, isEstimated, sourceUrl }\|null }] }` |
| `GET /public/exam-tracks/{key}` | `key`: `yds-en`, `eyds-en`, `yokdil-health`, `yokdil-science`, `yokdil-social`. Yanıt: `{ track:{ key, name, deliveryMode:'paper'\|'computer', contentLanguage, status, notice, isDefault, exam:{ key, name, shortName }, subjectArea, fallbackTrack }, blueprint:{ code, versionNo, name, questionCount, durationSeconds, optionsPerQuestion, scoringMethod, scoringParams:{ perCorrect, wrongPenalty }, scoreMin, scoreMax, sections:[{ position, questionCount, firstQuestionNo, lastQuestionNo, label, targetSecondsPerQuestion, questionType:{ key, name, shortName, … } }] }, skills:[{ key, name, path, depth, sortOrder, parentKey, description }], goalPresets:[{ targetScore, label, description, isDefault }], goalReasons:[{ key, label }], sessions:[{ key, name, deliveryMode, status:'announced'\|'held'\|…, examDate, examTime, applicationStart, applicationEnd, lateApplicationEnd, resultDate, isEstimated, sourceUrl }] }`. Puan hesabı istemcide paylaşılan `scoring.js` ile (`perCorrect`, `wrongPenalty`). 404 `CONTENT_TRACK_NOT_FOUND`. |
| `GET /public/exam-sessions/{key}.ics` | Takvime ekle; `text/calendar` indirir. `key` URL-kodlanır (`2026-YDS%2F1`); SDK `contentPublicSessionIcsUrl(key)` adresi üretir. 404 `CONTENT_SESSION_NOT_FOUND`. |
| `GET /public/featured/{placement}` | `{ placement, items:[…] }` (örn. `landing_tutor_demo`: demo soru + ipucu merdiveni). Boş olabilir. |
| `GET /public/articles?type=blog\|guide\|help&category=&page=&pageSize=` | `{ items:[{ code, slug, type, title, excerpt, category:{ key, name }, author:{ displayName, title }, readingMinutes, publishedAt, coverBlobId, seoTitle, seoDescription, language }], page, pageSize, total }` |
| `GET /public/articles/search?q=&type=` | aynı öğeler + `snippet`, `rank`; `{ q, total, items }` |
| `GET /public/articles/{type}/{slug}` | öğe alanları + `author.bio`, `bodyMd`, `toc:[{ id, level, title }]`, `ctaKey`, `updatedAt`, `related:[…]`. 404 `CONTENT_ARTICLE_NOT_FOUND`. |
| `GET /public/article-categories?type=` | `{ items:[{ type, key, name, description, articleCount }] }` |

## Öğrenci okumaları
| Uç | İzin | Not |
|---|---|---|
| `GET /vocab/lookup?word=&lang=en` | study:content:read | Sözlük balonu. Çekimli biçimi köke indirger (`rejected` → `reject`). `{ found, word, matched, entries:[{ itemCode, headword, partOfSpeech, pronunciationIpa, meanings:[{ tr, note }], examples:[{ en, tr, examStyle }], collocations:[str], synonyms:[str], antonyms, confusables, frequencyRank, accessTier }], primary }`. Bulunamazsa `found:false` (hata değil). `word` boşsa 400 `CONTENT_WORD_REQUIRED`. |
| `GET /vocab/{itemCode}` | study:content:read | Tek kelime ayrıntısı: lookup girdisiyle aynı alanlar + `language`. 404 `CONTENT_VOCAB_NOT_FOUND`. |
| `GET /notes/{itemCode}` | study:content:read | Hap not: `{ itemCode, title, noteKind:'skill'\|'strategy', accessTier, locked, readingSeconds, summary, ruleMd, examples:[{ en, tr }], trapMd, checkQuestions:[{ position, itemCode, stem, stemFormat, options:[{ label, text, rationale }], correctLabel, shortReason, explanation }], relatedSkills:[{ key, name, path }], questionTypeKey }`. Premium not ücretsiz kullanıcıya `locked:true` ve boş gövde döner (`ruleMd:null`). **`checkQuestions` yalnız önizleme verisidir; soruları çözdürmek için `POST /learning/notes/{itemCode}/checks` oturumunu kullan, cevapları ekranda önceden gösterme.** 404 `CONTENT_NOTE_NOT_FOUND`. |
| `POST /content-reports` | content:report:create | "Hata bildir". `{ itemCode, reason:'wrong_answer_key'\|'typo'\|'unclear'\|'wrong_info'\|'off_topic'\|'inappropriate'\|'other', note?(≤1000), context?:object }` → `{ code, status:'open', duplicate }`. Aynı kullanıcının aynı soru+neden için açık bildirimi varsa `duplicate:true` ve mevcut kod. 400 `CONTENT_REPORT_INVALID`, 404 `CONTENT_ITEM_NOT_FOUND`. |

## CMS: maddeler
`kind`: `question`, `passage`, `note`, `vocab_entry`, `translation_prompt`, `exam_form`, `article`. Durum (`status`): `draft`, `in_review`, `pilot`, `published`, `retired`. Revizyon (`reviewStatus`): `draft`, `changes_requested`, `submitted`, `approved`, `rejected`, `superseded`. Yayımlanmış revizyon değişmez; düzenleme `POST …/revisions` ile yeni revizyon açar.

| Uç | İzin | İstek | Yanıt / not |
|---|---|---|---|
| `GET /cms/items` | content:read | sorgu: `kind, status` (virgülle çoklu), `exam` (sınav anahtarı), `skill` (beceri anahtarı; alt becerileri kapsar), `type` (soru tipi anahtarı), `tier`, `origin`, `reviewStatus`, `mine=true`, `q` (başlık/önizleme/kod), `sort` (`updated_desc`\|`updated_asc`\|`created_desc`\|`title`\|`correct_rate_asc`\|`correct_rate_desc`\|`attempts_desc`\|`reports_desc`), `page`, `pageSize`(≤100) | `{ items:[{ code, kind, status, title, preview, language, accessTier, origin, questionTypeKey, difficulty, examKeys, skillKeys, primarySkillKey, revision:{ code, revisionNo, reviewStatus, submittedAt }, author, updatedBy, stat, publishedAt, updatedAt, createdAt }], page, pageSize, total, statusCounts:{ draft, in_review, pilot, published, retired } }` |
| `POST /cms/items` | content:write | `{ kind, body, title?, slug?, language?='en', accessTier?='free'\|'premium', examKeys?:[str], skills?:[{ key, weight(0,1] }], subjectAreaKey?, externalRef?, changeNote? }` | Madde + 1. revizyon (taslak) → madde ayrıntısı (aşağıda). `passage` gövdesinde `questions:[…]` alt sorularla birlikte oluşturur. Gövde türleri aşağıda. 400 `CONTENT_KIND_INVALID`, `CONTENT_BODY_INVALID{field}`, 409 `CONTENT_VOCAB_DUPLICATE`, `CONTENT_SLUG_CONFLICT`. |
| `POST /cms/items/bulk` | content:write | `{ codes:[1..200], action:'tag_skills'\|'tag_exams'\|'send_to_review', mode:'add'\|'replace'\|'remove', skillKeys?, examKeys? }` | `{ results:[{ code, ok, error? }], okCount, failedCount }` (kısmi başarı normaldir) |
| `GET /cms/items/{code}` | content:read | | `{ code, kind, status, title, slug, language, accessTier, origin, externalRef, subjectAreaKey, checkQuestion, examKeys, skills:[{ key, name, path, weight, isPrimary }], publishedAt, retiredAt, createdAt, updatedAt, latestRevision:{ code, revisionNo, reviewStatus, editable, author, assignedReviewer, reviewedBy, submittedAt, reviewedAt, decisionNote, changeNote, basedOnRevisionNo, generationJobCode, openComments, createdAt, updatedAt, body }, publishedRevision, body, revisions:[…özet], stat }`. 404 `CONTENT_ITEM_NOT_FOUND`. |
| `PUT /cms/items/{code}/draft` | content:write | gövde alanları (örn. `{ body, title?, accessTier?, slug?, examKeys?, skills?, changeNote? }`) | Düzenlenebilir son revizyonu kaydeder. 409 `CONTENT_REVISION_NOT_EDITABLE`, `CONTENT_ITEM_RETIRED`. |
| `POST /cms/items/{code}/submit` | content:write | `{ changeNote? }` | Doğrular ve incelemeye gönderir → `{ item, … }`; 400 `CONTENT_VALIDATION_FAILED` (`details:{ errors, warnings }`). 409 `CONTENT_REVISION_NOT_SUBMITTABLE`. |
| `POST /cms/items/{code}/revisions` | content:write | `{ changeNote? }` | Yayımlanmış maddeden yeni taslak revizyon → madde. 409 `CONTENT_REVISION_ALREADY_OPEN`, `CONTENT_REVISION_IN_REVIEW`. |
| `POST /cms/items/{code}/retire` | content:read | `{ note? }` | Maddeyi emekliye ayırır → madde. 409 `CONTENT_ITEM_RETIRED`. |
| `GET /cms/items/{code}/similar?stem=&limit=10` | content:read | | `{ items:[…] }` (trigram benzerliği ≥0.4). Yeni içerikte `code` yerine `new` ve `stem` ver; metin en az 8 karakter olmalı, yoksa `items:[]`. |
| `GET /cms/taxonomy` | content:read | | `{ questionTypes, skills, exams, tracks, subjectAreas, articleCategories, articleAuthors, rubrics, enums:{ contentKind, contentStatus, revisionStatus, accessTier, hintKind, noteKind, partOfSpeech, examFormType, articleType, passageKind, textFormat, readingQuestionKind, reportReason, reportStatus, generationJobStatus, questionFormat, contentOrigin } }` (editör açılır listeleri) |
| `GET /cms/exam-forms/autofill?track=&formType=full\|mini\|question_type_drill` | content:read | | Plana göre otomatik deneme taslağı: `{ trackKey, formType, blueprintCode, title, questionCount, targetQuestionCount, durationSeconds, questions:[{ position, questionItemCode, sectionPosition, questionTypeKey, difficulty, accessTier, stem, passageItemCode }], balance:{ total, byType, byDifficulty, byTier, correctLabelCounts }, shortfalls:[…], complete }`. 400 `CONTENT_AUTOFILL_INVALID`, `CONTENT_AUTOFILL_NO_BLUEPRINT`. |

### Gövde (`body`) şekilleri
- `question`: `{ questionTypeKey, passageItemCode?, groupPosition?, blankNo?, stem, stemFormat:'plain'\|'markdown', readingQuestionKind?:'main_idea'\|'inference'\|'detail'\|'vocabulary_in_context'\|'author_attitude', difficulty(1–5), estimatedSeconds, shortReason, explanation, options:[{ label:'A'…, text, isCorrect, rationale }], hints:[{ stepNo, kind:'focus'\|'rule'\|'eliminate'\|'solution', body, eliminatesLabels:[…] }] }` (tam bir doğru şık gerekir).
- `passage`: `{ passageKind:'reading'\|'cloze'\|'paragraph', title, body, bodyFormat, terms:[{ term, definitionTr, vocabItemCode? }], questions?:[…] , license, attribution }`.
- `note`: `{ noteKind:'skill'\|'strategy', title, readingSeconds, ruleMd, examples:[{ en, tr }], trapMd, summary, checkQuestions:[{ position, questionItemCode }] }`.
- `vocab_entry`: `{ headword, partOfSpeech, pronunciationIpa, meanings:[{ tr, note }], examples:[{ en, tr, examStyle }], collocations, synonyms, antonyms, confusables, frequencyRank }`.
- `translation_prompt`, `exam_form`, `article` benzer alan listeleriyle `GET /cms/taxonomy` sözlüğünden doğrulanır; ayrıntı için ilgili madde `GET /cms/items/{code}` yanıtındaki `body`.

## CMS: inceleme (four-eyes)
| Uç | İzin | İstek | Not |
|---|---|---|---|
| `GET /cms/review-queue?assigned=me\|mine_only\|unassigned\|all&kind=&priority=high\|normal\|low&page=&pageSize=` | content:review | | `{ items:[{ revisionCode, revisionNo, itemCode, kind, title, preview, accessTier, origin, isUpdate, changeNote, author:{ code, displayName }, assignedReviewer, priority, submittedAt, waitingSeconds, openReports, openComments }], page, pageSize, total }` |
| `GET /cms/revisions/{code}` | content:read | | `{ revision, item, body, isPublished }` |
| `GET /cms/revisions/{code}/diff?against=` | content:read | | `{ revision, against, isNew, changes:[{ path, kind:'added'\|'removed'\|'changed', old, new }] }` |
| `GET /cms/revisions/{code}/comments` | content:read | | `{ items:[…], openCount }` |
| `POST /cms/revisions/{code}/comments` | content:read | `{ body, anchor?, parentCode? }` | → `{ code }`. 400 `CONTENT_COMMENT_INVALID`. |
| `POST /cms/revisions/{code}/assign` | content:review | `{ reviewerCode }` | 400 `CONTENT_TAXONOMY_UNKNOWN`. |
| `POST /cms/revisions/{code}/decision` | content:review | `{ decision:'approve'\|'request_changes'\|'reject', note? }` | `note` approve dışında zorunlu (400 `CONTENT_DECISION_INVALID`). **Yazar kendi revizyonunu onaylayamaz** (409 `CONTENT_REVIEW_SELF_APPROVAL`). Onayda madde yayımlanır (önbellek temizlenir). 409 `CONTENT_REVISION_NOT_PENDING`. |
| `POST /cms/comments/{code}/resolve` | content:read | `{ resolved?=true }` | |

## CMS: hata bildirimleri
| Uç | İzin | Not |
|---|---|---|
| `GET /cms/reports?status=&reason=&itemCode=&page=&pageSize=` (varsayılan `status=open,in_review`) | content:report:manage | `{ items:[{ code, reason, note, context, status:'open'\|'in_review'\|'resolved'\|'rejected', createdAt, resolvedAt, resolutionNote, item:{ code, kind, title, status, revisionNo, preview, openReportCount }, reporter:{ code, displayName }, resolvedBy }], page, pageSize, total }` |
| `GET /cms/reports/{code}` | content:report:manage | tek bildirim. 404 `CONTENT_REPORT_NOT_FOUND`. |
| `POST /cms/reports/{code}/resolve` | content:report:manage | `{ status?:'resolved'\|'rejected'\|'in_review' (varsayılan resolved), note (in_review dışında zorunlu), notify?=true }` → bildirim. Kapatılınca bildirene kuyruk bildirimi gider (`notify:false` ile kapatılır). 409 `CONTENT_REPORT_ALREADY_RESOLVED`. |

## CMS: yapay zekâ taslakları
| Uç | İzin | Not |
|---|---|---|
| `POST /cms/generation-jobs` | content:generate | `{ kind?:'question', questionTypeKey (zorunlu), count?(1–50, varsayılan 5), skillKeys?:[str], examKey?='yds', difficulty?(1–5, varsayılan 3), topic?, instructions?, language?='en', accessTier?, subjectAreaKey? }` → iş (`status:'queued'`). 400 `CONTENT_JOB_INVALID{field}`. İşi dakikalık cron işler (tutor `internal/ai/complete`; `OPENROUTER_API_KEY` yoksa iş `failed` olur). |
| `GET /cms/generation-jobs?status=&page=`, `GET /cms/generation-jobs/{code}` | content:read | `{ items, page, pageSize, total }` / iş ayrıntısı (`status: queued\|running\|completed\|failed\|canceled`, taslak maddeler). 404 `CONTENT_JOB_NOT_FOUND`. |
| `POST /cms/generation-jobs/{code}/cancel` | content:generate | 409 `CONTENT_JOB_NOT_ACTIVE`. |
| `POST /cms/generation-jobs/{code}/drafts/{itemCode}/accept` \| `/reject` | content:generate | reject: `{ note? }`. Kabul edilen taslak normal inceleme akışına girer. 400 `CONTENT_DRAFT_NOT_FROM_JOB`. |
| `POST /cms/item-stats/refresh` | content:review | learning cevaplarından `item_stat` yeniler → `{ changed }` (gece 03:30 cron da yapar). |

## Hata kodları
`CONTENT_TRACK_NOT_FOUND`, `CONTENT_SESSION_NOT_FOUND`, `CONTENT_ARTICLE_NOT_FOUND`, `CONTENT_VOCAB_NOT_FOUND`, `CONTENT_NOTE_NOT_FOUND`, `CONTENT_WORD_REQUIRED`, `CONTENT_REPORT_INVALID`, `CONTENT_REPORT_NOT_FOUND`, `CONTENT_REPORT_ALREADY_RESOLVED`, `CONTENT_ITEM_NOT_FOUND`, `CONTENT_ITEM_RETIRED`, `CONTENT_KIND_INVALID`, `CONTENT_BODY_INVALID`, `CONTENT_VALIDATION_FAILED`, `CONTENT_SLUG_CONFLICT`, `CONTENT_VOCAB_DUPLICATE`, `CONTENT_TAXONOMY_UNKNOWN`, `CONTENT_BULK_INVALID`, `CONTENT_FORBIDDEN`, `CONTENT_REVISION_NOT_FOUND`, `CONTENT_REVISION_NOT_EDITABLE`, `CONTENT_REVISION_NOT_SUBMITTABLE`, `CONTENT_REVISION_NOT_PENDING`, `CONTENT_REVISION_ALREADY_OPEN`, `CONTENT_REVISION_IN_REVIEW`, `CONTENT_REVIEW_SELF_APPROVAL`, `CONTENT_DECISION_INVALID`, `CONTENT_COMMENT_INVALID`, `CONTENT_COMMENT_NOT_FOUND`, `CONTENT_AUTOFILL_INVALID`, `CONTENT_AUTOFILL_NO_BLUEPRINT`, `CONTENT_JOB_INVALID`, `CONTENT_JOB_NOT_FOUND`, `CONTENT_JOB_NOT_ACTIVE`, `CONTENT_DRAFT_NOT_FROM_JOB`; ortak: `PERMISSION_DENIED` (403, `details.required`), `TOKEN_MISSING` (401).

## Önbellek ve diğer servisler
- Public iz yanıtı Redis'te `content:public-track:v{ver}:{key}` (1 sa); paylaşılan öğrenci kataloğu (`app-shared getTrackCatalog`) ise `content:catalog:v{ver}:{key}` anahtarındadır — iki anahtar kümesi farklı şekil taşır, birbirine karıştırılmaz. Bu servisin yayımlanmış madde DTO'su `content:svc-item:{code}:pub` anahtarındadır (paylaşılan okuyucunun `content:item:{code}:pub` anahtarı farklı şekil taşır; karıştırılmaz). Yayın/emeklilik her iki önbelleği ve sürümü (`content:catalog:ver`) günceller.
- learning, soru gövdesini `app-shared` içindeki `content-read` katmanından okur (yalnız yayımlanmış revizyon, doğru şık dahil; istemciye ham gitmez).
