// Veritabanındaki katalog adlarından İngilizce sözlükte (packages/modules/shared/i18n/data-en.js) karşılığı olmayanları listeler.
// Yalnız okur. Kullanım: node scripts/check-data-i18n.mjs  (DATABASE_URL ya da CORE_APP_DB_CONNECTION_STRING)
import { connect } from './seed/db.mjs';
import EN from '../packages/modules/shared/i18n/data-en.js';

const COLS = [
  ['content.exam', 'exam_name'], ['content.exam', 'exam_description'], ['content.subject_area', 'subject_area_name'],
  ['content.exam_track', 'exam_track_name'], ['content.exam_track', 'exam_track_notice'], ['content.blueprint', 'blueprint_name'],
  ['content.question_type', 'question_type_name'], ['content.question_type', 'question_type_short_name'], ['content.question_type', 'question_type_description'],
  ['content.skill', 'skill_name'], ['content.skill', 'skill_description'], ['content.goal_preset', 'goal_preset_label'],
  ['content.goal_preset', 'goal_preset_description'], ['content.goal_reason', 'goal_reason_label'], ['content.rubric', 'rubric_name'],
  ['content.rubric_criterion', 'rubric_criterion_name'], ['content.rubric_criterion', 'rubric_criterion_description'],
  ['content.deck', 'deck_name'], ['content.deck', 'deck_description'], ['content.exam_form', 'exam_form_title'], ['content.note', 'note_title'],
  ['content.article_category', 'article_category_name'], ['content.book', 'book_description'], ['content.book', 'book_license'],
  ['billing.product', 'product_name'], ['billing.product', 'product_description'], ['billing.campaign', 'campaign_name'],
  ['billing.retention_offer', 'retention_offer_title'], ['billing.retention_offer', 'retention_offer_body'], ['tutor.starter_prompt', 'starter_prompt_text'],
];
const TR = /[çğıöşüÇĞİÖŞÜ]|\b(ve|bir|soru|için)\b/;
const db = await connect();
let missing = 0;
try {
  for (const [table, col] of COLS) {
    const where = table === 'content.book' ? ` AND book_kind = 'catalog'` : '';
    const { rows } = await db.query(`SELECT DISTINCT ${col} AS v FROM ${table} WHERE ${col} IS NOT NULL${where}`);
    for (const { v } of rows) if (!(v in EN) && TR.test(v)) { missing++; console.log(`${table}.${col}: ${v}`); }
  }
} finally { await db.end?.(); }
console.log(missing ? `\n${missing} metnin İngilizcesi yok (data-en.js'e ekle).` : 'Tüm katalog adlarının İngilizcesi var.');
