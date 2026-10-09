import { DomainError, getEntitlements } from 'app-shared';
import { getPlatform, normalizeHeadword, cacheGetJson, cacheSetJson, vocabKey, reqCode } from '../shared/helpers.js';
import { getPublishedItem } from '../shared/item-read.js';

const REASONS = ['wrong_answer_key', 'typo', 'unclear', 'wrong_info', 'off_topic', 'inappropriate', 'other'];

const vocabDto = (it) => ({
  itemCode: it.code, headword: it.body.headword, partOfSpeech: it.body.partOfSpeech, pronunciationIpa: it.body.pronunciationIpa, meanings: it.body.meanings, examples: it.body.examples,
  collocations: it.body.collocations, synonyms: it.body.synonyms, antonyms: it.body.antonyms, confusables: it.body.confusables, frequencyRank: it.body.frequencyRank,
  accessTier: it.accessTier, language: it.language,
});

const candidates = (w) => {
  const out = [w];
  const add = (x) => { if (x && x.length >= 2 && !out.includes(x)) out.push(x); };
  if (w.endsWith('ies')) add(`${w.slice(0, -3)}y`);
  if (w.endsWith('es')) add(w.slice(0, -2));
  if (w.endsWith('s')) add(w.slice(0, -1));
  if (w.endsWith('ied')) add(`${w.slice(0, -3)}y`);
  if (w.endsWith('ed')) { add(w.slice(0, -2)); add(w.slice(0, -1)); if (/(.)\1ed$/.test(w)) add(w.slice(0, -3)); }
  if (w.endsWith('ing')) { add(w.slice(0, -3)); add(`${w.slice(0, -3)}e`); if (/(.)\1ing$/.test(w)) add(w.slice(0, -4)); }
  if (w.endsWith('ly')) add(w.slice(0, -2));
  return out;
};

