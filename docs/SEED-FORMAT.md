# Seed içerik biçimi (db-schemas/seed/yds/)

`npm run seed` (`scripts/seed/index.mjs`) bu klasördeki JSON dosyalarını okur; idempotent (doğal anahtar `item_external_ref` / `*_key`). Tüm içerik **özgün** yazılır (ÖSYM sorusu kopyalanmaz), YDS düzeyinde akademik İngilizce, doğru şık dağılımı dengeli (A–E eşit), çeldiriciler inandırıcı. Her içerik `origin=seed`, durum `published`, `access_tier` çoğunlukla `free`, yaklaşık %30'u `premium`. Türkçe metinler sakin, suçlamayan, "sen" hitabıyla.

## Dosyalar
| Dosya | İçerik |
|---|---|
| `taxonomy.json` | (core seed ajanı) sınavlar, izler, oturumlar, blueprint, soru tipleri, beceri ağacı, hedef çipleri/nedenleri, rubrikler, kategoriler |
| `questions-<grup>.json` | `{ "questions": [ Q… ] }` — tek cümle soruları |
| `passages-<grup>.json` | `{ "passages": [ P… ] }` — metin + sorular (okuma, cloze, paragraf) |
| `notes.json` | `{ "notes": [ N… ] }` hap notlar |
| `vocab.json` | `{ "entries": [ V… ], "decks": [ D… ] }` |
| `translation.json` | `{ "prompts": [ T… ] }` çeviri koçu cümleleri |
| `articles.json` | `{ "articles": [ A… ], "authors": [...] }` blog/rehber/yardım |
| `legal.json` | `{ "documents": [ L… ] }` yasal metin taslakları |
| `tutor.json` | `{ "starters": [ … ] }` |

## Q (soru) — `ref` benzersiz, kalıcı (ör. `q-grammar-0001`)
```json
{ "ref": "q-grammar-0001", "type": "grammar", "skills": ["grammar.conjunctions.contrast"], "difficulty": 3,
  "stem": "______ the new vaccine proved effective in early trials, regulators delayed its approval until long-term safety data became available.",
  "options": { "A": "Unless", "B": "Although", "C": "Because", "D": "As long as", "E": "Once" },
  "correct": "B",
  "rationale": { "A": "…neden yanlış (Türkçe, 1 cümle)", "C": "…", "D": "…", "E": "…" },
  "shortReason": "Doğru. 'Although' zıtlık kurdu.",
  "explanation": "Beklentiye ters sonuç zıtlık ister: Although. …(2-4 cümle Türkçe çözüm)",
  "hints": [ { "kind": "focus", "body": "İki kısım arasında neden–sonuç mu var, zıtlık mı?" },
             { "kind": "rule", "body": "…" },
             { "kind": "eliminate", "body": "…", "eliminates": ["A", "D"] },
             { "kind": "solution", "body": "…" } ],
  "tier": "free", "area": null, "estimatedSeconds": 60 }
```
- `type`: soru tipi anahtarı (docs/SERVICE-GUIDE.md §7). `skills`: beceri anahtarları; ilki birincil. `area`: `health|science|social|null` (konu alanı; `content.subject_area`). Tek cümle tiplerinde kök `______` ile boşluklu; diyalog sorusunda kök `A: … / B: ______` biçiminde satırlar (`\n` ile); `restatement` kökü ana cümle; `translation` kökü İngilizce cümle, seçenekler Türkçe.
- `eliminate` ipucundaki `eliminates` iki **yanlış** şıkkı listeler.

