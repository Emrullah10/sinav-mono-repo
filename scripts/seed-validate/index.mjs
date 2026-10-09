#!/usr/bin/env node
// Seed doğrulayıcı: docs/SEED-FORMAT.md'ye göre db-schemas/seed/yds/*.json denetler.
// Kullanım: node scripts/seed-validate/index.mjs  (her içerik dosyasında kökte reviewStatus=pending_expert_review aranır)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db-schemas/seed/yds');
const MARK = 'pending_expert_review';
const errs = []; const counts = {}; const refs = new Map();
const err = (f, w, m) => errs.push(`${f}: ${w}: ${m}`);
const L = ['A', 'B', 'C', 'D', 'E'];
const str = (x) => typeof x === 'string' && x.trim().length > 0;
const taxo = JSON.parse(fs.readFileSync(path.join(dir, 'taxonomy.json'), 'utf8'));
const types = new Set(taxo.questionTypes.map((q) => q.key));
const skills = new Set(taxo.skills.map((s) => s.key));
const POS = new Set('noun verb adjective adverb phrasal_verb conjunction preposition idiom collocation'.split(' '));
const LEGAL = new Set('kvkk_notice privacy_policy terms_of_use cookie_policy pre_information distance_sales cancellation_refund marketing_consent_text'.split(' '));
const artCats = { blog: new Set(['yds', 'yokdil', 'strateji', 'kelime']), help: new Set(['hesap', 'odeme', 'plan', 'ogretmen', 'sinav-bilgisi']), guide: new Set(['yds', 'yokdil', 'strateji', 'kelime']) };

function uniq(f, ref, where) {
  if (!str(ref)) return err(f, where, 'ref eksik');
  if (refs.has(ref)) err(f, where, `yinelenen ref ${ref} (ilk: ${refs.get(ref)})`);
  else refs.set(ref, f);
}
function checkQ(f, q, where, opts = {}) {
  uniq(f, q.ref, where);
  const w = `${where}[${q.ref}]`;
  if (!opts.noType && !types.has(q.type)) err(f, w, `bilinmeyen type ${q.type}`);
  if (opts.type && q.type !== opts.type) err(f, w, `type ${opts.type} olmalı`);
  if (!Array.isArray(q.skills) || !q.skills.length) err(f, w, 'skills boş');
  else for (const s of q.skills) if (!skills.has(s)) err(f, w, `bilinmeyen skill ${s}`);
  if (!Number.isInteger(q.difficulty) || q.difficulty < 1 || q.difficulty > 5) err(f, w, 'difficulty 1-5');
  if (!str(q.stem)) err(f, w, 'stem boş');
  const keys = Object.keys(q.options || {});
  const n = keys.length;
  if (opts.checks ? ![2, 5].includes(n) : n !== 5) err(f, w, `şık sayısı ${n}`);
  const exp = n === 2 ? ['A', 'B'] : L;
  if (keys.join() !== exp.join()) err(f, w, `şık anahtarları ${keys}`);
  for (const k of keys) if (!str(q.options[k])) err(f, w, `şık ${k} boş`);
  if (new Set(Object.values(q.options || {}).map((s) => String(s).trim().toLowerCase())).size !== n) err(f, w, 'yinelenen şık metni');
  if (typeof q.correct !== 'string' || !keys.includes(q.correct)) err(f, w, `correct geçersiz (${JSON.stringify(q.correct)})`);
  const rk = Object.keys(q.rationale || {});
  const wrong = keys.filter((k) => k !== q.correct);
  if (rk.includes(q.correct)) err(f, w, 'rationale doğru şıkkı içermemeli');
  for (const k of wrong) if (!str(q.rationale?.[k])) err(f, w, `rationale.${k} eksik`);
  if (!str(q.shortReason)) err(f, w, 'shortReason eksik');
  if (!str(q.explanation)) err(f, w, 'explanation eksik');
  if (!opts.checks) {
    if (!Array.isArray(q.hints) || q.hints.length < 3) err(f, w, 'hints en az 3');
    else for (const h of q.hints) {
      if (!str(h.kind) || !str(h.body)) err(f, w, 'hint kind/body eksik');
      if (h.kind === 'eliminate') {
        const e = h.eliminates;
        if (!Array.isArray(e) || e.length !== 2 || e.includes(q.correct) || !e.every((x) => keys.includes(x))) err(f, w, 'eliminates iki yanlış şık olmalı');
      }
    }
    if (!['free', 'premium'].includes(q.tier)) err(f, w, `tier ${q.tier}`);
    if (!(q.estimatedSeconds > 0)) err(f, w, 'estimatedSeconds');
    if (q.area !== undefined && ![null, 'health', 'science', 'social'].includes(q.area)) err(f, w, `area ${q.area}`);
  }
  const s = q.stem || '';
  // Boşluklu tipler ______ ister; sentence_completion '…' ile biter; vocabulary BÜYÜK HARFLİ hedef sözcük kullanabilir; not kontrol soruları (meta) muaf.
  if (!opts.checks && !opts.inPassage) {
    if (['grammar', 'cloze'].includes(q.type) && !s.includes('______')) err(f, w, 'stemde ______ yok');
    if (q.type === 'vocabulary' && !s.includes('______') && !/\b[A-Z]{3,}\b/.test(s)) err(f, w, 'vocabulary: ______ ya da BÜYÜK HARFLİ sözcük yok');
    if (q.type === 'sentence_completion' && !s.includes('______') && !/(…|\.\.\.)\s*$/.test(s)) err(f, w, "sentence_completion: ______ ya da sonda '…' yok");
    if (q.type === 'dialogue' && !(s.includes('\n') && s.includes('______'))) err(f, w, 'diyalog biçimi A:/B: ______');
  }
}
const load = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { err(f, 'json', e.message); return null; } };
const files = fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort();
const dist = {};

