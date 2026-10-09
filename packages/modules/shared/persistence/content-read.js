import datasources from 'app-datasource';
import { rawQuery } from './tx.js';

// İçerik okuma katmanı (PLAN §3 Redis 10–12). Yalnızca YAYIMLANMIŞ revizyon okunur.
//  • Redis 10  `content:catalog:ver`                 → katalog sürümü (content paket değişiminde INCR)
//  • Redis 11  `content:catalog:v{ver}:{trackKey}`   → iz + blueprint + bölümler + soru tipleri + beceri ağacı (1 sa)
//  • Redis 12  `content:item:{itemCode}:pub`         → yayımlanmış soru/not DTO'su, doğru şık DAHİL (24 sa)
// DTO'lar istemciye ham gitmez; servisler `isCorrect`, `rationale`, `explanation`, ipucu gövdelerini
// yalnızca uygun anda (cevap sonrası / çözüm) açar. Asıl kaynak her zaman Postgres.

const redis = () => datasources.coreAppRedis?.client;
const CATALOG_TTL = 3600;
const ITEM_TTL = 24 * 3600;
const itemKey = (code) => `content:item:${code}:pub`;
const num = (v) => (v === null || v === undefined ? null : Number(v));

export const getCatalogVersion = async () => {
  try {
    return Number((await redis()?.get('content:catalog:ver')) || 1);
  } catch {
    return 1;
  }
};

// ── Katalog ─────────────────────────────────────────────────────────────────
const trackKeyMemo = new Map();
const resolveTrackKey = async ({ trackId, trackCode }) => {
  const mk = `${trackId || ''}:${trackCode || ''}`;
  if (trackKeyMemo.has(mk)) return trackKeyMemo.get(mk);
  const { rows } = await rawQuery(
    trackId ? 'SELECT exam_track_key AS key FROM content.exam_track WHERE exam_track_id=$1' : 'SELECT exam_track_key AS key FROM content.exam_track WHERE exam_track_code=$1',
    [trackId || trackCode],
  );
  const key = rows[0]?.key || null;
  if (key) trackKeyMemo.set(mk, key);
  return key;
};