## P (metin grubu)
```json
{ "ref": "p-reading-0001", "passageKind": "reading|cloze|paragraph", "title": "Sleep and memory", "area": "health", "difficulty": 3,
  "body": "…metin… (cloze'da boşluklar {{1}} … {{5}}; paragraph/irrelevant_sentence'ta cümleler [[I]] … [[V]] işaretli)",
  "terms": [ { "term": "consolidation", "definitionTr": "pekişme, kalıcılaşma" } ],
  "source": "original", "license": "original",
  "questions": [ { …Q alanları, "ref": "q-reading-0001-1", "type": "reading", "readingKind": "main_idea|inference|detail|vocabulary_in_context|author_attitude", "blankNo": 1 (yalnız cloze) } ] }
```
Okuma metni 150–260 kelime, 4 soru; cloze 5 boşluk/5 soru; `paragraph_completion` ve `irrelevant_sentence` için `passageKind: "paragraph"` ve her metinde 1 soru (`type` ile ayırt edilir; irrelevant_sentence'ta cümleler [[I]]–[[V]] numaralı ve şıklar A=I … E=V).

## N (hap not)
```json
{ "ref": "n-conj-contrast", "title": "Zıtlık bağlaçları", "kind": "skill|strategy", "skills": ["grammar.conjunctions.contrast"], "questionType": null,
  "readingSeconds": 90, "ruleMd": "…Türkçe, kısa, markdown…", "examples": [ { "en": "…", "tr": "…" } ], "trapMd": "…",
  "summary": "…", "tier": "free",
  "checks": [ { …Q alanları (iki ya da beş şık), "ref": "q-note-conj-contrast-1" } ] }
```
`kind: "strategy"` notlarda `questionType` o soru tipinin anahtarıdır (soru tipi stratejisi; `question_type.strategy_note_item_id` buna bağlanır). Her soru tipi için bir strateji notu + her ana beceri için en az bir beceri notu yaz (toplam ~24).

## V (kelime) / D (deste)
```json
{ "ref": "v-replicate", "headword": "replicate", "pos": "verb", "ipa": "/ˈreplɪkeɪt/",
  "meanings": [ { "tr": "kopyalamak; (deneyi) yeniden yapmak", "note": null } ],
  "examples": [ { "en": "…", "tr": "…", "examStyle": true } ], "collocations": ["replicate a study"], "synonyms": ["reproduce"], "antonyms": [], "confusables": [], "rank": 120, "tier": "free" }
{ "key": "yds-frequent", "name": "YDS'de sık çıkanlar", "description": "…", "newPerDay": 10, "tier": "free", "entries": ["v-replicate", "…"] }
```
`pos`: noun|verb|adjective|adverb|phrasal_verb|conjunction|preposition|idiom|collocation. Desteler: `yds-frequent` (≥180 kelime), `phrasal-verbs` (≥60), `connectors` (≥40), `academic` (≥120). Her kelime tek bir değişmez `ref`.

## T (çeviri istemi) / A (makale) / L (yasal)
```json
{ "ref": "t-0001", "source": "Despite decades of research, …", "reference": "Onlarca yıllık araştırmaya rağmen …", "difficulty": 3, "keyPoints": ["despite → rağmen", "…"], "area": "science", "tier": "free" }
{ "ref": "a-yds-rehberi", "type": "guide|blog|help", "category": "yds", "slug": "yds-sinav-rehberi", "title": "…", "excerpt": "…", "bodyMd": "…", "readingMinutes": 8, "author": "ekip", "seoTitle": "…", "seoDescription": "…", "ctaKey": "landing.cta.diagnostic" }
{ "type": "kvkk_notice", "locale": "tr", "version": "2026-10-draft", "title": "…", "summaryMd": "…", "bodyMd": "…" }
```
Blog kategorileri: `yds`, `yokdil`, `strateji`, `kelime`; yardım kategorileri: `hesap`, `odeme`, `plan`, `ogretmen`, `sinav-bilgisi`. Yasal türler: `kvkk_notice`, `privacy_policy`, `terms_of_use`, `cookie_policy`, `pre_information`, `distance_sales`, `cancellation_refund`, `marketing_consent_text`; hepsinin başına "TASLAK — hukuk onayı bekliyor" notu.
