// Yayındaki havuzdan tam / mini / tip denemesi (exam_form) kurar.
import { createHash } from 'node:crypto';
import { insert, sp, tx, newRep, bump } from './db.mjs';
import { loadMaps } from './core.mjs';
import { newItem, publishItem } from './content.mjs';

const hash = (s) => createHash('md5').update(s).digest('hex');
const ORDER = ['vocabulary', 'grammar', 'cloze', 'sentence_completion', 'translation', 'reading', 'dialogue', 'restatement', 'paragraph_completion', 'irrelevant_sentence'];
const FULL = { vocabulary: 6, grammar: 10, cloze: 10, sentence_completion: 10, translation: 6, reading: 20, dialogue: 5, restatement: 4, paragraph_completion: 4, irrelevant_sentence: 5 };
const MINI = { vocabulary: 3, grammar: 5, cloze: 5, sentence_completion: 5, translation: 3, reading: 10, dialogue: 2, restatement: 2, paragraph_completion: 2, irrelevant_sentence: 3 };
const TYPE_NAME = { reading: 'Okuma', cloze: 'Cloze', grammar: 'Dil bilgisi', vocabulary: 'Kelime' };

export const seedForms = async (ctx) => {
  const rep = newRep('exam forms (otomatik)');
  if (!ctx.m.qt || !Object.keys(ctx.m.qt).length) await loadMaps(ctx);
  ctx.m.yds = ctx.m.exam.yds;
  const bp = (await ctx.db.query(`SELECT blueprint_id id, blueprint_duration_seconds dur FROM content.blueprint WHERE blueprint_track_id=$1 AND blueprint_is_active`, [ctx.m.track['yds-en']])).rows[0];
  if (!bp) { rep.warnings.push('yds-en blueprint yok, formlar kurulamadı'); return rep; }
  const secs = Object.fromEntries((await ctx.db.query(`SELECT t.question_type_key k, s.blueprint_section_id id FROM content.blueprint_section s JOIN content.question_type t ON t.question_type_id=s.blueprint_section_question_type_id WHERE s.blueprint_section_blueprint_id=$1`, [bp.id])).rows.map((r) => [r.k, r.id]));
  const targets = Object.fromEntries((await ctx.db.query(`SELECT question_type_key k, question_type_default_target_seconds s FROM content.question_type WHERE question_type_tenant_code=$1`, [ctx.tenant])).rows.map((r) => [r.k, r.s ?? 60]));

  // havuz: yayındaki, not kontrolü olmayan sorular
  const rows = (await ctx.db.query(`
    SELECT qi.item_id qid, qi.item_external_ref ref, qi.item_access_tier tier, t.question_type_key tk, q.question_difficulty diff,
           q.question_passage_item_id pid, q.question_group_position gp, q.question_blank_no bn, p.passage_passage_kind pk
    FROM content.item qi
    JOIN content.question q ON q.question_item_revision_id = qi.item_published_revision_id
    JOIN content.question_type t ON t.question_type_id = q.question_question_type_id
    LEFT JOIN content.item pi ON pi.item_id = q.question_passage_item_id AND pi.item_status='published'
    LEFT JOIN content.passage p ON p.passage_item_revision_id = pi.item_published_revision_id
    WHERE qi.item_tenant_code=$1 AND qi.item_kind='question' AND qi.item_status='published'
      AND (q.question_passage_item_id IS NULL OR pi.item_id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM content.note_check_question n WHERE n.note_check_question_question_item_id = qi.item_id)`, [ctx.tenant])).rows;
  const byType = {}; const groups = { reading: new Map(), cloze: new Map() };
  for (const r of rows) {
    if (r.pid && (r.tk === 'reading' || r.tk === 'cloze')) {
      const g = groups[r.tk]; if (!g.has(r.pid)) g.set(r.pid, []); g.get(r.pid).push(r);
    } else (byType[r.tk] ??= []).push(r);
  }
  for (const g of Object.values(groups)) for (const a of g.values()) a.sort((x, y) => (x.gp ?? 0) - (y.gp ?? 0));
  const completeGroups = (tk, size) => [...groups[tk].values()].filter((a) => a.length === size);
  const pool = { ...Object.fromEntries(ORDER.map((t) => [t, (byType[t] ?? []).length])), reading: completeGroups('reading', 4).length * 4, cloze: completeGroups('cloze', 5).length * 5 };
  rep.notes.push('havuz: ' + ORDER.map((t) => `${t}=${pool[t]}`).join(' '));

  const pick = (arr, n, salt) => [...arr].sort((a, b) => (hash(salt + (a.ref ?? a[0].ref)) < hash(salt + (b.ref ?? b[0].ref)) ? -1 : 1)).slice(0, n);
  // bir tipten n soru; null dönerse yetersiz
  const take = (tk, n, salt) => {
    if (tk === 'reading' || tk === 'cloze') {
      const size = tk === 'reading' ? 4 : 5;
      const full = Math.floor(n / size), rest = n % size;
      const gs = pick(completeGroups(tk, size), full + (rest ? 1 : 0), salt);
      if (gs.length < full + (rest ? 1 : 0)) return null;
      return gs.flatMap((g, i) => (i < full ? g : g.slice(0, rest)));
    }
    const p = pick(byType[tk] ?? [], n, salt);
    return p.length === n ? p : null;
  };

  const build = async (ref, spec) => {
    // spec: { title, formType, counts:{type:n}, tier, recommended, duration }
    const exists = (await ctx.db.query('SELECT 1 FROM content.item WHERE item_tenant_code=$1 AND item_external_ref=$2', [ctx.tenant, ref])).rows[0];
    if (exists) return bump(rep, spec.formType, false);
    const parts = []; const short = [];
    for (const tk of ORDER) {
      const n = spec.counts[tk]; if (!n) continue;
      const got = take(tk, n, ref);
      if (!got) { short.push(`${tk} ${pool[tk]}/${n}`); continue; }
      parts.push([tk, got]);
    }
    if (short.length) { rep.warnings.push(`${ref}: havuz yetersiz (${short.join(', ')}), form kurulmadı`); return; }
    const qs = parts.flatMap(([tk, got]) => got.map((r) => ({ ...r, tk })));
    const duration = spec.duration ?? qs.reduce((a, r) => a + targets[r.tk], 0);
    await sp(ctx, async () => {
      const it = await newItem(ctx, { kind: 'exam_form', ref, title: spec.title, tier: spec.tier, snapshot: { ref, counts: spec.counts, questions: qs.map((r) => r.ref) } });
      const balance = {
        byType: Object.fromEntries(parts.map(([tk, g]) => [tk, g.length])),
        byTier: { free: qs.filter((r) => r.tier === 'free').length, premium: qs.filter((r) => r.tier === 'premium').length },
        avgDifficulty: Number((qs.reduce((a, r) => a + r.diff, 0) / qs.length).toFixed(2)),
        passages: new Set(qs.filter((r) => r.pid).map((r) => String(r.pid))).size,
      };
      const fid = await insert(ctx, 'content', 'exam_form', { item_revision_id: it.revId, form_type: spec.formType, blueprint_id: bp.id, title: spec.title, question_count: qs.length, duration_seconds: duration, is_recommended: !!spec.recommended, balance });
      let pos = 0;
      for (const r of qs) await insert(ctx, 'content', 'exam_form_question', { exam_form_id: fid, position: ++pos, question_item_id: r.qid, blueprint_section_id: secs[r.tk] ?? null });
      await publishItem(ctx, it, []);
    });
    bump(rep, spec.formType, true);
    rep.notes.push(`${ref}: ${qs.length} soru, ${duration} sn`);
  };

  await tx(ctx, async () => {
    await build('form-full-1', { title: 'YDS Tam Deneme 1', formType: 'full', counts: FULL, tier: 'premium', duration: bp.dur });
    await build('form-mini-1', { title: 'YDS Mini Deneme 1', formType: 'mini', counts: MINI, tier: 'free', recommended: true, duration: Math.round(bp.dur / 2) });
    for (const [tk, n] of [['reading', 20], ['cloze', 10], ['grammar', 10], ['vocabulary', 6]]) {
      await build(`form-drill-${tk}-1`, { title: `${TYPE_NAME[tk]} denemesi (${n} soru)`, formType: 'question_type_drill', counts: { [tk]: n }, tier: 'free' });
    }
  });
  return rep;
};
