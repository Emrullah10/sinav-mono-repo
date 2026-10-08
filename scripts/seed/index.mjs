#!/usr/bin/env node
// npm run seed [-- --dry] [-- --only=taxonomy,catalog,staff,legal,tutor,questions,passages,notes,vocab,translation,articles,forms]
import { connect, makeCtx, printRep, SEED_DIR } from './db.mjs';
import { seedTaxonomy, seedCatalog, seedStaff, seedLegal, seedTutor, loadMaps } from './core.mjs';
import { seedQuestions, seedPassages, seedNotes, seedVocab, seedTranslation, seedArticles } from './content.mjs';
import { seedForms } from './forms.mjs';

const STEPS = [
  ['taxonomy', seedTaxonomy], ['catalog', seedCatalog], ['staff', seedStaff], ['legal', seedLegal],
  ['questions', seedQuestions], ['passages', seedPassages], ['notes', seedNotes], ['vocab', seedVocab],
  ['translation', seedTranslation], ['articles', seedArticles], ['forms', seedForms], ['tutor', seedTutor],
];
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice(7).split(',').map((s) => s.trim()).filter(Boolean) : null;
if (only) { const bad = only.filter((o) => !STEPS.some(([n]) => n === o)); if (bad.length) { console.error(`bilinmeyen adım: ${bad.join(',')}; geçerli: ${STEPS.map(([n]) => n).join(',')}`); process.exit(2); } }

const dry = process.argv.includes('--dry');
const db = await connect();
let errors = 0;
try {
  const ctx = await makeCtx(db);
  ctx.dry = dry;
  if (dry) { await db.query('BEGIN'); console.log('DRY RUN: sonunda geri alınacak'); }
  await loadMaps(ctx);
  console.log(`seed dizini: ${SEED_DIR}${only ? ` | adımlar: ${only.join(',')}` : ' | tüm adımlar'}`);
  for (const [name, fn] of STEPS) {
    if (only && !only.includes(name)) continue;
    let reps;
    try { reps = await fn(ctx); } catch (e) { console.error(`\n!! ${name} adımı çöktü: ${e.stack || e.message}`); errors += 1; continue; }
    for (const r of [].concat(reps)) { printRep(r); errors += r.errors.length; }
  }
  if (dry) await db.query('ROLLBACK');
} finally { await db.end(); }
console.log(errors ? `\nBİTTİ: ${errors} hata` : '\nBİTTİ: hata yok');
process.exit(errors ? 1 : 0);
