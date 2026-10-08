import { DomainError } from 'app-shared';
import { stripRow, num, normalizeHeadword, iso } from './helpers.js';

// Gövde tabloları: her tür için yükleme (DB → camelCase gövde), kaydetme (gövde → DB, bir revizyona 1:1) ve doğrulama.
// `q` = (sql, params) => Promise<{rows}> (rawQuery ya da tx.query). `ctx` = { tenantCode, organizationId, userId }.

export const KINDS = ['question', 'passage', 'note', 'vocab_entry', 'translation_prompt', 'exam_form', 'article'];
const HINT_KINDS = ['focus', 'rule', 'eliminate', 'solution'];
const TEXT_FORMATS = ['plain', 'markdown'];
const READING_KINDS = ['main_idea', 'inference', 'detail', 'vocabulary_in_context', 'author_attitude'];
const PASSAGE_KINDS = ['reading', 'cloze', 'paragraph'];
const NOTE_KINDS = ['skill', 'strategy'];
const POS = ['noun', 'verb', 'adjective', 'adverb', 'phrasal_verb', 'conjunction', 'preposition', 'idiom', 'collocation'];
const FORM_TYPES = ['full', 'mini', 'question_type_drill'];
const ARTICLE_TYPES = ['blog', 'guide', 'help'];
const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const J = (v) => JSON.stringify(v ?? null);
const bad = (field, message) => { throw new DomainError('CONTENT_BODY_INVALID', message, { field }); };
const str = (v) => (v === undefined || v === null ? null : String(v));
const arr = (v) => (Array.isArray(v) ? v : []);
const oneOf = (field, v, list) => { if (!list.includes(v)) bad(field, `${field} must be one of ${list.join(', ')}`); return v; };
const intOr = (v, d = null) => { if (v === undefined || v === null || v === '') return d; const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : d; };

const ins = async (q, ctx, table, data) => {
  const cols = [`${table}_tenant_code`, `${table}_organization_id`, `${table}_created_by`, `${table}_updated_by`];
  const vals = [ctx.tenantCode, ctx.organizationId, ctx.userId, ctx.userId];
  for (const [k, v] of Object.entries(data)) { cols.push(`${table}_${k}`); vals.push(v); }
  const r = await q(`INSERT INTO content.${table} (${cols.join(',')}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(',')}) RETURNING ${table}_id AS id`, vals);
  return r.rows[0].id;
};

const idOfKey = async (q, ctx, table, keyCol, value, field) => {
  if (!value) return null;
  const { rows } = await q(`SELECT ${table}_id AS id FROM content.${table} WHERE ${table}_${keyCol} = $1 AND ${table}_tenant_code = $2`, [value, ctx.tenantCode]);
  if (!rows.length) throw new DomainError('CONTENT_TAXONOMY_UNKNOWN', `Unknown ${field}: ${value}`, { field, value });
  return rows[0].id;
};
const itemIdByCode = async (q, ctx, code, kind, field) => {
  if (!code) return null;
  const { rows } = await q(`SELECT item_id AS id, item_kind AS kind FROM content.item WHERE item_code = $1 AND item_tenant_code = $2`, [Number(code), ctx.tenantCode]);
  if (!rows.length || (kind && rows[0].kind !== kind)) throw new DomainError('CONTENT_TAXONOMY_UNKNOWN', `Unknown ${field}: ${code}`, { field, value: code });
  return rows[0].id;
};