const buildCatalog = async (trackKey) => {
  const { rows: tr } = await rawQuery(
    `SELECT t.exam_track_id AS id, t.exam_track_code AS code, t.exam_track_key AS key, t.exam_track_name AS name, t.exam_track_delivery_mode AS "deliveryMode",
            t.exam_track_content_language AS "contentLanguage", t.exam_track_status AS status, t.exam_track_notice AS notice, t.exam_track_fallback_track_id AS "fallbackTrackId",
            t.exam_track_subject_area_id AS "subjectAreaId", t.exam_track_is_default AS "isDefault",
            e.exam_id AS "examId", e.exam_code AS "examCode", e.exam_key AS "examKey", e.exam_name AS "examName", e.exam_short_name AS "examShortName"
       FROM content.exam_track t JOIN content.exam e ON e.exam_id = t.exam_track_exam_id WHERE t.exam_track_key=$1`, [trackKey]);
  if (!tr[0]) return null;
  const t = tr[0];
  // İçerik havuzu: iz kendi sınavı; yedek iz varsa onun sınavı (YÖKDİL → YDS içeriği).
  let contentTrackId = Number(t.id);
  let poolExamIds = [Number(t.examId)];
  if (t.fallbackTrackId) {
    const { rows: fb } = await rawQuery('SELECT exam_track_exam_id AS "examId" FROM content.exam_track WHERE exam_track_id=$1', [t.fallbackTrackId]);
    if (fb[0]) poolExamIds = [...new Set([...poolExamIds, Number(fb[0].examId)])];
    contentTrackId = Number(t.fallbackTrackId);
  }
  // Blueprint: izin kendisinin etkin blueprint'i, yoksa yedek izinki.
  const { rows: bp } = await rawQuery(
    `SELECT b.blueprint_id AS id, b.blueprint_code AS code, b.blueprint_version_no AS "versionNo", b.blueprint_name AS name, b.blueprint_question_count AS "questionCount",
            b.blueprint_duration_seconds AS "durationSeconds", b.blueprint_options_per_question AS "optionsPerQuestion", b.blueprint_scoring_method AS "scoringMethod",
            b.blueprint_scoring_params AS "scoringParams", b.blueprint_score_min::float8 AS "scoreMin", b.blueprint_score_max::float8 AS "scoreMax", b.blueprint_track_id AS "trackId"
       FROM content.blueprint b WHERE b.blueprint_track_id = ANY($1) AND b.blueprint_is_active ORDER BY (b.blueprint_track_id = $2) DESC LIMIT 1`, [[Number(t.id), contentTrackId], Number(t.id)]);
  const blueprint = bp[0] ? { ...bp[0], id: Number(bp[0].id), code: Number(bp[0].code) } : null;
  let sections = [];
  if (blueprint) {
    const { rows } = await rawQuery(
      `SELECT s.blueprint_section_position AS position, s.blueprint_section_question_type_id AS "questionTypeId", s.blueprint_section_question_count AS "questionCount",
              s.blueprint_section_first_question_no AS "firstQuestionNo", s.blueprint_section_last_question_no AS "lastQuestionNo",
              s.blueprint_section_label_override AS "labelOverride", s.blueprint_section_target_seconds_per_question AS "targetSecondsPerQuestion", s.blueprint_section_code AS code
         FROM content.blueprint_section s WHERE s.blueprint_section_blueprint_id=$1 ORDER BY s.blueprint_section_position`, [blueprint.id]);
    sections = rows.map((r) => ({ ...r, questionTypeId: Number(r.questionTypeId), code: Number(r.code) }));
  }
  const { rows: qts } = await rawQuery(
    `SELECT question_type_id AS id, question_type_code AS code, question_type_key AS key, question_type_name AS name, question_type_short_name AS "shortName",
            question_type_question_format AS format, question_type_icon_key AS "iconKey", question_type_default_target_seconds AS "defaultTargetSeconds",
            question_type_sort_order AS "sortOrder", question_type_strategy_note_item_id AS "strategyNoteItemId", question_type_description AS description
       FROM content.question_type WHERE question_type_is_active ORDER BY question_type_sort_order, question_type_id`);
  const questionTypes = qts.map((r) => ({ ...r, id: Number(r.id), code: Number(r.code), strategyNoteItemId: num(r.strategyNoteItemId) }));
  const { rows: sk } = await rawQuery(
    `SELECT skill_id AS id, skill_code AS code, skill_key AS key, skill_name AS name, skill_path AS path, skill_parent_id AS "parentId", skill_depth AS depth,
            skill_exam_id AS "examId", skill_sort_order AS "sortOrder", skill_description AS description
       FROM content.skill WHERE skill_is_active AND (skill_exam_id IS NULL OR skill_exam_id = ANY($1)) ORDER BY skill_sort_order, skill_path`, [poolExamIds]);
  const skills = sk.map((r) => ({ ...r, id: Number(r.id), code: Number(r.code), parentId: num(r.parentId), examId: num(r.examId) }));
  const { rows: qs } = await rawQuery('SELECT question_type_skill_question_type_id AS "questionTypeId", question_type_skill_skill_id AS "skillId", question_type_skill_sort_order AS "sortOrder" FROM content.question_type_skill ORDER BY question_type_skill_sort_order');
  const questionTypeSkills = qs.map((r) => ({ questionTypeId: Number(r.questionTypeId), skillId: Number(r.skillId), sortOrder: r.sortOrder }));
  const { rows: gp } = await rawQuery('SELECT goal_preset_target_score::float8 AS "targetScore", goal_preset_label AS label, goal_preset_description AS description, goal_preset_is_default AS "isDefault" FROM content.goal_preset WHERE goal_preset_exam_id = ANY($1) ORDER BY goal_preset_sort_order', [poolExamIds]);
  const { rows: gr } = await rawQuery('SELECT goal_reason_id AS id, goal_reason_code AS code, goal_reason_key AS key, goal_reason_label AS label FROM content.goal_reason WHERE goal_reason_exam_id IS NULL OR goal_reason_exam_id = ANY($1) ORDER BY goal_reason_sort_order', [poolExamIds]);
  return {
    track: {
      id: Number(t.id), code: Number(t.code), key: t.key, name: t.name, deliveryMode: t.deliveryMode, contentLanguage: t.contentLanguage, status: t.status, notice: t.notice,
      fallbackTrackId: num(t.fallbackTrackId), subjectAreaId: num(t.subjectAreaId), contentTrackId, isDefault: t.isDefault,
    },
    exam: { id: Number(t.examId), code: Number(t.examCode), key: t.examKey, name: t.examName, shortName: t.examShortName },
    poolExamIds, blueprint, sections, questionTypes, skills, questionTypeSkills,
    goalPresets: gp, goalReasons: gr.map((r) => ({ ...r, id: Number(r.id), code: Number(r.code) })),
  };
};