export const makeStudy = ({ rawQuery }) => {
  /** STUDY-07..10 sözlük balonu. Redis 13: bulunamayan kelime '∅' olarak önbelleğe alınır. */
  const vocabLookup = async ({ word, lang = 'en' }) => {
    const norm = normalizeHeadword(word);
    if (!norm || norm.length > 80) throw new DomainError('CONTENT_WORD_REQUIRED', 'word is required (max 80 characters)');
    for (const cand of candidates(norm)) {
      const key = vocabKey(lang, cand);
      let hit = await cacheGetJson(key);
      if (hit === undefined) {
        const { rows } = await rawQuery(
          `SELECT i.item_code AS code FROM content.vocab_entry v JOIN content.item i ON i.item_published_revision_id = v.vocab_entry_item_revision_id AND i.item_status = 'published'
            WHERE v.vocab_entry_headword_normalized = $1 AND i.item_language = $2 ORDER BY v.vocab_entry_frequency_rank NULLS LAST, i.item_id`, [cand, lang]);
        const items = [];
        for (const r of rows) { const it = await getPublishedItem(rawQuery, Number(r.code)); if (it) items.push(vocabDto(it)); }
        hit = items.length ? items : '∅';
        await cacheSetJson(key, hit, 24 * 3600);
      }
      if (hit !== '∅') return { found: true, word: norm, matched: cand, entries: hit, primary: hit[0] };
    }
    return { found: false, word: norm, matched: null, entries: [], primary: null };
  };

  /** STUDY-15 kelime ayrıntısı. */
  const vocabDetail = async ({ itemCode }) => {
    const it = await getPublishedItem(rawQuery, reqCode(itemCode, 'CONTENT_VOCAB_NOT_FOUND', 'Vocabulary entry not found'));
    if (!it || it.kind !== 'vocab_entry') throw new DomainError('CONTENT_VOCAB_NOT_FOUND', 'Vocabulary entry not found');
    return vocabDto(it);
  };

  /** STUDY-04 hap not. Premium not + ücretsiz kullanıcı: başlık döner, gövde kilitli. */
  const getNote = async ({ caller, itemCode }) => {
    const it = await getPublishedItem(rawQuery, reqCode(itemCode, 'CONTENT_NOTE_NOT_FOUND', 'Note not found'));
    if (!it || it.kind !== 'note') throw new DomainError('CONTENT_NOTE_NOT_FOUND', 'Note not found');
    const ent = await getEntitlements(Number(caller.callerUserId));
    const locked = it.accessTier === 'premium' && ent.tier !== 'premium';
    const b = it.body;
    const base = { itemCode: it.code, title: b.title, noteKind: b.noteKind, accessTier: it.accessTier, locked, readingSeconds: b.readingSeconds, summary: b.summary };
    const skills = it.skills.map((s) => ({ key: s.key, name: s.name, path: s.path }));
    if (locked) return { ...base, ruleMd: null, examples: [], trapMd: null, checkQuestions: [], relatedSkills: skills, questionTypeKey: null };
    const checkQuestions = [];
    for (const c of b.checkQuestions) {
      const q = await getPublishedItem(rawQuery, c.questionItemCode);
      if (!q || q.kind !== 'question') continue;
      const qb = q.body;
      checkQuestions.push({
        position: c.position, itemCode: q.code, stem: qb.stem, stemFormat: qb.stemFormat, options: qb.options.map((o) => ({ label: o.label, text: o.text, rationale: o.rationale })),
        correctLabel: qb.options.find((o) => o.isCorrect)?.label || null, shortReason: qb.shortReason, explanation: qb.explanation,
      });
    }
    let questionTypeKey = null;
    if (b.noteKind === 'strategy') {
      const r = await rawQuery(`SELECT qt.question_type_key AS key FROM content.question_type qt JOIN content.item i ON i.item_id = qt.question_type_strategy_note_item_id WHERE i.item_code = $1`, [it.code]);
      questionTypeKey = r.rows[0]?.key || null;
    }
    return { ...base, ruleMd: b.ruleMd, examples: b.examples, trapMd: b.trapMd, checkQuestions, relatedSkills: skills, questionTypeKey };
  };

  /** STUDY-07..10 "hata bildir". Aynı kullanıcı aynı soru için açık bildirimi tekrarlarsa mevcut döner. */
  const createReport = async ({ caller, itemCode, reason, note = null, context = null }) => {
    if (!REASONS.includes(reason)) throw new DomainError('CONTENT_REPORT_INVALID', `reason must be one of ${REASONS.join(', ')}`, { field: 'reason' });
    if (note && String(note).length > 1000) throw new DomainError('CONTENT_REPORT_INVALID', 'note is too long (max 1000)', { field: 'note' });
    const code = reqCode(itemCode, 'CONTENT_ITEM_NOT_FOUND', 'Content item not found');
    const { rows } = await rawQuery(`SELECT item_id AS id, item_published_revision_id AS rev FROM content.item WHERE item_code = $1 AND item_status IN ('published','pilot')`, [code]);
    if (!rows.length) throw new DomainError('CONTENT_ITEM_NOT_FOUND', 'Content item not found');
    const uid = Number(caller.callerUserId);
    const dup = await rawQuery(
      `SELECT content_report_code AS code, content_report_status AS status FROM content.content_report WHERE content_report_item_id = $1 AND content_report_reporter_user_account_id = $2 AND content_report_reason = $3 AND content_report_status IN ('open','in_review') LIMIT 1`,
      [rows[0].id, uid, reason]);
    if (dup.rows.length) return { code: Number(dup.rows[0].code), status: dup.rows[0].status, duplicate: true };
    const p = await getPlatform(rawQuery);
    const ins = await rawQuery(
      `INSERT INTO content.content_report (content_report_tenant_code, content_report_organization_id, content_report_reporter_organization_id, content_report_item_id, content_report_item_revision_id,
              content_report_reporter_user_account_id, content_report_reason, content_report_note, content_report_context, content_report_created_by, content_report_updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$6,$6) RETURNING content_report_code AS code, content_report_status AS status`,
      [p.tenantCode, p.organizationId, Number(caller.callerOrganizationId) || null, rows[0].id, rows[0].rev, uid, reason, note || null, context ? JSON.stringify(context) : null]);
    return { code: Number(ins.rows[0].code), status: ins.rows[0].status, duplicate: false };
  };

  return Object.freeze({ vocabLookup, vocabDetail, getNote, createReport });
};
