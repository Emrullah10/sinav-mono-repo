// İçerik yükleyiciler: sorular, metinler, notlar, kelime, çeviri, makale.
import { insert, upsert, sp, tx, readJson, listFiles, newRep, bump, err, PgArr } from './db.mjs';
import { loadMaps, upsertAuthor } from './core.mjs';

const LABELS = ['A', 'B', 'C', 'D', 'E'];
const HINT_KINDS = ['focus', 'rule', 'eliminate', 'solution'];
const READING_KINDS = ['main_idea', 'inference', 'detail', 'vocabulary_in_context', 'author_attitude'];
const POS = ['noun', 'verb', 'adjective', 'adverb', 'phrasal_verb', 'conjunction', 'preposition', 'idiom', 'collocation'];
const AREAS = ['health', 'science', 'social'];
const nz = (s) => typeof s === 'string' && s.trim().length > 0;
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();

const prepCtx = async (ctx) => {
  if (!ctx.m.qt || !Object.keys(ctx.m.qt).length) await loadMaps(ctx);
  ctx.refs ??= new Set();
  ctx.m.yds = ctx.m.exam.yds;
};

// ------------------------------------------------------------ doğrulama
export const validateQ = (ctx, q, { checks = false, kindHint = null } = {}) => {
  const e = [];
  if (!nz(q.ref)) e.push('ref yok');
  const type = q.type ?? kindHint;
  if (!ctx.m.qt[type]) e.push(`bilinmeyen soru tipi: ${type}`);
  if (!Array.isArray(q.skills) || (!checks && q.skills.length === 0)) e.push('skills dizisi yok/boş');
  else for (const s of q.skills) if (!ctx.m.skill[s]) e.push(`bilinmeyen beceri: ${s}`);
  if (q.difficulty != null && !(Number.isInteger(q.difficulty) && q.difficulty >= 1 && q.difficulty <= 5)) e.push('difficulty 1-5 tamsayı olmalı');
  if (!nz(q.stem) && !(q.blankNo != null || type === 'cloze')) e.push('stem boş');
  if (!nz(q.explanation)) e.push('explanation boş');
  const o = q.options;
  if (!o || typeof o !== 'object' || Array.isArray(o)) { e.push('options nesne değil'); return e; }
  const keys = Object.keys(o);
  const want = checks && keys.length === 2 ? LABELS.slice(0, 2) : LABELS;
  if (keys.length !== want.length || !want.every((l) => keys.includes(l))) e.push(`şıklar ${want.join('')} olmalı (bulunan: ${keys.join('')})`);
  for (const k of keys) if (!nz(o[k])) e.push(`şık ${k} boş`);
  if (typeof q.correct !== 'string' || !keys.includes(q.correct)) e.push(`correct geçersiz: ${JSON.stringify(q.correct)} (tam bir doğru şık gerekir)`);
  if (new Set(keys.map((k) => String(o[k]).trim().toLowerCase())).size !== keys.length) e.push('yinelenen şık metni');
  if (q.rationale != null) {
    if (typeof q.rationale !== 'object') e.push('rationale nesne olmalı');
    else for (const k of Object.keys(q.rationale)) if (!keys.includes(k) || k === q.correct) e.push(`rationale anahtarı geçersiz: ${k}`);
  }
  if (q.hints != null) {
    if (!Array.isArray(q.hints)) e.push('hints dizi olmalı');
    else q.hints.forEach((h, i) => {
      const p = `hint[${i}]`;
      if (!HINT_KINDS.includes(h?.kind)) e.push(`${p} kind geçersiz: ${h?.kind}`);
      if (!nz(h?.body)) e.push(`${p} body boş`);
      if (h?.kind === 'eliminate') {
        const el = h.eliminates;
        if (!Array.isArray(el) || el.length !== 2 || new Set(el).size !== 2 || el.some((l) => !keys.includes(l) || l === q.correct)) e.push(`${p} eliminates iki farklı YANLIŞ şık olmalı`);
      } else if (h?.eliminates != null) e.push(`${p} yalnız eliminate ipucunda eliminates olur`);
    });
  }
  if (q.tier != null && !['free', 'premium'].includes(q.tier)) e.push(`tier geçersiz: ${q.tier}`);
  if (q.area != null && !AREAS.includes(q.area)) e.push(`area geçersiz: ${q.area}`);
  if (q.readingKind != null && !READING_KINDS.includes(q.readingKind)) e.push(`readingKind geçersiz: ${q.readingKind}`);
  if (type === 'reading' && !q.readingKind) e.push('reading sorusunda readingKind gerekli');
  if (q.estimatedSeconds != null && !(Number.isInteger(q.estimatedSeconds) && q.estimatedSeconds > 0)) e.push('estimatedSeconds pozitif tamsayı olmalı');
  return e;
};