/** Redis 11 read-through. Seçici: { trackKey } | { trackId } | { trackCode }. İz yoksa null. */
export const getTrackCatalog = async (sel) => {
  const trackKey = typeof sel === 'string' ? sel : sel.trackKey || (await resolveTrackKey(sel));
  if (!trackKey) return null;
  const r = redis();
  const ver = await getCatalogVersion();
  const key = `content:catalog:v${ver}:${trackKey}`;
  try {
    const hit = r ? await r.get(key) : null;
    if (hit) return JSON.parse(hit);
  } catch { /* Postgres'e düş */ }
  const value = await buildCatalog(trackKey);
  if (value && r) {
    try { await r.set(key, JSON.stringify(value), 'EX', CATALOG_TTL); } catch { /* best-effort */ }
  }
  return value;
};

/** Beceri anahtarının (ya da kodunun) torunlarıyla birlikte id listesi (path öneki). */
export const expandSkillIds = (catalog, skillIds) => {
  const picked = catalog.skills.filter((s) => skillIds.includes(s.id));
  const out = new Set(skillIds);
  for (const p of picked) for (const s of catalog.skills) if (s.path === p.path || s.path.startsWith(`${p.path}.`)) out.add(s.id);
  return [...out];
};

// ── Soru / not DTO'ları ─────────────────────────────────────────────────────
const codeMemo = new Map(); // itemId → itemCode (değişmez)

const itemCodes = async (itemIds) => {
  const out = new Map();
  const missing = [];
  for (const id of itemIds) {
    if (codeMemo.has(id)) out.set(id, codeMemo.get(id));
    else missing.push(id);
  }
  if (missing.length) {
    const { rows } = await rawQuery('SELECT item_id AS id, item_code AS code FROM content.item WHERE item_id = ANY($1)', [missing]);
    for (const r of rows) {
      codeMemo.set(Number(r.id), Number(r.code));
      out.set(Number(r.id), Number(r.code));
    }
  }
  return out;
};

const passageCache = new Map();

const loadPassages = async (passageItemIds) => {
  const out = new Map();
  const ids = [...new Set(passageItemIds.filter(Boolean).map(Number))];
  if (!ids.length) return out;
  const { rows } = await rawQuery(
    `SELECT i.item_id AS "itemId", i.item_code AS "itemCode", p.passage_id AS "passageId", p.passage_passage_kind AS kind, p.passage_title AS title, p.passage_body AS body,
            p.passage_body_format AS "bodyFormat", p.passage_word_count AS "wordCount"
       FROM content.item i JOIN content.passage p ON p.passage_item_revision_id = i.item_published_revision_id
      WHERE i.item_id = ANY($1)`, [ids]);
  const pids = rows.map((r) => Number(r.passageId));
  const { rows: terms } = pids.length
    ? await rawQuery('SELECT passage_term_passage_id AS "passageId", passage_term_term AS term, passage_term_definition_tr AS "definitionTr" FROM content.passage_term WHERE passage_term_passage_id = ANY($1) ORDER BY passage_term_id', [pids])
    : { rows: [] };
  for (const r of rows) {
    out.set(Number(r.itemId), {
      itemId: Number(r.itemId), itemCode: Number(r.itemCode), kind: r.kind, title: r.title, body: r.body, bodyFormat: r.bodyFormat, wordCount: r.wordCount,
      terms: terms.filter((t) => Number(t.passageId) === Number(r.passageId)).map((t) => ({ term: t.term, definitionTr: t.definitionTr })),
    });
  }
  return out;
};