// ───────────────────────── normalize ─────────────────────────
const normQuestion = (b = {}) => {
  let options = b.options;
  if (options && !Array.isArray(options) && typeof options === 'object') options = Object.entries(options).map(([label, text]) => ({ label, text }));
  options = arr(options).map((o, i) => ({
    label: String(o.label || LABELS[i]).toUpperCase(), position: intOr(o.position, i + 1), text: str(o.text) ?? '', isCorrect: !!o.isCorrect, rationale: str(o.rationale),
  }));
  if (b.correctLabel && !options.some((o) => o.isCorrect)) for (const o of options) o.isCorrect = o.label === String(b.correctLabel).toUpperCase();
  const hints = arr(b.hints).map((h, i) => ({ stepNo: intOr(h.stepNo, i + 1), kind: h.kind, body: str(h.body) ?? '', eliminatesLabels: arr(h.eliminatesLabels).map((x) => String(x).toUpperCase()) }));
  return {
    questionTypeKey: str(b.questionTypeKey), passageItemCode: b.passageItemCode ? Number(b.passageItemCode) : null,
    groupPosition: intOr(b.groupPosition), blankNo: intOr(b.blankNo), stem: str(b.stem) ?? '', stemFormat: b.stemFormat || 'plain',
    readingQuestionKind: b.readingQuestionKind || null, difficulty: intOr(b.difficulty, 3), estimatedSeconds: intOr(b.estimatedSeconds),
    shortReason: str(b.shortReason), explanation: str(b.explanation) ?? '', options, hints,
  };
};
const normPassage = (b = {}) => ({
  passageKind: b.passageKind || 'reading', title: str(b.title), body: str(b.body) ?? '', bodyFormat: b.bodyFormat || 'plain',
  wordCount: intOr(b.wordCount), readability: b.readability ?? null, sourceName: str(b.sourceName), sourceUrl: str(b.sourceUrl), license: str(b.license), attribution: str(b.attribution),
  terms: arr(b.terms).map((t) => ({ term: str(t.term) ?? '', definitionTr: str(t.definitionTr) ?? '', vocabItemCode: t.vocabItemCode ? Number(t.vocabItemCode) : null })),
});
const normNote = (b = {}) => ({
  noteKind: b.noteKind || 'skill', title: str(b.title) ?? '', readingSeconds: intOr(b.readingSeconds), ruleMd: str(b.ruleMd) ?? '', examples: arr(b.examples),
  trapMd: str(b.trapMd), summary: str(b.summary),
  checkQuestions: arr(b.checkQuestions).map((c, i) => ({ position: intOr(c.position, i + 1), questionItemCode: Number(c.questionItemCode || c.itemCode) })),
});
const normVocab = (b = {}) => ({
  headword: str(b.headword)?.trim() ?? '', partOfSpeech: b.partOfSpeech || 'noun', pronunciationIpa: str(b.pronunciationIpa), meanings: arr(b.meanings), examples: arr(b.examples),
  collocations: arr(b.collocations), synonyms: arr(b.synonyms), antonyms: arr(b.antonyms), confusables: arr(b.confusables), frequencyRank: intOr(b.frequencyRank),
});
const normTranslation = (b = {}) => ({
  sourceLanguage: b.sourceLanguage || 'en', targetLanguage: b.targetLanguage || 'tr', sourceText: str(b.sourceText) ?? '', referenceTranslation: str(b.referenceTranslation) ?? '',
  difficulty: intOr(b.difficulty, 3), rubricKey: str(b.rubricKey), keyPoints: arr(b.keyPoints),
});
const normExamForm = (b = {}) => ({
  formType: b.formType || 'full', trackKey: str(b.trackKey), blueprintCode: b.blueprintCode ? Number(b.blueprintCode) : null, title: str(b.title) ?? '',
  questionCount: intOr(b.questionCount), durationSeconds: intOr(b.durationSeconds), isRecommended: !!b.isRecommended,
  questions: arr(b.questions).map((x, i) => ({ position: intOr(x.position, i + 1), questionItemCode: Number(x.questionItemCode || x.itemCode), sectionPosition: intOr(x.sectionPosition) })),
});
const normArticle = (b = {}) => ({
  articleType: b.articleType || 'blog', categoryKey: str(b.categoryKey), authorCode: b.authorCode ? Number(b.authorCode) : null, title: str(b.title) ?? '', excerpt: str(b.excerpt),
  bodyMd: str(b.bodyMd) ?? '', readingMinutes: intOr(b.readingMinutes), coverBlobId: b.coverBlobId ? Number(b.coverBlobId) : null, seoTitle: str(b.seoTitle),
  seoDescription: str(b.seoDescription), ctaKey: str(b.ctaKey), toc: arr(b.toc),
});
const NORM = { question: normQuestion, passage: normPassage, note: normNote, vocab_entry: normVocab, translation_prompt: normTranslation, exam_form: normExamForm, article: normArticle };
export const normalizeBody = (kind, raw) => {
  if (!NORM[kind]) throw new DomainError('CONTENT_KIND_INVALID', `Unknown kind: ${kind}`);
  return NORM[kind](raw || {});
};

