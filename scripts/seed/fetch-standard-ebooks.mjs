#!/usr/bin/env node
// Telifi bitmiş klasikleri Standard Ebooks'tan (CC0) indirir → db-schemas/seed/books/classics.json.
// Çıktı repoya girer; seed ağa çıkmaz. Yeniden üretmek için: node scripts/seed/fetch-standard-ebooks.mjs
// Yazar seçimi: ölümünün üzerinden 70 yıl geçmiş (Türkiye telif süresi) ve ABD'de de kamu malı olan eserler.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db-schemas/seed/books/classics.json');
const BOOKS = [
  { slug: 'lewis-carroll/alices-adventures-in-wonderland/john-tenniel', title: "Alice's Adventures in Wonderland", author: 'Lewis Carroll', level: 'B2', topic: 'classic', description: 'Tavşan deliğinden düşen Alice\'in tuhaf ve eğlenceli yolculuğu. Oyunlu dili kelime dağarcığını sınar.' },
  { slug: 'h-g-wells/the-time-machine', title: 'The Time Machine', author: 'H. G. Wells', level: 'B2', topic: 'classic', description: 'Bir mucit geleceğe yolculuk eder ve insanlığın alacağı biçimle karşılaşır. Kısa ve sürükleyici bir bilimkurgu klasiği.' },
  { slug: 'arthur-conan-doyle/the-adventures-of-sherlock-holmes', title: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle', level: 'C1', topic: 'classic', description: 'On iki kısa hikâyede Sherlock Holmes ve Dr. Watson. Her hikâye tek oturuşta biter, ağır okumaya iyi bir başlangıç.' },
  { slug: 'oscar-wilde/the-picture-of-dorian-gray', title: 'The Picture of Dorian Gray', author: 'Oscar Wilde', level: 'C1', topic: 'classic', description: 'Yaşlanmayan genç bir adam ve onun yerine yıpranan portresi. Keskin diyaloglarla ahlak ve güzellik üzerine bir roman.' },
  { slug: 'mary-shelley/frankenstein', title: 'Frankenstein', author: 'Mary Shelley', level: 'C1', topic: 'classic', description: 'Bilim insanı Victor Frankenstein\'ın yarattığı varlıkla hesaplaşması. Uzun, akademik cümle yapıları için iyi bir alıştırma.' },
  { slug: 'jane-austen/pride-and-prejudice', title: 'Pride and Prejudice', author: 'Jane Austen', level: 'C1', topic: 'classic', description: 'Elizabeth Bennet ve Bay Darcy\'nin önyargılarla sınanan hikâyesi. İnce ironisiyle İngiliz edebiyatının en sevilen romanlarından.' },
  { slug: 'john-stuart-mill/on-liberty', title: 'On Liberty', author: 'John Stuart Mill', level: 'C1', topic: 'academic', description: 'Bireysel özgürlüğün sınırları üzerine temel bir deneme. Sınavlardaki soyut, akademik paragraflara en yakın okuma.' },
];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hairsp: '', shy: '' };
const decode = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d))).replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e] ?? m);
// Dipnot işaretleri ve etiketler atılır; kelime birleştirici ve ince boşluklar düz metne iner (dokun-çevir aynı metni böler).
const text = (html) => decode(html.replace(/<a [^>]*epub:type="noteref"[^>]*>.*?<\/a>/gs, '').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')).replace(/[\u2060\u200B\uFEFF]/g, '').replace(/[\u00A0\u2009\u200A\u202F]/g, ' ').replace(/\s+/g, ' ').trim();

const SKIP = /^(titlepage|imprint|colophon|uncopyright|halftitlepage|toc|loi|dedication|epigraph|acknowledgements)/;

/** Üst düzey <section>/<article> öğeleri. */
const topLevel = (html) => {
  const out = [];
  const re = /<(\/?)(section|article)\b[^>]*>/g;
  let depth = 0;
  let open = null;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) {
      depth -= 1;
      if (depth === 0 && open) { out.push({ tag: open.tag, attrs: open.attrs, body: html.slice(open.start, m.index) }); open = null; }
    } else {
      if (depth === 0) open = { tag: m[2], attrs: m[0], start: m.index + m[0].length };
      depth += 1;
    }
  }
  return out;
};

/** Başlık: hgroup varsa "I: The Pool of Tears", yoksa ilk başlık etiketi. Başlık paragrafı gövdeden çıkar. */
const titleOf = (body) => {
  const hg = /<hgroup\b[^>]*>(.*?)<\/hgroup>/s.exec(body);
  if (hg) {
    const parts = [...hg[1].matchAll(/<(h[1-6]|p)\b[^>]*>(.*?)<\/\1>/gs)].map((x) => text(x[2])).filter(Boolean);
    return { title: parts.join(': ').slice(0, 280) || null, rest: body.replace(hg[0], '') };
  }
  const h = /<h[1-6]\b[^>]*>(.*?)<\/h[1-6]>/s.exec(body);
  return { title: h ? text(h[1]).slice(0, 280) || null : null, rest: h ? body.replace(h[0], '') : body };
};

/** Bölümler: cilt/kısım kapsayıcılarına inilir; kısa hikâye (article) iç bölümleriyle tek bölüm olur. */
const parse = (html) => {
  const out = [];
  const walk = (src) => {
    for (const el of topLevel(src)) {
      const id = /id="([^"]+)"/.exec(el.attrs)?.[1] || '';
      if (SKIP.test(id)) continue;
      const nested = el.tag === 'section' ? topLevel(el.body).length : 0;
      if (nested >= 2) { walk(el.body); continue; }
      const { title, rest } = titleOf(el.body);
      const paragraphs = [...rest.replace(/<h[1-6]\b[^>]*>.*?<\/h[1-6]>/gs, ' ').matchAll(/<p\b[^>]*>(.*?)<\/p>/gs)].map((x) => text(x[1])).filter(Boolean);
      if (paragraphs.length) out.push({ title, paragraphs });
    }
  };
  walk(html);
  return out;
};

const main = async () => {
  const books = [];
  for (const b of BOOKS) {
    const url = `https://standardebooks.org/ebooks/${b.slug}/text/single-page`;
    const res = await fetch(url, { headers: { 'User-Agent': 'odak-seed/1.0' }, signal: AbortSignal.timeout(180000) });
    if (!res.ok) throw new Error(`${b.slug}: HTTP ${res.status}`);
    const html = await res.text();
    const sections = parse(html.slice(html.indexOf('<body')).replace(/<(?:img|svg)\b[^>]*>/g, ''));
    const words = sections.reduce((n, s) => n + s.paragraphs.join(' ').split(/\s+/).length, 0);
    console.log(`${b.slug}: ${sections.length} bölüm, ${words} kelime`);
    if (sections.length < 2 || words < 5000) throw new Error(`${b.slug}: ayrıştırma şüpheli`);
    books.push({ key: `se-${b.slug.split('/')[1]}`, title: b.title, author: b.author, level: b.level, topic: b.topic, description: b.description, license: 'Kamu malı (CC0)', attribution: 'Standard Ebooks', sourceUrl: `https://standardebooks.org/ebooks/${b.slug}`, sections });
    await new Promise((r) => setTimeout(r, 1500));
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify({ books })}\n`);
  console.log(`yazıldı: ${OUT} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
};
await main();