/** Veritabanından soru DTO'ları. Seçici: { itemIds } (yayımlanmış revizyon) | { questionIds } (kesin revizyon gövdesi). */
const loadQuestionsFromDb = async ({ itemIds, questionIds }) => {
  const byQ = !!questionIds;
  const { rows } = await rawQuery(
    `SELECT i.item_id AS "itemId", i.item_code AS "itemCode", i.item_access_tier AS "accessTier", i.item_language AS language, i.item_status AS "itemStatus",
            q.question_id AS "questionId", q.question_code AS "questionCode", q.question_stem AS stem, q.question_stem_format AS "stemFormat", q.question_difficulty AS difficulty,
            q.question_estimated_seconds AS "estimatedSeconds", q.question_short_reason AS "shortReason", q.question_explanation AS explanation,
            q.question_reading_question_kind AS "readingQuestionKind", q.question_group_position AS "groupPosition", q.question_blank_no AS "blankNo",
            q.question_passage_item_id AS "passageItemId", q.question_question_type_id AS "questionTypeId",
            qt.question_type_key AS "typeKey", qt.question_type_name AS "typeName", qt.question_type_question_format AS "typeFormat", qt.question_type_code AS "typeCode",
            r.item_revision_revision_no AS "revisionNo"
       FROM content.question q
       JOIN content.item_revision r ON r.item_revision_id = q.question_item_revision_id
       JOIN content.item i ON i.item_id = r.item_revision_item_id
       JOIN content.question_type qt ON qt.question_type_id = q.question_question_type_id
      WHERE ${byQ ? 'q.question_id = ANY($1)' : "i.item_id = ANY($1) AND i.item_published_revision_id = q.question_item_revision_id AND i.item_status = 'published'"}`,
    [byQ ? questionIds : itemIds]);
  if (!rows.length) return [];
  const qids = rows.map((r) => Number(r.questionId));
  const iids = rows.map((r) => Number(r.itemId));
  const [{ rows: opts }, { rows: hints }, { rows: skills }, passages] = await Promise.all([
    rawQuery('SELECT question_option_question_id AS "questionId", question_option_label AS label, question_option_position AS position, question_option_text AS text, question_option_is_correct AS "isCorrect", question_option_rationale AS rationale FROM content.question_option WHERE question_option_question_id = ANY($1) ORDER BY question_option_position', [qids]),
    rawQuery('SELECT question_hint_question_id AS "questionId", question_hint_step_no AS "stepNo", question_hint_hint_kind AS kind, question_hint_body AS body, question_hint_eliminates_labels AS "eliminatesLabels" FROM content.question_hint WHERE question_hint_question_id = ANY($1) ORDER BY question_hint_step_no', [qids]),
    rawQuery('SELECT s.item_skill_item_id AS "itemId", s.item_skill_skill_id AS "skillId", s.item_skill_weight::float8 AS weight, s.item_skill_is_primary AS "isPrimary", k.skill_key AS key FROM content.item_skill s JOIN content.skill k ON k.skill_id = s.item_skill_skill_id WHERE s.item_skill_item_id = ANY($1)', [iids]),
    loadPassages(rows.map((r) => r.passageItemId)),
  ]);
  return rows.map((r) => {
    const options = opts.filter((o) => Number(o.questionId) === Number(r.questionId)).map((o) => ({ label: o.label, position: o.position, text: o.text, isCorrect: o.isCorrect, rationale: o.rationale }));
    return {
      kind: 'question', itemId: Number(r.itemId), itemCode: Number(r.itemCode), questionId: Number(r.questionId), questionCode: Number(r.questionCode), revisionNo: r.revisionNo,
      accessTier: r.accessTier, language: r.language, itemStatus: r.itemStatus,
      questionType: { id: Number(r.questionTypeId), code: Number(r.typeCode), key: r.typeKey, name: r.typeName, format: r.typeFormat },
      difficulty: r.difficulty, estimatedSeconds: r.estimatedSeconds, stem: r.stem, stemFormat: r.stemFormat, readingQuestionKind: r.readingQuestionKind,
      groupPosition: r.groupPosition, blankNo: r.blankNo, shortReason: r.shortReason, explanation: r.explanation,
      options, correctLabel: options.find((o) => o.isCorrect)?.label || null,
      hints: hints.filter((h) => Number(h.questionId) === Number(r.questionId)).map((h) => ({ stepNo: h.stepNo, kind: h.kind, body: h.body, eliminatesLabels: h.eliminatesLabels || [] })),
      passage: r.passageItemId ? passages.get(Number(r.passageItemId)) || null : null,
      skills: skills.filter((s) => Number(s.itemId) === Number(r.itemId)).map((s) => ({ id: Number(s.skillId), key: s.key, weight: s.weight, isPrimary: s.isPrimary })),
    };
  });
};