// ------------------------------------------------------------ öğe yardımcıları
const findItem = async (ctx, ref) => (await ctx.db.query('SELECT item_id id, item_kind kind FROM content.item WHERE item_tenant_code=$1 AND item_external_ref=$2', [ctx.tenant, ref])).rows[0];

const newItem = async (ctx, o) => {
  const itemId = await insert(ctx, 'content', 'item', {
    kind: o.kind, status: 'draft', language: o.language ?? 'en', subject_area_id: o.area ? ctx.m.area[o.area] ?? null : null,
    access_tier: o.tier ?? 'free', origin: 'seed', title: trunc(oneLine(o.title), 300), slug: o.slug ?? null, external_ref: o.ref,
  });
  const revId = await insert(ctx, 'content', 'item_revision', { item_id: itemId, revision_no: 1, review_status: 'approved', snapshot: o.snapshot ?? {}, change_note: 'Seed yüklemesi' });
  return { itemId, revId };
};

const publishItem = async (ctx, { itemId, revId }, skills = [], withExam = true) => {
  await ctx.db.query(`UPDATE content.item SET item_status='published', item_latest_revision_id=$1, item_published_revision_id=$1, item_published_at=now() WHERE item_id=$2`, [revId, itemId]);
  if (withExam) await insert(ctx, 'content', 'item_exam', { item_id: itemId, exam_id: ctx.m.yds });
  let first = true;
  for (const s of [...new Set(skills)]) {
    await insert(ctx, 'content', 'item_skill', { item_id: itemId, skill_id: ctx.m.skill[s], weight: 1, is_primary: first });
    first = false;
  }
};

const insertQuestionBody = async (ctx, revId, q, type, extra = {}) => {
  const qid = await insert(ctx, 'content', 'question', {
    item_revision_id: revId, question_type_id: ctx.m.qt[type], passage_item_id: extra.passageItemId ?? null, group_position: extra.groupPosition ?? null,
    blank_no: q.blankNo ?? null, stem: nz(q.stem) ? q.stem : null, stem_format: 'plain', reading_question_kind: q.readingKind ?? null,
    difficulty: q.difficulty ?? 3, estimated_seconds: q.estimatedSeconds ?? null, short_reason: q.shortReason ? trunc(q.shortReason, 300) : null, explanation: q.explanation,
  });
  const labels = Object.keys(q.options).sort();
  let pos = 0;
  for (const l of labels) {
    await insert(ctx, 'content', 'question_option', { question_id: qid, label: l, position: ++pos, text: q.options[l], is_correct: l === q.correct, rationale: l === q.correct ? null : q.rationale?.[l] ?? null });
  }
  let step = 0;
  for (const h of q.hints ?? []) {
    await insert(ctx, 'content', 'question_hint', { question_id: qid, step_no: ++step, hint_kind: h.kind, body: h.body, eliminates_labels: new PgArr(h.kind === 'eliminate' ? h.eliminates : []) });
  }
  return qid;
};

// Tek soru öğesi. Dönüş: { itemId } | { itemId, skipped:true }
const createQuestion = async (ctx, q, { type, passageItemId = null, groupPosition = null, tier, area } = {}) => {
  const ex = await findItem(ctx, q.ref);
  if (ex) return { itemId: ex.id, skipped: true };
  const it = await newItem(ctx, { kind: 'question', ref: q.ref, title: nz(q.stem) ? q.stem : `Boşluk ${q.blankNo ?? ''}`, tier: q.tier ?? tier, area: q.area !== undefined ? q.area : area, snapshot: q });
  await insertQuestionBody(ctx, it.revId, q, type, { passageItemId, groupPosition });
  await publishItem(ctx, it, q.skills);
  return { itemId: it.itemId };
};

const dupRef = (ctx, rep, ref) => {
  if (!ref) return false;
  if (ctx.refs.has(ref)) { err(rep, ref, 'yinelenen ref (bu çalıştırmada başka kayıtta da var)'); return true; }
  ctx.refs.add(ref); return false;
};