for (const f of files) {
  const j = load(f); if (!j) continue;
  if (f !== 'taxonomy.json' && f !== 'catalog.json' && j.reviewStatus !== MARK) err(f, 'root', `reviewStatus != ${MARK}`);
  if (f.startsWith('questions-')) {
    const t = f.slice(10, -5).replace('-', '_');
    const arr = j.questions || []; counts[f] = arr.length;
    arr.forEach((q, i) => { checkQ(f, q, `questions[${i}]`, { type: t }); dist[f] = dist[f] || {}; dist[f][q.correct] = (dist[f][q.correct] || 0) + 1; });
  } else if (f.startsWith('passages-')) {
    const arr = j.passages || []; let qn = 0; counts[f] = arr.length;
    const kind = f.slice(9, -5);
    arr.forEach((p, i) => {
      const w = `passages[${i}]`; uniq(f, p.ref, w);
      if (kind === 'reading' || kind === 'cloze') { if (p.passageKind !== kind) err(f, w, `passageKind ${p.passageKind}`); }
      else if (p.passageKind !== 'paragraph') err(f, w, `passageKind ${p.passageKind}`);
      if (!str(p.title) || !str(p.body)) err(f, w, 'title/body eksik');
      if (!['health', 'science', 'social', null].includes(p.area)) err(f, w, `area ${p.area}`);
      if (p.source !== 'original' || p.license !== 'original') err(f, w, 'source/license original olmalı');
      if (p.terms !== undefined && !Array.isArray(p.terms)) err(f, w, 'terms dizi olmalı');
      const qs = p.questions || []; qn += qs.length;
      const words = (p.body || '').split(/\s+/).length;
      if (kind === 'reading') { if (words < 150 || words > 260) err(f, w, `kelime sayısı ${words}`); if (qs.length !== 4) err(f, w, `soru ${qs.length}`); }
      if (kind === 'cloze') { if (qs.length !== 5) err(f, w, `soru ${qs.length}`); for (let b = 1; b <= 5; b++) if (!(p.body || '').includes(`{{${b}}}`)) err(f, w, `{{${b}}} yok`); }
      if (kind === 'paragraph') {
        if (qs.length !== 1) err(f, w, `soru ${qs.length}`);
        const t = qs[0]?.type;
        if (t === 'irrelevant_sentence') { for (const r of ['I', 'II', 'III', 'IV', 'V']) if (!p.body.includes(`[[${r}]]`)) err(f, w, `[[${r}]] yok`); }
        else if (t === 'paragraph_completion') { if (!p.body.includes('______')) err(f, w, 'paragraph_completion gövdesinde ______ yok'); }
        else err(f, w, `type ${t}`);
      }
      qs.forEach((q, k) => {
        checkQ(f, q, `${w}.questions[${k}]`, { inPassage: true, type: kind === 'paragraph' ? undefined : kind });
        if (kind === 'reading' && !['main_idea', 'inference', 'detail', 'vocabulary_in_context', 'author_attitude'].includes(q.readingKind)) err(f, `${w}.q${k}`, `readingKind ${q.readingKind}`);
        if (kind === 'cloze' && q.blankNo !== k + 1) err(f, `${w}.q${k}`, `blankNo ${q.blankNo}`);
        dist[f] = dist[f] || {}; dist[f][q.correct] = (dist[f][q.correct] || 0) + 1;
      });
    });
    counts[f] += ` passages / ${qn} questions`;
  } else if (f === 'notes.json') {
    const arr = j.notes || []; counts[f] = arr.length;
    const qt = new Set(); const sk = new Set();
    arr.forEach((n, i) => {
      const w = `notes[${i}]`; uniq(f, n.ref, w);
      for (const k of ['title', 'ruleMd', 'summary']) if (!str(n[k])) err(f, w, `${k} boş`);
      if (!['skill', 'strategy'].includes(n.kind)) err(f, w, `kind ${n.kind}`);
      if (n.kind === 'strategy') { if (!types.has(n.questionType)) err(f, w, `questionType ${n.questionType}`); else qt.add(n.questionType); }
      else if (n.questionType) err(f, w, 'skill notunda questionType null olmalı');
      (n.skills || []).forEach((s) => { if (!skills.has(s)) err(f, w, `bilinmeyen skill ${s}`); else sk.add(s.split('.')[0]); });
      if (!Array.isArray(n.examples) || !n.examples.every((e) => str(e.en) && str(e.tr))) err(f, w, 'examples en/tr');
      if (!['free', 'premium'].includes(n.tier)) err(f, w, 'tier');
      if (!(n.readingSeconds > 0)) err(f, w, 'readingSeconds');
      if (!Array.isArray(n.checks) || !n.checks.length) err(f, w, 'checks boş');
      (n.checks || []).forEach((c, k) => checkQ(f, c, `${w}.checks[${k}]`, { checks: true, noType: true }));
    });
    for (const t of types) if (!qt.has(t)) err(f, 'coverage', `strateji notu yok: ${t}`);
    for (const m of new Set(taxo.skills.filter((s) => !s.parent).map((s) => s.key))) if (!sk.has(m)) err(f, 'coverage', `ana beceri notu yok: ${m}`);
  } else if (f === 'vocab.json') {
    const E = j.entries || []; counts[f] = `${E.length} entries / ${(j.decks || []).length} decks`;
    const eref = new Set(); const heads = new Set();
    E.forEach((v, i) => {
      const w = `entries[${i}]`; uniq(f, v.ref, w); eref.add(v.ref);
      if (!str(v.headword)) err(f, w, 'headword'); else { const h = v.headword.toLowerCase() + '|' + v.pos; if (heads.has(h)) err(f, w, `yinelenen headword ${v.headword}`); heads.add(h); }
      if (!POS.has(v.pos)) err(f, w, `pos ${v.pos}`);
      if (!Array.isArray(v.meanings) || !v.meanings.length || !v.meanings.every((m) => str(m.tr))) err(f, w, 'meanings');
      if (!Array.isArray(v.examples) || !v.examples.length || !v.examples.every((e) => str(e.en) && str(e.tr))) err(f, w, 'examples');
      for (const k of ['collocations', 'synonyms', 'antonyms', 'confusables']) if (!Array.isArray(v[k])) err(f, w, `${k} dizi`);
      if (!['free', 'premium'].includes(v.tier)) err(f, w, 'tier');
    });
    const min = { 'yds-frequent': 180, 'phrasal-verbs': 60, connectors: 40, academic: 120 };
    const dk = new Set();
    for (const d of j.decks || []) {
      dk.add(d.key);
      if (new Set(d.entries).size !== d.entries.length) err(f, `deck ${d.key}`, 'yinelenen giriş');
      for (const r of d.entries) if (!eref.has(r)) err(f, `deck ${d.key}`, `bilinmeyen ref ${r}`);
      if (d.entries.length < (min[d.key] || 0)) err(f, `deck ${d.key}`, `${d.entries.length} < ${min[d.key]}`);
      if (!str(d.name) || !str(d.description) || !(d.newPerDay > 0)) err(f, `deck ${d.key}`, 'alanlar');
    }
    for (const k of Object.keys(min)) if (!dk.has(k)) err(f, 'decks', `deste yok ${k}`);
  } else if (f === 'translation.json') {
    const arr = j.prompts || []; counts[f] = arr.length;
    arr.forEach((t, i) => {
      const w = `prompts[${i}]`; uniq(f, t.ref, w);
      if (!str(t.source) || !str(t.reference)) err(f, w, 'source/reference');
      if (!Array.isArray(t.keyPoints) || !t.keyPoints.length) err(f, w, 'keyPoints');
      if (!Number.isInteger(t.difficulty) || t.difficulty < 1 || t.difficulty > 5) err(f, w, 'difficulty');
      if (!['health', 'science', 'social', null].includes(t.area)) err(f, w, 'area');
      if (!['free', 'premium'].includes(t.tier)) err(f, w, 'tier');
    });
  } else if (f === 'articles.json') {
    const arr = j.articles || []; counts[f] = arr.length; const slugs = new Set();
    const au = new Set((j.authors || []).map((a) => a.key));
    arr.forEach((a, i) => {
      const w = `articles[${i}]`; uniq(f, a.ref, w);
      if (!['guide', 'blog', 'help'].includes(a.type)) err(f, w, `type ${a.type}`);
      else if (!artCats[a.type].has(a.category)) err(f, w, `category ${a.category}`);
      if (slugs.has(a.slug)) err(f, w, `yinelenen slug ${a.slug}`); slugs.add(a.slug);
      if (!/^[a-z0-9-]+$/.test(a.slug || '')) err(f, w, 'slug biçimi');
      for (const k of ['title', 'excerpt', 'bodyMd', 'seoTitle', 'seoDescription']) if (!str(a[k])) err(f, w, `${k} boş`);
      if (!(a.readingMinutes > 0)) err(f, w, 'readingMinutes');
      if (!au.has(a.author)) err(f, w, `author ${a.author}`);
    });
  } else if (f === 'legal.json') {
    const arr = j.documents || []; counts[f] = arr.length; const seen = new Set();
    arr.forEach((d, i) => {
      const w = `documents[${i}]`;
      if (!LEGAL.has(d.type)) err(f, w, `type ${d.type}`);
      if (seen.has(d.type)) err(f, w, 'yinelenen type'); seen.add(d.type);
      for (const k of ['locale', 'version', 'title', 'summaryMd', 'bodyMd']) if (!str(d[k])) err(f, w, `${k} boş`);
      if (!/TASLAK — hukuk onayı bekliyor/.test(d.bodyMd || '')) err(f, w, 'TASLAK notu yok');
    });
    for (const t of LEGAL) if (!seen.has(t)) err(f, 'coverage', `yasal tür yok: ${t}`);
  }
}
if (!files.includes('legal.json')) err('legal.json', 'file', 'dosya yok');

console.log('Sayımlar:'); for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
console.log('Doğru şık dağılımı:'); for (const [k, v] of Object.entries(dist)) console.log(`  ${k}: ${JSON.stringify(v)}`);
console.log(`Benzersiz ref: ${refs.size}`);
console.log(errs.length ? `${errs.length} HATA:\n` + errs.slice(0, 200).join('\n') : 'Hata yok.');
process.exit(errs.length ? 1 : 0);
