// Hazır kitaplar (db-schemas/seed/books/*.json) → content.book + content.book_section. Anahtar: book_key; yeniden çalıştırmak metni günceller.
// Biçim: { books:[{ key, title, author, level, topic, description, license, attribution, sourceUrl, sections:[{ title, paragraphs:[str] }] }] }
// Bloklar sayfasızdır (pg yok): hazır kitabın orijinal PDF'i yoktur. Bölme kuralları PDF hattıyla aynıdır (uzun paragraf cümle sınırında, uzun bölüm 5000 kelimede).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunkGroups, splitLong } from '../../services/sinav-service-content/src/application/book-extract.js';
import { bump, err, newRep, tx } from './db.mjs';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db-schemas/seed/books');

export const seedBooks = async (ctx) => {
  const rep = newRep('books/*.json');
  if (!fs.existsSync(DIR)) { rep.notes.push('klasör yok'); return rep; }
  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
    const { books = [] } = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
    for (const b of books) {
      try {
        if (!b.key || !b.title || !b.sections?.length) { err(rep, b.key || file, 'key/title/sections eksik'); continue; }
        const groups = b.sections.map((s) => ({ title: s.title || null, blocks: s.paragraphs.flatMap((x) => splitLong({ t: 'p', x })) }));
        const sections = chunkGroups(groups);
        const words = sections.reduce((n, s) => n + s.wordCount, 0);
        await tx(ctx, async () => {
          const ex = await ctx.db.query(`SELECT book_id AS id FROM content.book WHERE book_tenant_code = $1 AND book_key = $2`, [ctx.tenant, b.key]);
          const vals = [b.title, b.author || null, b.description || null, b.level || null, b.topic || null, b.license || null, b.attribution || null, b.sourceUrl || null, sections.length, words];
          let id = ex.rows[0]?.id;
          if (id) {
            await ctx.db.query(
              `UPDATE content.book SET book_title=$1, book_author=$2, book_description=$3, book_level=$4, book_topic=$5, book_license=$6, book_attribution=$7, book_source_url=$8, book_section_count=$9, book_word_count=$10,
                      book_status='ready', book_published_at=COALESCE(book_published_at, now()), book_processed_at=now() WHERE book_id=$11`, [...vals, id]);
            await ctx.db.query(`DELETE FROM content.book_section WHERE book_section_book_id = $1`, [id]);
          } else {
            const r = await ctx.db.query(
              `INSERT INTO content.book (book_title, book_author, book_description, book_level, book_topic, book_license, book_attribution, book_source_url, book_section_count, book_word_count,
                      book_tenant_code, book_organization_id, book_kind, book_key, book_status, book_published_at, book_processed_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'catalog',$13,'ready',now(),now()) RETURNING book_id AS id`, [...vals, ctx.tenant, ctx.org, b.key]);
            id = r.rows[0].id;
          }
          for (const s of sections) {
            await ctx.db.query(
              `INSERT INTO content.book_section (book_section_tenant_code, book_section_organization_id, book_section_book_id, book_section_position, book_section_title, book_section_word_count, book_section_blocks)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`, [ctx.tenant, ctx.org, id, s.position, s.title ? (s.part > 1 ? `${s.title} (${s.part})`.slice(0, 300) : s.title) : null, s.wordCount, JSON.stringify(s.blocks.map(({ t, x }) => ({ t, x })))]);
          }
          bump(rep, 'kitap', !ex.rows[0]);
        });
      } catch (e) { err(rep, b.key, e.message); }
    }
  }
  return rep;
};