// ───────────────────────── load ─────────────────────────
const loadQuestion = async (q, revId) => {
  const { rows } = await q(
    `SELECT qu.*, qt.question_type_key AS "questionTypeKey", pi.item_code AS "passageItemCode"
       FROM content.question qu JOIN content.question_type qt ON qt.question_type_id = qu.question_question_type_id
       LEFT JOIN content.item pi ON pi.item_id = qu.question_passage_item_id WHERE qu.question_item_revision_id = $1`, [revId]);
  if (!rows.length) return normQuestion({});
  const r = rows[0];
  const [{ rows: opts }, { rows: hints }] = await Promise.all([
    q(`SELECT question_option_label AS label, question_option_position AS position, question_option_text AS text, question_option_is_correct AS "isCorrect", question_option_rationale AS rationale
         FROM content.question_option WHERE question_option_question_id = $1 ORDER BY question_option_position`, [r.question_id]),
    q(`SELECT question_hint_step_no AS "stepNo", question_hint_hint_kind AS kind, question_hint_body AS body, question_hint_eliminates_labels AS "eliminatesLabels"
         FROM content.question_hint WHERE question_hint_question_id = $1 ORDER BY question_hint_step_no`, [r.question_id]),
  ]);
  return {
    questionTypeKey: r.questionTypeKey, passageItemCode: num(r.passageItemCode), groupPosition: r.question_group_position, blankNo: r.question_blank_no, stem: r.question_stem,
    stemFormat: r.question_stem_format, readingQuestionKind: r.question_reading_question_kind, difficulty: r.question_difficulty, estimatedSeconds: r.question_estimated_seconds,
    shortReason: r.question_short_reason, explanation: r.question_explanation,
    options: opts, hints: hints.map((h) => ({ ...h, eliminatesLabels: h.eliminatesLabels || [] })),
  };
};
const loadPassage = async (q, revId) => {
  const { rows } = await q(`SELECT * FROM content.passage WHERE passage_item_revision_id = $1`, [revId]);
  if (!rows.length) return normPassage({});
  const r = rows[0];
  const { rows: terms } = await q(
    `SELECT t.passage_term_term AS term, t.passage_term_definition_tr AS "definitionTr", vi.item_code AS "vocabItemCode"
       FROM content.passage_term t LEFT JOIN content.item vi ON vi.item_id = t.passage_term_vocab_item_id WHERE t.passage_term_passage_id = $1 ORDER BY t.passage_term_id`, [r.passage_id]);
  return {
    passageKind: r.passage_passage_kind, title: r.passage_title, body: r.passage_body, bodyFormat: r.passage_body_format, wordCount: r.passage_word_count,
    readability: r.passage_readability === null ? null : Number(r.passage_readability), sourceName: r.passage_source_name, sourceUrl: r.passage_source_url,
    license: r.passage_license, attribution: r.passage_attribution, terms: terms.map((t) => ({ ...t, vocabItemCode: num(t.vocabItemCode) })),
  };
};
const loadNote = async (q, revId) => {
  const { rows } = await q(`SELECT * FROM content.note WHERE note_item_revision_id = $1`, [revId]);
  if (!rows.length) return normNote({});
  const r = rows[0];
  const { rows: cq } = await q(
    `SELECT c.note_check_question_position AS position, i.item_code AS "questionItemCode", i.item_status AS status, i.item_title AS title
       FROM content.note_check_question c JOIN content.item i ON i.item_id = c.note_check_question_question_item_id WHERE c.note_check_question_note_id = $1 ORDER BY 1`, [r.note_id]);
  return {
    noteKind: r.note_note_kind, title: r.note_title, readingSeconds: r.note_reading_seconds, ruleMd: r.note_rule_md, examples: r.note_examples, trapMd: r.note_trap_md, summary: r.note_summary,
    checkQuestions: cq.map((c) => ({ position: c.position, questionItemCode: Number(c.questionItemCode), status: c.status, title: c.title })),
  };
};
const loadVocab = async (q, revId) => {
  const { rows } = await q(`SELECT * FROM content.vocab_entry WHERE vocab_entry_item_revision_id = $1`, [revId]);
  if (!rows.length) return normVocab({});
  const r = rows[0];
  return {
    headword: r.vocab_entry_headword, headwordNormalized: r.vocab_entry_headword_normalized, partOfSpeech: r.vocab_entry_part_of_speech, pronunciationIpa: r.vocab_entry_pronunciation_ipa,
    meanings: r.vocab_entry_meanings, examples: r.vocab_entry_examples, collocations: r.vocab_entry_collocations, synonyms: r.vocab_entry_synonyms, antonyms: r.vocab_entry_antonyms,
    confusables: r.vocab_entry_confusables, frequencyRank: r.vocab_entry_frequency_rank,
  };
};
const loadTranslation = async (q, revId) => {
  const { rows } = await q(
    `SELECT t.*, ru.rubric_key AS "rubricKey" FROM content.translation_prompt t LEFT JOIN content.rubric ru ON ru.rubric_id = t.translation_prompt_rubric_id WHERE t.translation_prompt_item_revision_id = $1`, [revId]);
  if (!rows.length) return normTranslation({});
  const r = rows[0];
  return {
    sourceLanguage: r.translation_prompt_source_language, targetLanguage: r.translation_prompt_target_language, sourceText: r.translation_prompt_source_text,
    referenceTranslation: r.translation_prompt_reference_translation, difficulty: r.translation_prompt_difficulty, rubricKey: r.rubricKey, keyPoints: r.translation_prompt_key_points,
  };
};
const loadExamForm = async (q, revId) => {
  const { rows } = await q(
    `SELECT f.*, b.blueprint_code AS "blueprintCode", t.exam_track_key AS "trackKey" FROM content.exam_form f JOIN content.blueprint b ON b.blueprint_id = f.exam_form_blueprint_id
       JOIN content.exam_track t ON t.exam_track_id = b.blueprint_track_id WHERE f.exam_form_item_revision_id = $1`, [revId]);
  if (!rows.length) return normExamForm({});
  const r = rows[0];
  const { rows: qs } = await q(
    `SELECT fq.exam_form_question_position AS position, i.item_code AS "questionItemCode", s.blueprint_section_position AS "sectionPosition", i.item_status AS status, i.item_title AS title
       FROM content.exam_form_question fq JOIN content.item i ON i.item_id = fq.exam_form_question_question_item_id
       LEFT JOIN content.blueprint_section s ON s.blueprint_section_id = fq.exam_form_question_blueprint_section_id
      WHERE fq.exam_form_question_exam_form_id = $1 ORDER BY fq.exam_form_question_position`, [r.exam_form_id]);
  return {
    formType: r.exam_form_form_type, trackKey: r.trackKey, blueprintCode: Number(r.blueprintCode), title: r.exam_form_title, questionCount: r.exam_form_question_count,
    durationSeconds: r.exam_form_duration_seconds, isRecommended: r.exam_form_is_recommended, balance: r.exam_form_balance,
    questions: qs.map((x) => ({ ...x, questionItemCode: Number(x.questionItemCode) })),
  };
};
const loadArticle = async (q, revId) => {
  const { rows } = await q(
    `SELECT a.*, c.article_category_key AS "categoryKey", au.article_author_code AS "authorCode", au.article_author_display_name AS "authorName"
       FROM content.article a JOIN content.article_category c ON c.article_category_id = a.article_category_id
       LEFT JOIN content.article_author au ON au.article_author_id = a.article_author_id WHERE a.article_item_revision_id = $1`, [revId]);
  if (!rows.length) return normArticle({});
  const r = rows[0];
  return {
    articleType: r.article_article_type, categoryKey: r.categoryKey, authorCode: num(r.authorCode), title: r.article_title, excerpt: r.article_excerpt, bodyMd: r.article_body_md,
    readingMinutes: r.article_reading_minutes, coverBlobId: num(r.article_cover_blob_id), seoTitle: r.article_seo_title, seoDescription: r.article_seo_description, ctaKey: r.article_cta_key, toc: r.article_toc,
  };
};
const LOAD = { question: loadQuestion, passage: loadPassage, note: loadNote, vocab_entry: loadVocab, translation_prompt: loadTranslation, exam_form: loadExamForm, article: loadArticle };
export const loadBody = (q, kind, revId) => LOAD[kind](q, revId);