/** Yayımlanmış soru DTO'ları (Redis 12). → Map<itemId, dto>. Yayımda olmayan maddeler haritada yer almaz. */
export const getPublishedQuestionDtos = async (itemIds) => {
  const ids = [...new Set(itemIds.map(Number))];
  const out = new Map();
  if (!ids.length) return out;
  const codes = await itemCodes(ids);
  const r = redis();
  let missing = ids;
  if (r) {
    try {
      const keys = ids.map((id) => itemKey(codes.get(id)));
      const hits = await r.mget(keys);
      missing = [];
      ids.forEach((id, i) => {
        if (hits[i]) {
          const dto = JSON.parse(hits[i]);
          if (dto.kind === 'question') out.set(id, dto);
          else missing.push(id);
        } else missing.push(id);
      });
    } catch { missing = ids.filter((id) => !out.has(id)); }
  }
  if (missing.length) {
    const dtos = await loadQuestionsFromDb({ itemIds: missing });
    for (const d of dtos) {
      out.set(d.itemId, d);
      if (r) { try { await r.set(itemKey(d.itemCode), JSON.stringify(d), 'EX', ITEM_TTL); } catch { /* best-effort */ } }
    }
  }
  return out;
};

/**
 * Oturum maddeleri için DTO: kesin `questionId` gövdesi. Önbellekteki yayımlanmış DTO aynı soru
 * gövdesiyse kullanılır; revizyon değiştiyse (ya da emekli) doğrudan veritabanından okunur.
 * `pairs`: [{ itemId, questionId }] → Map<questionId, dto>
 */
export const getQuestionDtosForPairs = async (pairs) => {
  const out = new Map();
  if (!pairs.length) return out;
  const pub = await getPublishedQuestionDtos(pairs.map((p) => p.itemId));
  const rest = [];
  for (const p of pairs) {
    const d = pub.get(Number(p.itemId));
    if (d && d.questionId === Number(p.questionId)) out.set(Number(p.questionId), d);
    else rest.push(Number(p.questionId));
  }
  if (rest.length) for (const d of await loadQuestionsFromDb({ questionIds: rest })) out.set(d.questionId, d);
  return out;
};

export const getQuestionDto = async ({ itemId, questionId }) => (await getQuestionDtosForPairs([{ itemId, questionId }])).get(Number(questionId)) || null;