const forFiles = async (ctx, re, label, fn) => {
  const files = listFiles(re);
  if (!files.length) { const r = newRep(label); r.notes.push('dosya yok, atlandı'); return [r]; }
  const reps = [];
  for (const f of files) {
    const rep = newRep(f);
    try {
      const d = readJson(f);
      await tx(ctx, () => fn(d, rep));
    } catch (e) { err(rep, f, e.message); }
    reps.push(rep);
  }
  return reps;
};

// ------------------------------------------------------------ questions
export const seedQuestions = async (ctx) => {
  await prepCtx(ctx);
  return forFiles(ctx, /^questions-.*\.json$/, 'questions-*.json', async (d, rep) => {
    for (const q of d.questions ?? []) {
      const id = q?.ref ?? '(ref yok)';
      const ve = validateQ(ctx, q);
      if (ve.length) { err(rep, id, ve.join('; ')); continue; }
      if (dupRef(ctx, rep, q.ref)) continue;
      try {
        const r = await sp(ctx, () => createQuestion(ctx, q, { type: q.type, tier: q.tier, area: q.area ?? null }));
        bump(rep, q.type, !r.skipped);
      } catch (e) { err(rep, id, e.message); }
    }
  });
};

// ------------------------------------------------------------ passages
const validatePassage = (ctx, p) => {
  const e = [];
  if (!nz(p.ref)) e.push('ref yok');
  if (!['reading', 'cloze', 'paragraph'].includes(p.passageKind)) e.push(`passageKind geçersiz: ${p.passageKind}`);
  if (!nz(p.body)) e.push('body boş');
  if (p.area != null && !AREAS.includes(p.area)) e.push(`area geçersiz: ${p.area}`);
  if (!Array.isArray(p.questions) || !p.questions.length) { e.push('questions boş'); return e; }
  const defType = { reading: 'reading', cloze: 'cloze' }[p.passageKind] ?? null;
  if (p.terms != null && (!Array.isArray(p.terms) || p.terms.some((t) => !nz(t?.term) || !nz(t?.definitionTr)))) e.push('terms: term/definitionTr gerekli');
  if (p.passageKind === 'cloze') {
    const blanks = [...(p.body ?? '').matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    const qb = p.questions.map((q) => q.blankNo);
    if (!blanks.length) e.push('cloze gövdesinde {{n}} boşlukları yok');
    else if ([...blanks].sort().join() !== [...qb].sort().join()) e.push(`boşluklar (${blanks}) ile sorular (${qb}) uyuşmuyor`);
  }
  if (p.passageKind === 'paragraph') {
    if (p.questions.length !== 1) e.push('paragraph metninde tam 1 soru olmalı');
    if (!/\[\[I\]\]/.test(p.body ?? '')) e.push('paragraph gövdesinde [[I]] işaretleri yok');
  }
  p.questions.forEach((q, i) => {
    const t = q.type ?? defType;
    const qe = validateQ(ctx, q, { kindHint: defType });
    if (!t) qe.push('type gerekli (paragraph)');
    if (p.passageKind === 'paragraph' && t && !['paragraph_completion', 'irrelevant_sentence'].includes(t)) qe.push(`paragraph için tip ${t} uygun değil`);
    if (p.passageKind === 'reading' && t && t !== 'reading') qe.push(`reading metninde tip ${t}`);
    if (p.passageKind === 'cloze' && t && t !== 'cloze') qe.push(`cloze metninde tip ${t}`);
    if (p.passageKind === 'cloze' && !Number.isInteger(q.blankNo)) qe.push('cloze sorusunda blankNo gerekli');
    if (qe.length) e.push(`soru[${i}] ${q.ref ?? ''}: ${qe.join('; ')}`);
  });
  return e;
};

export const seedPassages = async (ctx) => {
  await prepCtx(ctx);
  return forFiles(ctx, /^passages-.*\.json$/, 'passages-*.json', async (d, rep) => {
    for (const p of d.passages ?? []) {
      const id = p?.ref ?? '(ref yok)';
      const ve = validatePassage(ctx, p);
      if (ve.length) { err(rep, id, ve.join(' | ')); continue; }
      if (dupRef(ctx, rep, p.ref) | p.questions.map((q) => dupRef(ctx, rep, q.ref)).some(Boolean)) continue;
      try {
        const res = await sp(ctx, async () => {
          if (await findItem(ctx, p.ref)) return { skipped: true };
          const it = await newItem(ctx, { kind: 'passage', ref: p.ref, title: p.title ?? p.body.slice(0, 80), tier: p.tier ?? 'free', area: p.area ?? null, snapshot: { ...p, questions: p.questions.map((q) => q.ref) } });
          const pid = await insert(ctx, 'content', 'passage', {
            item_revision_id: it.revId, passage_kind: p.passageKind, title: p.title ?? null, body: p.body, body_format: 'plain',
            word_count: p.body.split(/\s+/).filter(Boolean).length, source_name: p.source ?? null, license: p.license ?? null,
          });
          const seen = new Set();
          for (const t of p.terms ?? []) {
            if (seen.has(t.term.toLowerCase())) continue; seen.add(t.term.toLowerCase());
            await insert(ctx, 'content', 'passage_term', { passage_id: pid, term: t.term, definition_tr: t.definitionTr });
          }
          await publishItem(ctx, it, []);
          const defType = { reading: 'reading', cloze: 'cloze' }[p.passageKind];
          let pos = 0;
          const qs = p.passageKind === 'cloze' ? [...p.questions].sort((a, b) => a.blankNo - b.blankNo) : p.questions;
          for (const q of qs) {
            pos += 1;
            const r = await createQuestion(ctx, q, { type: q.type ?? defType, passageItemId: it.itemId, groupPosition: pos, tier: p.tier ?? 'free', area: q.area !== undefined ? q.area : p.area ?? null });
            if (r.skipped) throw new Error(`soru ref zaten var: ${q.ref}`);
          }
          return { skipped: false };
        });
        bump(rep, p.passageKind, !res.skipped);
        if (!res.skipped) for (const q of p.questions) bump(rep, 'metin sorusu', true);
      } catch (e) { err(rep, id, e.message); }
    }
  });
};

// ------------------------------------------------------------ notes
const checkType = (ctx, n, c) => {
  if (c.type) return c.type;
  if (n.questionType) return n.questionType;
  const k = n.skills?.[0] ?? '';
  if (k.startsWith('grammar')) return 'grammar';
  if (k.startsWith('vocab')) return 'vocabulary';
  if (k.startsWith('translation')) return 'translation';
  if (k === 'discourse.dialogue') return 'dialogue';
  return 'sentence_completion';
};

export const seedNotes = async (ctx) => {
  await prepCtx(ctx);
  const reps = await forFiles(ctx, /^notes\.json$/, 'notes.json', async (d, rep) => {
    for (const n of d.notes ?? []) {
      const id = n?.ref ?? '(ref yok)';
      const e = [];
      if (!nz(n.ref)) e.push('ref yok');
      if (!nz(n.title)) e.push('title yok');
      if (!['skill', 'strategy'].includes(n.kind)) e.push(`kind geçersiz: ${n.kind}`);
      if (!nz(n.ruleMd)) e.push('ruleMd boş');
      if (!Array.isArray(n.skills)) e.push('skills dizi olmalı');
      else for (const s of n.skills) if (!ctx.m.skill[s]) e.push(`bilinmeyen beceri: ${s}`);
      if (n.kind === 'skill' && !n.skills?.length) e.push('skill notunda skills gerekli');
      if (n.kind === 'strategy' && !ctx.m.qt[n.questionType]) e.push(`strategy notunda geçerli questionType gerekli: ${n.questionType}`);
      if (n.examples != null && (!Array.isArray(n.examples) || n.examples.some((x) => !nz(x?.en)))) e.push('examples: [{en,tr}] olmalı');
      (n.checks ?? []).forEach((c, i) => {
        const ce = validateQ(ctx, { ...c, skills: c.skills ?? n.skills ?? [] }, { checks: true, kindHint: checkType(ctx, n, c) });
        if (ce.length) e.push(`check[${i}] ${c.ref ?? ''}: ${ce.join('; ')}`);
      });
      if (e.length) { err(rep, id, e.join(' | ')); continue; }
      if (dupRef(ctx, rep, n.ref) | (n.checks ?? []).map((c) => dupRef(ctx, rep, c.ref)).some(Boolean)) continue;
      try {
        const res = await sp(ctx, async () => {
          if (await findItem(ctx, n.ref)) return { skipped: true };
          const it = await newItem(ctx, { kind: 'note', ref: n.ref, title: n.title, tier: n.tier ?? 'free', snapshot: n });
          const nid = await insert(ctx, 'content', 'note', {
            item_revision_id: it.revId, note_kind: n.kind, title: n.title, reading_seconds: n.readingSeconds ?? null, rule_md: n.ruleMd,
            examples: n.examples ?? [], trap_md: n.trapMd ?? null, summary: n.summary ? trunc(n.summary, 300) : null,
          });
          await publishItem(ctx, it, n.skills);
          let pos = 0;
          for (const c of n.checks ?? []) {
            const cq = { ...c, skills: c.skills ?? n.skills ?? [] };
            const r = await createQuestion(ctx, cq, { type: checkType(ctx, n, c), tier: n.tier ?? 'free', area: null });
            if (r.skipped) throw new Error(`kontrol sorusu ref zaten var: ${c.ref}`);
            await insert(ctx, 'content', 'note_check_question', { note_id: nid, position: ++pos, question_item_id: r.itemId });
          }
          return { skipped: false };
        });
        bump(rep, n.kind, !res.skipped);
      } catch (e2) { err(rep, id, e2.message); }
    }
  });
  // strateji notlarını soru tiplerine bağla
  const link = await ctx.db.query(`
    UPDATE content.question_type qt SET question_type_strategy_note_item_id = s.item_id
    FROM (
      SELECT i.item_id, rv.item_revision_snapshot->>'questionType' AS qk
      FROM content.item i
      JOIN content.item_revision rv ON rv.item_revision_id = i.item_published_revision_id
      JOIN content.note n ON n.note_item_revision_id = rv.item_revision_id
      WHERE i.item_tenant_code=$1 AND i.item_kind='note' AND i.item_status='published' AND n.note_note_kind='strategy'
    ) s
    WHERE qt.question_type_tenant_code=$1 AND qt.question_type_key = s.qk AND qt.question_type_strategy_note_item_id IS DISTINCT FROM s.item_id`, [ctx.tenant]);
  if (reps.length) reps[reps.length - 1].notes.push(`strateji notu bağlandı: ${link.rowCount} soru tipi`);
  return reps;
};

// ------------------------------------------------------------ vocab
export const seedVocab = async (ctx) => {
  await prepCtx(ctx);
  return forFiles(ctx, /^vocab\.json$/, 'vocab.json', async (d, rep) => {
    for (const v of d.entries ?? []) {
      const id = v?.ref ?? '(ref yok)';
      const e = [];
      if (!nz(v.ref)) e.push('ref yok');
      if (!nz(v.headword)) e.push('headword yok');
      if (!POS.includes(v.pos)) e.push(`pos geçersiz: ${v.pos}`);
      if (!Array.isArray(v.meanings) || !v.meanings.length || v.meanings.some((m) => !nz(m?.tr))) e.push('meanings: en az bir {tr} gerekli');
      if (v.examples != null && (!Array.isArray(v.examples) || v.examples.some((x) => !nz(x?.en)))) e.push('examples: [{en,tr}]');
      for (const k of ['collocations', 'synonyms', 'antonyms', 'confusables']) if (v[k] != null && !Array.isArray(v[k])) e.push(`${k} dizi olmalı`);
      if (v.tier != null && !['free', 'premium'].includes(v.tier)) e.push(`tier geçersiz: ${v.tier}`);
      if (e.length) { err(rep, id, e.join('; ')); continue; }
      if (dupRef(ctx, rep, v.ref)) continue;
      try {
        const res = await sp(ctx, async () => {
          if (await findItem(ctx, v.ref)) return { skipped: true };
          const it = await newItem(ctx, { kind: 'vocab_entry', ref: v.ref, title: v.headword, tier: v.tier ?? 'free', snapshot: v });
          await insert(ctx, 'content', 'vocab_entry', {
            item_revision_id: it.revId, headword: v.headword, headword_normalized: v.headword.trim().toLowerCase(), part_of_speech: v.pos, pronunciation_ipa: v.ipa ?? null,
            meanings: v.meanings, examples: v.examples ?? [], collocations: v.collocations ?? [], synonyms: v.synonyms ?? [], antonyms: v.antonyms ?? [], confusables: v.confusables ?? [], frequency_rank: v.rank ?? null,
          });
          await publishItem(ctx, it, []);
          return { skipped: false };
        });
        bump(rep, 'kelime', !res.skipped);
      } catch (e2) { err(rep, id, e2.message); }
    }
    for (const dk of d.decks ?? []) {
      const id = `deste ${dk?.key ?? '?'}`;
      if (!nz(dk.key) || !nz(dk.name) || !Array.isArray(dk.entries)) { err(rep, id, 'key/name/entries gerekli'); continue; }
      try {
        await sp(ctx, async () => {
          const r = await upsert(ctx, 'content', 'deck', { key: dk.key }, { name: dk.name, description: dk.description ?? null, exam_id: ctx.m.yds, status: 'published', access_tier: dk.tier ?? 'free', default_new_per_day: dk.newPerDay ?? 10, sort_order: 0 }, { update: false });
          const have = await ctx.db.query('SELECT deck_entry_vocab_item_id v FROM content.deck_entry WHERE deck_entry_deck_id=$1', [r.id]);
          const hv = new Set(have.rows.map((x) => String(x.v)));
          const mx = (await ctx.db.query('SELECT COALESCE(max(deck_entry_position),0) m FROM content.deck_entry WHERE deck_entry_deck_id=$1', [r.id])).rows[0].m;
          let pos = Number(mx), added = 0;
          const missing = [];
          for (const ref of dk.entries) {
            const it = await findItem(ctx, ref);
            if (!it || it.kind !== 'vocab_entry') { missing.push(ref); continue; }
            if (hv.has(String(it.id))) continue;
            hv.add(String(it.id));
            await insert(ctx, 'content', 'deck_entry', { deck_id: r.id, vocab_item_id: it.id, position: ++pos }); added += 1;
          }
          if (missing.length) err(rep, id, `${missing.length} girdi bulunamadı: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`);
          rep.notes.push(`${dk.key}: ${dk.entries.length} girdi, ${added} yeni eklendi`);
          bump(rep, 'deste', r.created);
        });
      } catch (e2) { err(rep, id, e2.message); }
    }
    const MIN = { 'yds-frequent': 180, 'phrasal-verbs': 60, connectors: 40, academic: 120 };
    for (const [k, n] of Object.entries(MIN)) {
      const dk = (d.decks ?? []).find((x) => x.key === k);
      if (!dk) rep.warnings.push(`deste ${k} yok`); else if (dk.entries.length < n) rep.warnings.push(`deste ${k}: ${dk.entries.length} < beklenen ${n}`);
    }
  });
};

// ------------------------------------------------------------ translation
export const seedTranslation = async (ctx) => {
  await prepCtx(ctx);
  return forFiles(ctx, /^translation\.json$/, 'translation.json', async (d, rep) => {
    for (const t of d.prompts ?? []) {
      const id = t?.ref ?? '(ref yok)';
      const e = [];
      if (!nz(t.ref)) e.push('ref yok');
      if (!nz(t.source)) e.push('source boş');
      if (!nz(t.reference)) e.push('reference boş');
      if (t.difficulty != null && !(Number.isInteger(t.difficulty) && t.difficulty >= 1 && t.difficulty <= 5)) e.push('difficulty 1-5');
      if (t.keyPoints != null && !Array.isArray(t.keyPoints)) e.push('keyPoints dizi olmalı');
      if (t.area != null && !AREAS.includes(t.area)) e.push(`area geçersiz: ${t.area}`);
      if (t.tier != null && !['free', 'premium'].includes(t.tier)) e.push('tier geçersiz');
      if (!ctx.m.rubric.translation) e.push('rubrik "translation" yok (önce taxonomy)');
      if (e.length) { err(rep, id, e.join('; ')); continue; }
      if (dupRef(ctx, rep, t.ref)) continue;
      try {
        const res = await sp(ctx, async () => {
          if (await findItem(ctx, t.ref)) return { skipped: true };
          const it = await newItem(ctx, { kind: 'translation_prompt', ref: t.ref, title: t.source, tier: t.tier ?? 'free', area: t.area ?? null, snapshot: t });
          await insert(ctx, 'content', 'translation_prompt', {
            item_revision_id: it.revId, source_language: 'en', target_language: 'tr', source_text: t.source, reference_translation: t.reference,
            difficulty: t.difficulty ?? 3, rubric_id: ctx.m.rubric.translation, key_points: t.keyPoints ?? [],
          });
          await publishItem(ctx, it, ['translation.en-tr']);
          return { skipped: false };
        });
        bump(rep, 'çeviri istemi', !res.skipped);
      } catch (e2) { err(rep, id, e2.message); }
    }
  });
};

// ------------------------------------------------------------ articles
const toc = (md) => [...md.matchAll(/^(#{2,3})\s+(.+)$/gm)].map((m) => ({ level: m[1].length, title: m[2].trim(), id: m[2].trim().toLowerCase().replace(/[^a-z0-9ğüşıöç]+/g, '-').replace(/^-|-$/g, '') }));

export const seedArticles = async (ctx) => {
  await prepCtx(ctx);
  return forFiles(ctx, /^articles\.json$/, 'articles.json', async (d, rep) => {
    for (const c of d.categories ?? []) {
      if (!c.type || !c.key || !c.name) { err(rep, 'kategori', 'type/key/name gerekli'); continue; }
      const r = await upsert(ctx, 'content', 'article_category', { article_type: c.type, key: c.key }, { name: c.name, description: c.description ?? null }, { update: false });
      bump(rep, 'kategori', r.created);
    }
    const authors = {};
    for (const a of d.authors ?? []) {
      try { const r = await upsertAuthor(ctx, a); authors[a.key ?? a.ref ?? a.slug ?? a.displayName ?? a.name] = r.id; bump(rep, 'yazar', r.created); } catch (e) { err(rep, 'yazar', e.message); }
    }
    const cats = Object.fromEntries((await ctx.db.query('SELECT article_category_article_type t, article_category_key k, article_category_id id FROM content.article_category WHERE article_category_tenant_code=$1', [ctx.tenant])).rows.map((r) => [`${r.t}/${r.k}`, r.id]));
    const dbAuthors = (await ctx.db.query(`SELECT article_author_id id, article_author_metadata->>'key' k FROM content.article_author WHERE article_author_tenant_code=$1`, [ctx.tenant])).rows;
    for (const a of d.articles ?? []) {
      const id = a?.ref ?? '(ref yok)';
      const e = [];
      if (!nz(a.ref)) e.push('ref yok');
      if (!['guide', 'blog', 'help'].includes(a.type)) e.push(`type geçersiz: ${a.type}`);
      if (!cats[`${a.type}/${a.category}`]) e.push(`kategori yok: ${a.type}/${a.category}`);
      if (!nz(a.slug)) e.push('slug yok');
      if (!nz(a.title)) e.push('title yok');
      if (!nz(a.bodyMd)) e.push('bodyMd boş');
      const au = a.author == null ? null : authors[a.author] ?? dbAuthors.find((x) => x.k === a.author)?.id;
      if (a.author != null && !au) e.push(`yazar yok: ${a.author}`);
      if (e.length) { err(rep, id, e.join('; ')); continue; }
      if (dupRef(ctx, rep, a.ref)) continue;
      try {
        const res = await sp(ctx, async () => {
          if (await findItem(ctx, a.ref)) return { skipped: true };
          const it = await newItem(ctx, { kind: 'article', ref: a.ref, title: a.title, slug: a.slug, language: 'tr', tier: 'free', snapshot: a });
          await insert(ctx, 'content', 'article', {
            item_revision_id: it.revId, article_type: a.type, category_id: cats[`${a.type}/${a.category}`], author_id: au ?? null, title: trunc(a.title, 200),
            excerpt: a.excerpt ? trunc(a.excerpt, 400) : null, body_md: a.bodyMd, reading_minutes: a.readingMinutes ?? null,
            seo_title: a.seoTitle ? trunc(a.seoTitle, 70) : null, seo_description: a.seoDescription ? trunc(a.seoDescription, 170) : null, cta_key: a.ctaKey ?? null, toc: toc(a.bodyMd),
          });
          await publishItem(ctx, it, [], false);
          return { skipped: false };
        });
        bump(rep, a.type, !res.skipped);
        if (a.seoTitle && a.seoTitle.length > 70) rep.warnings.push(`${id}: seoTitle ${a.seoTitle.length} > 70, kırpıldı`);
        if (a.seoDescription && a.seoDescription.length > 170) rep.warnings.push(`${id}: seoDescription ${a.seoDescription.length} > 170, kırpıldı`);
      } catch (e2) { err(rep, id, e2.message); }
    }
  });
};

export { newItem, publishItem };