// ───────────────────────── save ─────────────────────────
const countWords = (s) => (String(s || '').trim().match(/\S+/g) || []).length;

const saveQuestion = async (q, ctx, revId, b) => {
  if (!b.questionTypeKey) bad('questionTypeKey', 'questionTypeKey is required');
  const typeId = await idOfKey(q, ctx, 'question_type', 'key', b.questionTypeKey, 'questionTypeKey');
  const passageId = b.passageItemCode ? await itemIdByCode(q, ctx, b.passageItemCode, 'passage', 'passageItemCode') : null;
  if (b.difficulty < 1 || b.difficulty > 5) bad('difficulty', 'difficulty must be 1..5');
  oneOf('stemFormat', b.stemFormat, TEXT_FORMATS);
  if (b.readingQuestionKind) oneOf('readingQuestionKind', b.readingQuestionKind, READING_KINDS);
  if (passageId && !b.groupPosition) b.groupPosition = 1;
  if (!passageId) b.groupPosition = null;
  if (b.options.filter((o) => o.isCorrect).length > 1) bad('options', 'only one option can be correct');
  const labels = new Set(b.options.map((o) => o.label));
  if (labels.size !== b.options.length) bad('options', 'option labels must be unique');
  const qid = await ins(q, ctx, 'question', {
    item_revision_id: revId, question_type_id: typeId, passage_item_id: passageId, group_position: b.groupPosition, blank_no: b.blankNo, stem: b.stem, stem_format: b.stemFormat,
    reading_question_kind: b.readingQuestionKind, difficulty: b.difficulty, estimated_seconds: b.estimatedSeconds, short_reason: b.shortReason, explanation: b.explanation,
  });
  for (const o of b.options) await ins(q, ctx, 'question_option', { question_id: qid, label: o.label, position: o.position, text: o.text, is_correct: o.isCorrect, rationale: o.rationale });
  for (const h of b.hints) {
    oneOf('hints.kind', h.kind, HINT_KINDS);
    await ins(q, ctx, 'question_hint', { question_id: qid, step_no: h.stepNo, hint_kind: h.kind, body: h.body, eliminates_labels: h.eliminatesLabels });
  }
};
const savePassage = async (q, ctx, revId, b) => {
  oneOf('passageKind', b.passageKind, PASSAGE_KINDS);
  oneOf('bodyFormat', b.bodyFormat, TEXT_FORMATS);
  const pid = await ins(q, ctx, 'passage', {
    item_revision_id: revId, passage_kind: b.passageKind, title: b.title, body: b.body, body_format: b.bodyFormat, word_count: countWords(b.body), readability: b.readability,
    source_name: b.sourceName, source_url: b.sourceUrl, license: b.license, attribution: b.attribution,
  });
  const seen = new Set();
  for (const t of b.terms) {
    if (!t.term || seen.has(t.term)) continue;
    seen.add(t.term);
    const vid = t.vocabItemCode ? await itemIdByCode(q, ctx, t.vocabItemCode, 'vocab_entry', 'terms.vocabItemCode') : null;
    await ins(q, ctx, 'passage_term', { passage_id: pid, term: t.term, definition_tr: t.definitionTr, vocab_item_id: vid });
  }
};
const saveNote = async (q, ctx, revId, b) => {
  oneOf('noteKind', b.noteKind, NOTE_KINDS);
  const nid = await ins(q, ctx, 'note', { item_revision_id: revId, note_kind: b.noteKind, title: b.title, reading_seconds: b.readingSeconds, rule_md: b.ruleMd, examples: J(b.examples), trap_md: b.trapMd, summary: b.summary });
  for (const c of b.checkQuestions) {
    const qid = await itemIdByCode(q, ctx, c.questionItemCode, 'question', 'checkQuestions.questionItemCode');
    await ins(q, ctx, 'note_check_question', { note_id: nid, position: c.position, question_item_id: qid });
  }
};
const saveVocab = async (q, ctx, revId, b) => {
  oneOf('partOfSpeech', b.partOfSpeech, POS);
  if (!b.headword) bad('headword', 'headword is required');
  await ins(q, ctx, 'vocab_entry', {
    item_revision_id: revId, headword: b.headword, headword_normalized: normalizeHeadword(b.headword), part_of_speech: b.partOfSpeech, pronunciation_ipa: b.pronunciationIpa, meanings: J(b.meanings),
    examples: J(b.examples), collocations: J(b.collocations), synonyms: J(b.synonyms), antonyms: J(b.antonyms), confusables: J(b.confusables), frequency_rank: b.frequencyRank,
  });
};
const saveTranslation = async (q, ctx, revId, b) => {
  let rubricId;
  if (b.rubricKey) rubricId = await idOfKey(q, ctx, 'rubric', 'key', b.rubricKey, 'rubricKey');
  else {
    const { rows } = await q(`SELECT rubric_id AS id FROM content.rubric WHERE rubric_applies_to = 'translation_prompt' AND rubric_tenant_code = $1 ORDER BY rubric_id LIMIT 1`, [ctx.tenantCode]);
    if (!rows.length) throw new DomainError('CONTENT_TAXONOMY_UNKNOWN', 'No translation rubric defined', { field: 'rubricKey' });
    rubricId = rows[0].id;
  }
  if (b.difficulty < 1 || b.difficulty > 5) bad('difficulty', 'difficulty must be 1..5');
  if (b.sourceLanguage === b.targetLanguage) bad('targetLanguage', 'source and target language must differ');
  await ins(q, ctx, 'translation_prompt', {
    item_revision_id: revId, source_language: b.sourceLanguage, target_language: b.targetLanguage, source_text: b.sourceText, reference_translation: b.referenceTranslation,
    difficulty: b.difficulty, rubric_id: rubricId, key_points: J(b.keyPoints),
  });
};