/** Yayımlanmış hap not DTO'su (Redis 12). `ref`: { itemCode } | { itemId }. Yoksa null. */
export const getPublishedNoteDto = async (ref) => {
  const r = redis();
  let itemCode = ref.itemCode ? Number(ref.itemCode) : null;
  if (!itemCode && ref.itemId) itemCode = (await itemCodes([Number(ref.itemId)])).get(Number(ref.itemId));
  if (itemCode && r) {
    try {
      const hit = await r.get(itemKey(itemCode));
      if (hit) {
        const d = JSON.parse(hit);
        if (d.kind === 'note') return d;
      }
    } catch { /* Postgres'e düş */ }
  }
  const { rows } = await rawQuery(
    `SELECT i.item_id AS "itemId", i.item_code AS "itemCode", i.item_access_tier AS "accessTier", i.item_language AS language,
            n.note_id AS "noteId", n.note_note_kind AS "noteKind", n.note_title AS title, n.note_reading_seconds AS "readingSeconds", n.note_rule_md AS "ruleMd",
            n.note_examples AS examples, n.note_trap_md AS "trapMd", n.note_summary AS summary
       FROM content.item i JOIN content.note n ON n.note_item_revision_id = i.item_published_revision_id
      WHERE i.item_kind='note' AND i.item_status='published' AND ${ref.itemId ? 'i.item_id=$1' : 'i.item_code=$1'}`, [ref.itemId ? Number(ref.itemId) : itemCode]);
  if (!rows[0]) return null;
  const n = rows[0];
  const [{ rows: checks }, { rows: skills }] = await Promise.all([
    rawQuery('SELECT c.note_check_question_position AS position, c.note_check_question_question_item_id AS "itemId", i.item_code AS "itemCode" FROM content.note_check_question c JOIN content.item i ON i.item_id = c.note_check_question_question_item_id WHERE c.note_check_question_note_id=$1 ORDER BY c.note_check_question_position', [n.noteId]),
    rawQuery('SELECT s.item_skill_skill_id AS "skillId", s.item_skill_weight::float8 AS weight, s.item_skill_is_primary AS "isPrimary", k.skill_key AS key, k.skill_name AS name FROM content.item_skill s JOIN content.skill k ON k.skill_id = s.item_skill_skill_id WHERE s.item_skill_item_id=$1', [n.itemId]),
  ]);
  const dto = {
    kind: 'note', itemId: Number(n.itemId), itemCode: Number(n.itemCode), noteId: Number(n.noteId), noteKind: n.noteKind, accessTier: n.accessTier, language: n.language,
    title: n.title, readingSeconds: n.readingSeconds, ruleMd: n.ruleMd, examples: n.examples || [], trapMd: n.trapMd, summary: n.summary,
    checks: checks.map((c) => ({ position: c.position, itemId: Number(c.itemId), itemCode: Number(c.itemCode) })),
    skills: skills.map((s) => ({ id: Number(s.skillId), key: s.key, name: s.name, weight: s.weight, isPrimary: s.isPrimary })),
  };
  if (r) { try { await r.set(itemKey(dto.itemCode), JSON.stringify(dto), 'EX', ITEM_TTL); } catch { /* best-effort */ } }
  return dto;
};

/** İstemciye giden güvenli (doğru şık/gerekçe içermeyen) soru gövdesi. */
export const publicQuestionView = (dto, { optionOrder = null } = {}) => {
  let opts = dto.options;
  if (optionOrder?.length) opts = optionOrder.map((l) => dto.options.find((o) => o.label === l)).filter(Boolean);
  return {
    itemCode: dto.itemCode,
    questionType: { key: dto.questionType.key, name: dto.questionType.name, format: dto.questionType.format },
    readingQuestionKind: dto.readingQuestionKind, stem: dto.stem, stemFormat: dto.stemFormat, blankNo: dto.blankNo, groupPosition: dto.groupPosition,
    estimatedSeconds: dto.estimatedSeconds,
    options: opts.map((o) => ({ label: o.label, text: o.text })),
  };
};

export const invalidateItemCache = async (itemCode) => {
  try { await redis()?.del(itemKey(itemCode)); } catch { /* best-effort */ }
};