/** Deneme formu denge göstergeleri (CMS-09): tür, zorluk, kademe, doğru şık dağılımı. */
export const computeFormBalance = async (q, questionItemCodes) => {
  const codes = questionItemCodes.filter(Boolean);
  if (!codes.length) return { total: 0, byType: {}, byDifficulty: {}, byTier: {}, correctLabelCounts: {} };
  const { rows } = await q(
    `SELECT qt.question_type_key AS type, qu.question_difficulty AS diff, i.item_access_tier AS tier,
            (SELECT o.question_option_label FROM content.question_option o WHERE o.question_option_question_id = qu.question_id AND o.question_option_is_correct LIMIT 1) AS correct
       FROM content.item i JOIN content.item_revision r ON r.item_revision_id = COALESCE(i.item_published_revision_id, i.item_latest_revision_id)
       JOIN content.question qu ON qu.question_item_revision_id = r.item_revision_id JOIN content.question_type qt ON qt.question_type_id = qu.question_question_type_id
      WHERE i.item_code = ANY($1::bigint[])`, [codes]);
  const inc = (o, k) => { if (k !== null && k !== undefined) o[k] = (o[k] || 0) + 1; };
  const out = { total: rows.length, byType: {}, byDifficulty: {}, byTier: {}, correctLabelCounts: {} };
  for (const r of rows) { inc(out.byType, r.type); inc(out.byDifficulty, r.diff); inc(out.byTier, r.tier); inc(out.correctLabelCounts, r.correct); }
  return out;
};
const saveExamForm = async (q, ctx, revId, b) => {
  oneOf('formType', b.formType, FORM_TYPES);
  let bp;
  if (b.blueprintCode) {
    bp = (await q(`SELECT blueprint_id AS id, blueprint_question_count AS qc, blueprint_duration_seconds AS dur FROM content.blueprint WHERE blueprint_code = $1`, [b.blueprintCode])).rows[0];
  } else if (b.trackKey) {
    bp = (await q(
      `SELECT bp.blueprint_id AS id, bp.blueprint_question_count AS qc, bp.blueprint_duration_seconds AS dur FROM content.exam_track t
         JOIN content.blueprint bp ON bp.blueprint_track_id IN (t.exam_track_id, t.exam_track_fallback_track_id) AND bp.blueprint_is_active
        WHERE t.exam_track_key = $1 AND t.exam_track_tenant_code = $2 ORDER BY (bp.blueprint_track_id = t.exam_track_id) DESC LIMIT 1`, [b.trackKey, ctx.tenantCode])).rows[0];
  }
  if (!bp) throw new DomainError('CONTENT_TAXONOMY_UNKNOWN', 'Blueprint not found (trackKey or blueprintCode)', { field: 'trackKey' });
  const count = b.questionCount || b.questions.length || bp.qc;
  const duration = b.durationSeconds || Math.round((bp.dur * count) / bp.qc);
  const balance = await computeFormBalance(q, b.questions.map((x) => x.questionItemCode));
  const fid = await ins(q, ctx, 'exam_form', {
    item_revision_id: revId, form_type: b.formType, blueprint_id: bp.id, title: b.title, question_count: count, duration_seconds: duration, is_recommended: b.isRecommended, balance: J(balance),
  });
  for (const x of b.questions) {
    const qid = await itemIdByCode(q, ctx, x.questionItemCode, 'question', 'questions.questionItemCode');
    let sid = null;
    if (x.sectionPosition) {
      sid = (await q(`SELECT blueprint_section_id AS id FROM content.blueprint_section WHERE blueprint_section_blueprint_id = $1 AND blueprint_section_position = $2`, [bp.id, x.sectionPosition])).rows[0]?.id ?? null;
    }
    await ins(q, ctx, 'exam_form_question', { exam_form_id: fid, position: x.position, question_item_id: qid, blueprint_section_id: sid });
  }
};
const saveArticle = async (q, ctx, revId, b) => {
  oneOf('articleType', b.articleType, ARTICLE_TYPES);
  if (!b.categoryKey) bad('categoryKey', 'categoryKey is required');
  const { rows } = await q(`SELECT article_category_id AS id FROM content.article_category WHERE article_category_key = $1 AND article_category_article_type = $2 AND article_category_tenant_code = $3`, [b.categoryKey, b.articleType, ctx.tenantCode]);
  if (!rows.length) throw new DomainError('CONTENT_TAXONOMY_UNKNOWN', `Unknown categoryKey: ${b.categoryKey}`, { field: 'categoryKey' });
  let authorId = null;
  if (b.authorCode) {
    authorId = (await q(`SELECT article_author_id AS id FROM content.article_author WHERE article_author_code = $1`, [b.authorCode])).rows[0]?.id;
    if (!authorId) throw new DomainError('CONTENT_TAXONOMY_UNKNOWN', `Unknown authorCode: ${b.authorCode}`, { field: 'authorCode' });
  }
  const minutes = b.readingMinutes || Math.max(1, Math.round(countWords(b.bodyMd) / 200));
  await ins(q, ctx, 'article', {
    item_revision_id: revId, article_type: b.articleType, category_id: rows[0].id, author_id: authorId, title: b.title, excerpt: b.excerpt, body_md: b.bodyMd, reading_minutes: minutes,
    cover_blob_id: b.coverBlobId, seo_title: b.seoTitle, seo_description: b.seoDescription, cta_key: b.ctaKey, toc: J(b.toc),
  });
};
const SAVE = { question: saveQuestion, passage: savePassage, note: saveNote, vocab_entry: saveVocab, translation_prompt: saveTranslation, exam_form: saveExamForm, article: saveArticle };
const BODY_TABLE = { question: 'question', passage: 'passage', note: 'note', vocab_entry: 'vocab_entry', translation_prompt: 'translation_prompt', exam_form: 'exam_form', article: 'article' };

/** Revizyonun gövdesini siler ve verilen (normalize edilmiş) gövdeyle yeniden yazar. */
export const replaceBody = async (q, ctx, kind, revId, body) => {
  const t = BODY_TABLE[kind];
  await q(`DELETE FROM content.${t} WHERE ${t}_item_revision_id = $1`, [revId]);
  await SAVE[kind](q, ctx, revId, body);
};

// ───────────────────────── validate (gönderim) ─────────────────────────
const err = (field, code, message) => ({ field, code, message });
export const validateBody = (kind, b, opts = {}) => {
  const errors = [];
  const warnings = [];
  if (kind === 'question') {
    if (!String(b.stem || '').trim()) errors.push(err('stem', 'REQUIRED', 'Question stem is required'));
    if (!String(b.explanation || '').trim()) errors.push(err('explanation', 'REQUIRED', 'Explanation is required'));
    if (b.options.length !== 5 && !opts.checkQuestion) errors.push(err('options', 'OPTION_COUNT', `Exactly 5 options are required (got ${b.options.length})`));
    else if (opts.checkQuestion && ![2, 5].includes(b.options.length)) errors.push(err('options', 'OPTION_COUNT', 'Check questions need 2 or 5 options'));
    const correct = b.options.filter((o) => o.isCorrect);
    if (correct.length !== 1) errors.push(err('options', 'CORRECT_COUNT', `Exactly one correct option is required (got ${correct.length})`));
    b.options.forEach((o, i) => {
      if (!String(o.text || '').trim()) errors.push(err(`options[${i}].text`, 'REQUIRED', `Option ${o.label} text is required`));
      if (!o.isCorrect && !String(o.rationale || '').trim()) warnings.push(err(`options[${i}].rationale`, 'RATIONALE_MISSING', `Option ${o.label} has no rationale`));
    });
    if (b.hints.length !== 4) errors.push(err('hints', 'HINT_COUNT', `Exactly 4 hints are required (got ${b.hints.length})`));
    else {
      b.hints.forEach((h, i) => {
        if (h.stepNo !== i + 1) errors.push(err(`hints[${i}].stepNo`, 'HINT_ORDER', 'Hints must be ordered 1..4'));
        if (h.kind !== HINT_KINDS[i]) errors.push(err(`hints[${i}].kind`, 'HINT_KIND', `Hint ${i + 1} must be "${HINT_KINDS[i]}"`));
        if (!String(h.body || '').trim()) errors.push(err(`hints[${i}].body`, 'REQUIRED', `Hint ${i + 1} body is required`));
      });
      const el = b.hints[2];
      const correctLabel = correct[0]?.label;
      if (el?.kind === 'eliminate') {
        if (el.eliminatesLabels.length !== 2) warnings.push(err('hints[2].eliminatesLabels', 'ELIMINATE_COUNT', 'The eliminate hint should remove two wrong options'));
        if (correctLabel && el.eliminatesLabels.includes(correctLabel)) errors.push(err('hints[2].eliminatesLabels', 'ELIMINATES_CORRECT', 'The eliminate hint must not remove the correct option'));
      }
    }
    if (!b.shortReason) warnings.push(err('shortReason', 'SHORT_REASON_MISSING', 'shortReason is empty'));
    if (b.passageItemCode && !b.groupPosition) errors.push(err('groupPosition', 'REQUIRED', 'groupPosition is required for passage questions'));
  } else if (kind === 'passage') {
    if (!String(b.body || '').trim()) errors.push(err('body', 'REQUIRED', 'Passage body is required'));
    if (b.passageKind === 'cloze') {
      const n = (String(b.body).match(/\{\{\d+\}\}/g) || []).length;
      if (!n) errors.push(err('body', 'CLOZE_BLANKS', 'Cloze passage needs {{n}} blank markers'));
    }
    if (b.passageKind === 'paragraph' && !/\[\[I\]\]/.test(b.body)) warnings.push(err('body', 'SENTENCE_MARKERS', 'Paragraph passage normally has [[I]]..[[V]] markers'));
    if (!b.sourceName && !b.license) warnings.push(err('license', 'LICENSE_MISSING', 'Source / license is empty'));
  } else if (kind === 'note') {
    if (!String(b.title || '').trim()) errors.push(err('title', 'REQUIRED', 'Title is required'));
    if (!String(b.ruleMd || '').trim()) errors.push(err('ruleMd', 'REQUIRED', 'ruleMd is required'));
    if (!b.examples.length) warnings.push(err('examples', 'EXAMPLES_MISSING', 'No examples'));
    if (!b.checkQuestions.length) warnings.push(err('checkQuestions', 'CHECKS_MISSING', 'No check questions'));
  } else if (kind === 'vocab_entry') {
    if (!String(b.headword || '').trim()) errors.push(err('headword', 'REQUIRED', 'headword is required'));
    if (!b.meanings.length || b.meanings.some((m) => !String(m?.tr || '').trim())) errors.push(err('meanings', 'REQUIRED', 'At least one meaning with a Turkish text (tr) is required'));
    if (!b.examples.length) warnings.push(err('examples', 'EXAMPLES_MISSING', 'No examples'));
  } else if (kind === 'translation_prompt') {
    if (!String(b.sourceText || '').trim()) errors.push(err('sourceText', 'REQUIRED', 'sourceText is required'));
    if (!String(b.referenceTranslation || '').trim()) errors.push(err('referenceTranslation', 'REQUIRED', 'referenceTranslation is required'));
    if (!b.keyPoints.length) warnings.push(err('keyPoints', 'KEY_POINTS_MISSING', 'No key points'));
  } else if (kind === 'exam_form') {
    if (!String(b.title || '').trim()) errors.push(err('title', 'REQUIRED', 'title is required'));
    if (!b.questions.length) errors.push(err('questions', 'REQUIRED', 'Form has no questions'));
    if (b.questions.length !== b.questionCount) errors.push(err('questions', 'COUNT_MISMATCH', `Form has ${b.questions.length} questions but questionCount is ${b.questionCount}`));
    const pos = b.questions.map((x) => x.position).sort((x, y) => x - y);
    if (pos.some((p, i) => p !== i + 1)) errors.push(err('questions', 'POSITION_GAP', 'Positions must be 1..N without gaps'));
    if (new Set(b.questions.map((x) => x.questionItemCode)).size !== b.questions.length) errors.push(err('questions', 'DUPLICATE', 'A question appears twice'));
    for (const x of b.questions) if (x.status && x.status !== 'published') errors.push(err('questions', 'NOT_PUBLISHED', `Question ${x.questionItemCode} is not published`));
  } else if (kind === 'article') {
    if (!String(b.title || '').trim()) errors.push(err('title', 'REQUIRED', 'title is required'));
    if (!String(b.bodyMd || '').trim()) errors.push(err('bodyMd', 'REQUIRED', 'bodyMd is required'));
    if (!b.categoryKey) errors.push(err('categoryKey', 'REQUIRED', 'categoryKey is required'));
    if (!b.excerpt) warnings.push(err('excerpt', 'EXCERPT_MISSING', 'excerpt is empty'));
    if (!b.seoDescription) warnings.push(err('seoDescription', 'SEO_MISSING', 'seoDescription is empty'));
  }
  return { errors, warnings };
};

export const titleFromBody = (kind, b, fallback = '') => {
  const clip = (s, n = 80) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  switch (kind) {
    case 'question': return clip(b.stem) || fallback;
    case 'passage': return clip(b.title || b.body) || fallback;
    case 'note': return clip(b.title) || fallback;
    case 'vocab_entry': return clip(b.headword) || fallback;
    case 'translation_prompt': return clip(b.sourceText) || fallback;
    case 'exam_form': return clip(b.title) || fallback;
    case 'article': return clip(b.title) || fallback;
    default: return fallback;
  }
};
export { iso, stripRow };
