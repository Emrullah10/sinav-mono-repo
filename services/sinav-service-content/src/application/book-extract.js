// PDF → okunabilir metin. Alt süreçte çalışır (book-extract-worker.js): büyük ya da bozuk PDF servisi yavaşlatmaz, düşürmez.
// Çıktı: bölümler ve bloklar ({ t:'h'|'p', x:metin, pg:sayfa }). Sayfa numarası korunur; okuma modu ↔ orijinal PDF geçişi buna dayanır.
// Sıra: satırlar (y'ye göre, iki sütun ayrılır) → üst/alt bilgi temizliği → paragraf (tire birleştirme) → bölüm (outline, başlık, sayfa).
import { getDocumentProxy } from 'unpdf';
import { splitSentences } from '../../../../packages/modules/shared/domain/lexicon-text.js';

export const BOOK_LIMITS = Object.freeze({ maxBytes: 50 * 1024 * 1024, maxPages: 1500, maxChars: 6_000_000, sectionWords: 5000, blockChars: 1800, pagesPerChunk: 20, textlessChars: 30, scannedRatio: 0.6 });

const fail = (code) => Object.assign(new Error(code), { code });
const median = (list) => {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
// eslint-disable-next-line no-control-regex -- PDF metninden kontrol karakterleri atılır
const clean = (s) => String(s).normalize('NFKC').replace(/­/g, '').replace(/[\u0000-\u0008\u000B-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
// Cümle içinde harf aralıklı kelime ("left, h o p i n g to", "w h a t ?"): 3+ tek harf art arda → tek kelime.
const unspace = (s) => s.replace(/(?<!\p{L})\p{L}(?: \p{L}){2,}(?!\p{L})(?: (?=[?!.,;:]))?/gu, (m) => m.replace(/ /g, ''));
const wordsOf = (s) => (String(s).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
const ENDS = /[.!?…]["'”’)\]]*$/;
const PAGE_NO = /^[\W_]*(?:page\s*|sayfa\s*)?(?:\d{1,4}|[ivxlcdm]{1,7})(?:\s*(?:of|\/)\s*\d{1,4})?[\W_]*$/i;
const CHAPTER = /^(?:chapter|part|book|section|unit|lesson|preface|introduction|conclusion|epilogue|prologue|appendix|bölüm|kısım|ünite|giriş|sonuç)\b.{0,90}$/i;
const BULLET = /^(?:[•·▪◦‣–—-]\s|\(?\d{1,3}[.)]\s|\(?[a-z][.)]\s)/;
// Okuma moduna girmeyen kitap dışı metin (orijinal PDF görünümünde durur). Sürüm artınca eski kitaplar yeniden işlenebilir (scripts/reprocess-books.mjs).
export const EXTRACT_VERSION = 2;
const LEGAL = /copyright|©|\(c\)\s*(?:19|20)\d\d|all rights reserved|\bisbn\b|first published|published (?:by|in)|printed (?:and bound )?in|no part of this (?:publication|book)|catalogu?ing|library of congress|british library|typeset|reprinted|tüm hakları saklıdır|yayıncının (?:yazılı )?izni|sertifika no|baskı ?:|matbaa|yayınevi/i;
// Reklam/arka kapak işaretleri sayfa metninin tamamında aranır (iki sütunlu sayfada satır bölünür); kaç farklı işaret tuttuğu sayılır.
const PROMO = [/www\.|https?:\/\//i, /available (?:now|at|from)/i, /also (?:published|available|by|in this series)/i, /series editors?/i, /teacher'?s (?:guides?|resources?)/i,
  /published and distributed/i, /courtesy of/i, /for (?:more|other) (?:information|titles)|other titles|visit (?:our|us)/i, /\bisbn\b/i];
const TOC_HEAD = /^(?:table of )?contents$|^içindekiler$/i;
const INDEX_HEAD = /^(?:index|dizin)$/i;
const TOC_ENTRY = /^(.*\p{L}.*?)[\s.·…_-]*\s(\d{1,4}|[ivxlcdm]{1,7})$/iu;
// Sayfanın her yerinde atılan tek satırlık gürültü: yalnız adres, e-posta, boş sayfa notu, indirme filigranı.
const JUNK_LINE = /^(?:(?:https?:\/\/|www\.)\S+|\S+@\S+\.\p{L}{2,}|this page (?:is )?intentionally left blank|(?:downloaded|free ebooks?) (?:from|at|==>).*)$/iu;

// ── sayfa → satırlar ──
const rawItems = (items) => {
  const out = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const [a, b, c, d, x, y] = it.transform;
    if (Math.abs(b) > Math.abs(a) || Math.abs(c) > Math.abs(d)) continue; // döndürülmüş yazı: filigran, kenar notu
    // Harf aralıklı başlık tek parçada gelebilir ('" W o m e n'): harfler birleşir, kelime arası parçalar arası boşluktan gelir.
    const core = it.str.trim();
    const s = /^\p{P}?\s?(?:\p{L}\s){2,}\p{L}(?:\s?\p{P})*$/u.test(core) ? core.replace(/(\S) (?=\S)/g, '$1') : it.str;
    out.push({ s, x, y, w: Number(it.width) || 0, h: Math.abs(d) || Number(it.height) || 10 });
  }
  return out;
};

/** İki sütunlu sayfa: orta bölgede dikey boşluk varsa { gapAt } döner. */
const columnGap = (items, W) => {
  if (items.length < 8 || !W) return null;
  const BINS = 120;
  const cover = new Array(BINS).fill(0);
  for (const it of items) {
    if (it.w > W * 0.6) continue;
    const from = Math.max(0, Math.floor((it.x / W) * BINS));
    const to = Math.min(BINS - 1, Math.floor(((it.x + it.w) / W) * BINS));
    for (let i = from; i <= to; i++) cover[i]++;
  }
  let best = null;
  let start = -1;
  const lo = Math.floor(BINS * 0.33);
  const hi = Math.ceil(BINS * 0.67);
  // Ortalı üst/alt bilgi ve sayfa numarası boşluğu kapatmasın: az sayıda parça boş sayılır.
  const allowed = Math.max(3, Math.floor(items.length * 0.03));
  for (let i = lo; i <= hi; i++) {
    if (cover[i] <= allowed) {
      if (start < 0) start = i;
      if (!best || i - start > best.to - best.from) best = { from: start, to: i };
    } else start = -1;
  }
  if (!best || best.to - best.from + 1 < 2) return null;
  const gapAt = (((best.from + best.to + 1) / 2) / BINS) * W;
  const left = items.filter((it) => it.x + it.w <= gapAt).length;
  const right = items.filter((it) => it.x >= gapAt).length;
  const cross = items.length - left - right;
  // Son sayfada sütunlardan biri kısa olabilir: her iki yanda en az 3 parça ve %10 yeter; boş şerit zaten bulundu.
  if (left < Math.max(3, items.length * 0.1) || right < Math.max(3, items.length * 0.1) || cross > items.length * 0.12) return null;
  return { gapAt };
};

const toLines = (items) => {
  const sorted = [...items].sort((p, q) => q.y - p.y || p.x - q.x);
  const lines = [];
  for (const it of sorted) {
    const cur = lines[lines.length - 1];
    if (cur && Math.abs(cur.y - it.y) <= Math.max(2, Math.min(cur.h, it.h) * 0.5)) {
      cur.parts.push(it);
      cur.h = Math.max(cur.h, it.h);
    } else lines.push({ y: it.y, h: it.h, parts: [it] });
  }
  return lines
    .map((l) => {
      const parts = l.parts.sort((p, q) => p.x - q.x);
      // Harf aralıklı yazı ("W o m e n"): parçalar tek harf; harf arası boşluk kelime arası sayılmasın, eşik olağan harf aralığına göre.
      const singles = parts.filter((p) => p.s.trim().length === 1).length;
      let spaceAt = l.h * 0.18;
      if (parts.length >= 4 && singles / parts.length >= 0.7) {
        const gaps = [];
        for (let i = 1; i < parts.length; i++) gaps.push(parts[i].x - (parts[i - 1].x + parts[i - 1].w));
        spaceAt = Math.max(spaceAt, median(gaps.filter((g) => g > 0)) * 1.6);
      }
      let text = '';
      let end = null;
      for (const p of parts) {
        const gap = end === null ? 0 : p.x - end;
        if (end !== null && gap > spaceAt && !text.endsWith(' ') && !p.s.startsWith(' ')) text += ' ';
        text += p.s;
        end = p.x + p.w;
      }
      const sizes = parts.map((p) => ({ h: p.h, n: p.s.length })).sort((p, q) => q.n - p.n);
      return { text: unspace(clean(text)), y: l.y, x: parts[0].x, right: end, size: Math.round((sizes[0]?.h || l.h) * 2) / 2 };
    })
    .filter((l) => l.text);
};

/** Önceki sayfada bulunan sütun boşluğu, kısa sayfada da (bir sütunda bir iki satır) geçerliyse kullanılır. */
const hintedGap = (items, hint) => {
  // Yalnız az satırlı sayfada: kalabalık sayfada (şekil, tablo) sütun olmadığı hâlde boşluk tutturulabilir.
  if (!hint || items.length > 40) return null;
  const left = items.filter((it) => it.x + it.w <= hint.gapAt).length;
  const right = items.filter((it) => it.x >= hint.gapAt).length;
  const cross = items.length - left - right;
  return left >= 1 && right >= 1 && cross <= Math.max(2, items.length * 0.12) ? hint : null;
};

/** → { lines, gap } (gap: sonraki sayfaya ipucu). */
const pageLines = async (page, hint = null) => {
  const { items: raw } = await page.getTextContent();
  const W = page.getViewport({ scale: 1 }).width;
  const items = rawItems(raw);
  const H = page.getViewport({ scale: 1 }).height;
  const gap = columnGap(items, W) || hintedGap(items, hint);
  if (!gap) return { H, lines: toLines(items).map((l) => ({ ...l, col: 0 })), gap: null };
  const left = items.filter((it) => it.x + it.w <= gap.gapAt);
  const right = items.filter((it) => it.x >= gap.gapAt);
  const wide = items.filter((it) => it.x + it.w > gap.gapAt && it.x < gap.gapAt);
  const topOfColumns = Math.max(...[...left, ...right].map((it) => it.y));
  // Sütunları kesen satırlar: başlık (üstte) ya da dipnot (altta). col: satırın sütunu; paragraf kuralları sütun başına uygulanır.
  const tag = (list, col) => list.map((l) => ({ ...l, col }));
  return { H, gap, lines: [...tag(toLines(wide.filter((it) => it.y > topOfColumns)), 0), ...tag(toLines(left), 1), ...tag(toLines(right), 2), ...tag(toLines(wide.filter((it) => it.y <= topOfColumns)), 3)] };
};

// ── paragraf ──
const bodySizeOf = (pages) => {
  const weight = new Map();
  for (const p of pages) for (const l of p.lines) weight.set(l.size, (weight.get(l.size) || 0) + l.text.length);
  let best = 0;
  let top = -1;
  for (const [size, w] of weight) if (w > top) { top = w; best = size; }
  return best || 10;
};

// ── üst/alt bilgi ──
const stripRunningLines = (pages) => {
  const keyOf = (t) => t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ');
  const count = new Map();
  // Bölüm adı üst bilgisi yalnız o bölümün sayfalarında tekrar eder (kitabın %25'ine ulaşmaz): anahtar → sayfa listesi, yakın sayfalar ayrıca sayılır.
  const seenOn = new Map();
  for (const p of pages) {
    const edge = [...p.lines.slice(0, 2), ...p.lines.slice(-2)];
    for (const k of new Set(edge.map((l) => keyOf(l.text)))) {
      count.set(k, (count.get(k) || 0) + 1);
      if (!seenOn.has(k)) seenOn.set(k, []);
      seenOn.get(k).push(p.pg);
    }
  }
  const nearby = (k, pg) => (seenOn.get(k) || []).filter((x) => Math.abs(x - pg) <= 12).length;
  const limit = Math.max(3, Math.ceil(pages.length * 0.25));
  const body = bodySizeOf(pages);
  for (const p of pages) {
    // Sayfanın üst/alt %8'lik şeridi: boşluk ölçüsü tutmasa da (sıkı dizilmiş sayfa) buradaki tekrar eden satır üst/alt bilgidir.
    const inBand = (l) => p.H > 0 && (l.y > p.H * 0.92 || l.y < p.H * 0.08);
    // Sayfa numarası her zaman; tekrar eden satır ise gövdeden en az biraz ayrık olmalı (gövde satırı olağan aralıkla dizilir).
    const banded = (l, gap) => inBand(l) && l.text.length <= 120 && (PAGE_NO.test(l.text) || (gap > usual * 1.2 && nearby(keyOf(l.text), p.pg) >= 3));
    const gaps = [];
    for (let i = 1; i < p.lines.length; i++) {
      const d = Math.abs(p.lines[i - 1].y - p.lines[i].y);
      if (d > 0) gaps.push(d);
    }
    const usual = median(gaps);
    // Yalnız en dıştaki satır aday olur (en çok iki kez: başlık + bölüm adı gibi iki satırlı üst bilgi). Gövdeden belirgin boşlukla
    // ayrılmalı (paragraf arası boşluk yetmez); aynı satır birçok sayfanın kenarında tekrarlanmalı. Sayfa numarası tekrar şartı aramaz.
    const running = (l, gap) => {
      if (banded(l, gap)) return true;
      // Gövdeden küçük yazıda (çoğu üst/alt bilgi) daha az boşluk yeter.
      if (!(gap > usual * (l.size < body * 0.85 ? 1.25 : 1.8))) return false;
      if (PAGE_NO.test(l.text)) return true;
      return l.text.length <= 120 && (count.get(keyOf(l.text)) || 0) >= limit;
    };
    for (let pass = 0; pass < 2 && p.lines.length > 1; pass++) {
      const L = p.lines;
      if (running(L[0], Math.abs(L[0].y - L[1].y))) L.shift();
      if (L.length > 1 && running(L[L.length - 1], Math.abs(L[L.length - 2].y - L[L.length - 1].y))) L.pop();
    }
    if (p.lines.length === 1 && PAGE_NO.test(p.lines[0].text)) p.lines = [];
  }
};

// ── kitap dışı sayfalar ──
const pageFacts = (p) => {
  const texts = p.lines.map((l) => l.text);
  const words = texts.reduce((n, t) => n + wordsOf(t), 0);
  const legal = texts.filter((t) => LEGAL.test(t)).length;
  const all = texts.join(' ');
  const promo = PROMO.filter((re) => re.test(all)).length;
  const head = texts.slice(0, 2).map((t) => t.trim());
  const entries = texts.filter((t) => TOC_ENTRY.test(t) && !ENDS.test(t)).length;
  const toc = head.some((t) => TOC_HEAD.test(t)) || (texts.length >= 4 && entries / texts.length >= 0.6 && words < 400);
  return { words, legal, promo, toc, index: head.some((t) => INDEX_HEAD.test(t)), lines: texts.length };
};

/** İçindekiler sayfasından { title, page } (yazılı sayfa numarası; PDF sayfasıyla eşleşmeyebilir, bölüm sınırı başlıkla bulunur). */
const tocEntries = (p) => {
  const out = [];
  for (const l of p.lines) {
    const m = TOC_ENTRY.exec(l.text);
    if (!m || TOC_HEAD.test(l.text.trim())) continue;
    const title = m[1].replace(/[\s.·…_-]+$/, '').trim();
    if (title.length >= 2 && title.length <= 160) out.push({ title });
  }
  return out;
};

/**
 * Okuma moduna girmeyecek sayfalar: baştaki telif, başlık/ithaf, içindekiler; sondaki yayınevi reklamı, arka kapak, dizin.
 * Yalnız kitabın başında ve sonunda art arda gelen sayfalara bakılır; gövde başladıktan sonra tek bir telif/içindekiler sayfası da atlanır.
 * → { skipped: Set<pg>, toc: [{ title }] }
 */
const frontBackMatter = (pages) => {
  const skipped = new Set();
  const toc = [];
  if (pages.length < 4) return { skipped, toc };
  const facts = new Map(pages.map((p) => [p.pg, pageFacts(p)]));
  const legalPage = (f) => f.legal >= 2 && (f.legal / Math.max(1, f.lines) >= 0.25 || f.words < 200);
  const FRONT = Math.min(25, Math.ceil(pages.length * 0.3));
  let bodyStarted = false;
  for (const p of pages.slice(0, FRONT)) {
    const f = facts.get(p.pg);
    if (f.toc) { toc.push(...tocEntries(p)); skipped.add(p.pg); continue; }
    if (legalPage(f)) { skipped.add(p.pg); continue; }
    if (!bodyStarted && f.words < 40) { skipped.add(p.pg); continue; }
    bodyStarted = true;
  }
  const BACK = Math.min(12, Math.ceil(pages.length * 0.15));
  for (const p of pages.slice(-BACK).reverse()) {
    const f = facts.get(p.pg);
    // Kısa son sayfa hikâyenin son cümleleri olabilir: cümle bitiren satır varsa kalır ("THE END", boş sayfa atılır).
    const junk = f.index || legalPage(f) || f.promo >= 2 || (f.legal >= 1 && f.promo >= 1) || (f.words < 25 && !p.lines.some((l) => ENDS.test(l.text)));
    if (!junk) break;
    skipped.add(p.pg);
  }
  // Hepsi atılacaksa (kısa belge, broşür) hiçbir şey atılmaz.
  if (skipped.size >= pages.length) return { skipped: new Set(), toc };
  return { skipped, toc };
};

const joinLine = (buf, next) => {
  if (/[\p{L}]-$/u.test(buf) && /^\p{Ll}/u.test(next)) return buf.slice(0, -1) + next;
  return `${buf} ${next}`;
};

/** Uzun blok sentence sınırında parçalanır (cümle önbelleği cümle metnine bağlı olduğu için cümle bölünmez). */
export const splitLong = (block) => {
  if (block.t !== 'p' || block.x.length <= BOOK_LIMITS.blockChars) return [block];
  const out = [];
  let buf = '';
  for (const s of splitSentences(block.x)) {
    if (buf && buf.length + s.text.length + 1 > BOOK_LIMITS.blockChars) { out.push({ ...block, x: buf }); buf = ''; }
    buf = buf ? `${buf} ${s.text}` : s.text;
  }
  if (buf) out.push({ ...block, x: buf });
  return out;
};

const ocrBlocks = (text, pg) => {
  const out = [];
  const src = String(text || '').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\*\*|__/g, '').replace(/\r\n?/g, '\n');
  for (const chunk of src.split(/\n\s*\n/)) {
    const raw = chunk.trim();
    if (!raw || /^[-*_|\s]+$/.test(raw)) continue;
    const m = /^#{1,6}\s+(.*)$/s.exec(raw);
    if (m) { out.push({ t: 'h', x: clean(m[1]), pg }); continue; }
    if (/^\s*\|/.test(raw)) { out.push({ t: 'p', x: clean(raw.replace(/\|/g, ' ').replace(/-{3,}/g, ' ')), pg }); continue; }
    const lines = raw.split('\n').map(clean).filter(Boolean);
    if (PAGE_NO.test(lines.join(' '))) continue;
    out.push({ t: 'p', x: lines.reduce((b, l) => (b ? joinLine(b, l) : l), ''), pg });
  }
  return out;
};

const buildBlocks = (pages) => {
  const body = bodySizeOf(pages);
  const blocks = [];
  let para = null;
  let heading = null;
  const flush = () => {
    if (para) blocks.push(...splitLong({ t: 'p', x: para.x, pg: para.pg }));
    para = null;
  };
  const flushHeading = () => {
    if (heading) blocks.push({ t: 'h', x: heading.x, pg: heading.pg });
    heading = null;
  };
  // Önceki sayfanın son satırı sağ kenara kadar doluysa paragraf yeni sayfada sürer (cümle tam sayfa sonunda bitse de).
  let lastFull = false;
  for (const p of pages) {
    if (p.ocr) {
      flushHeading();
      const list = p.blocks;
      // Sayfa sonunda yarım kalan cümle bir sonraki taranmış sayfada sürer.
      lastFull = false;
      if (para && list[0]?.t === 'p' && !ENDS.test(para.x) && /^\p{Ll}/u.test(list[0].x)) {
        para.x = joinLine(para.x, list[0].x);
        list.shift();
      }
      if (list.length) flush();
      blocks.push(...list.flatMap(splitLong));
      continue;
    }
    // Satır aralığı, sol kenar ve sağ kenar sütun başına (iki sütunlu sayfada sol sütun satırı sayfanın sağ kenarına göre kısa sayılmasın).
    const stats = new Map();
    for (const col of new Set(p.lines.map((l) => l.col))) {
      const ls = p.lines.filter((l) => l.col === col);
      const gaps = [];
      for (let i = 1; i < ls.length; i++) {
        const d = ls[i - 1].y - ls[i].y;
        if (d > 0 && d < ls[i].size * 3) gaps.push(d);
      }
      stats.set(col, { lineGap: median(gaps) || body * 1.3, margin: median(ls.map((l) => l.x)), maxRight: Math.max(...ls.map((l) => l.right || 0), 0) });
    }
    const isFull = (l) => {
      const st = stats.get(l.col);
      return (l.right || 0) >= st.maxRight - (st.maxRight - st.margin) * 0.06;
    };
    let prev = null;
    for (const l of p.lines) {
      // Şekil/tablo etiketi ve dipnot işareti: gövdeden belirgin küçük, kısa ve cümle olmayan satır metne karışmasın.
      if (l.size < body * 0.8 && l.text.length <= 30 && !ENDS.test(l.text)) continue;
      const { lineGap, margin, maxRight } = stats.get(l.col);
      const big = l.size >= body * 1.18;
      const short = l.text.length <= 140 && !/[,;:]$/.test(l.text);
      const upper = l.text.length >= 3 && l.text.length <= 80 && /\p{Lu}/u.test(l.text) && l.text === l.text.toLocaleUpperCase('en') && /\p{L}{2}/u.test(l.text);
      const isHead = short && (big || (CHAPTER.test(l.text) && l.text.length <= 80 && !ENDS.test(l.text)) || (upper && !ENDS.test(l.text)));
      if (isHead) {
        flush();
        if (heading && prev && prev.col === l.col && prev.y - l.y < l.size * 2.2) heading.x = `${heading.x} ${l.text}`;
        else { flushHeading(); heading = { x: l.text, pg: p.pg }; }
        prev = l;
        continue;
      }
      flushHeading();
      // Sayfa ya da sütun geçişi: önceki satır kenara kadar doluysa paragraf sürer, değilse ve cümle bittiyse yeni paragraf.
      const brk = !prev || prev.col !== l.col;
      const sameCol = !brk;
      const gapHuge = sameCol && prev.y - l.y > lineGap * 1.55;
      const indented = l.x - margin > l.size * 0.6 && (brk || ENDS.test(prev.text));
      const prevShort = sameCol && ENDS.test(prev.text) && (prev.right || 0) < maxRight - (maxRight - margin) * 0.12;
      const fullBefore = prev ? isFull(prev) : lastFull;
      const freshAfterBreak = brk && para && !fullBefore && ENDS.test(para.x) && !/^\p{Ll}/u.test(l.text);
      const startNew = !para || gapHuge || indented || prevShort || BULLET.test(l.text) || freshAfterBreak;
      if (startNew) {
        flush();
        para = { x: l.text, pg: p.pg };
      } else para.x = joinLine(para.x, l.text);
      prev = l;
    }
    const last = p.lines[p.lines.length - 1];
    lastFull = Boolean(last && para && isFull(last));
  }
  flushHeading();
  flush();
  return blocks;
};

// ── bölümler ──
const outlineStarts = async (pdf) => {
  let outline = null;
  try { outline = await pdf.getOutline(); } catch { return []; }
  if (!outline?.length) return [];
  let items = outline;
  if (items.length <= 2 && items.some((i) => i.items?.length >= 2)) items = items.flatMap((i) => [i, ...(i.items || [])]);
  const out = [];
  for (const it of items) {
    try {
      const dest = typeof it.dest === 'string' ? await pdf.getDestination(it.dest) : it.dest;
      if (!Array.isArray(dest) || !dest[0]) continue;
      const idx = typeof dest[0] === 'number' ? dest[0] : await pdf.getPageIndex(dest[0]);
      out.push({ title: clean(it.title).slice(0, 300) || null, page: idx + 1 });
    } catch { /* bozuk hedef atlanır */ }
  }
  const sorted = out.sort((a, b) => a.page - b.page);
  return sorted.filter((s, i) => !i || s.page > sorted[i - 1].page);
};

const norm = (t) => String(t || '').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** İçindekiler girdileri gövdedeki başlık bloklarıyla sırayla eşlenir → bölüm başı blok indeksleri (en az 2 eşleşme). */
const tocCuts = (blocks, toc) => {
  const cuts = [];
  let from = 0;
  // Başlık sayfa/satır sonunda bölünüp alt başlıkla birleşebilir ("The Biggest Ship in" + "The biggest and the best!"): baştan eşit kelime sayısı yeter.
  const same = (want, got) => {
    const a = want.split(' ');
    const b = got.split(' ');
    let k = 0;
    while (k < a.length && k < b.length && a[k] === b[k]) k++;
    return k === a.length || k === b.length || (k >= 3 && k >= a.length * 0.6);
  };
  for (const e of toc) {
    const want = norm(e.title);
    if (want.length < 3) continue;
    for (let i = from; i < blocks.length; i++) {
      const got = norm(blocks[i].x);
      if (blocks[i].t === 'h' && got.length >= 3 && same(want, got)) {
        cuts.push({ title: e.title.slice(0, 300), at: i });
        from = i + 1;
        break;
      }
    }
  }
  return cuts.length >= 2 ? cuts : null;
};

const makeSections = (blocks, starts, pageCount, toc = []) => {
  let marks = starts.length >= 2 ? starts : [];
  let byIndex = null;
  const fromToc = !marks.length ? tocCuts(blocks, toc) : null;
  if (!marks.length && !fromToc) {
    const heads = [];
    blocks.forEach((b, i) => { if (b.t === 'h' && CHAPTER.test(b.x)) heads.push(i); });
    if (heads.length >= 2) byIndex = heads;
  }
  const groups = [];
  if (fromToc) {
    if (fromToc[0].at > 0) groups.push({ title: null, blocks: blocks.slice(0, fromToc[0].at) });
    fromToc.forEach((c, i) => groups.push({ title: c.title, blocks: blocks.slice(c.at, fromToc[i + 1]?.at ?? blocks.length) }));
  } else if (byIndex) {
    if (byIndex[0] > 0) groups.push({ title: null, blocks: blocks.slice(0, byIndex[0]) });
    byIndex.forEach((at, i) => groups.push({ title: blocks[at].x.slice(0, 300), blocks: blocks.slice(at, byIndex[i + 1] ?? blocks.length) }));
  } else if (marks.length) {
    // Bölüm sayfanın ortasında başlayabilir: o sayfada içindekiler başlığıyla eşleşen başlık bloğu varsa sınır odur, yoksa sayfa başı.
    const startOf = (m) => {
      const first = blocks.findIndex((b) => b.pg >= m.page);
      if (first < 0) return blocks.length;
      const want = norm(m.title);
      if (want) {
        for (let i = first; i < blocks.length && blocks[i].pg === m.page; i++) {
          const got = norm(blocks[i].x);
          if (blocks[i].t === 'h' && got && (got.startsWith(want) || want.startsWith(got))) return i;
        }
      }
      return first;
    };
    const cuts = marks.map((m) => ({ title: m.title, at: startOf(m) }));
    if (cuts[0].at > 0) cuts.unshift({ title: null, at: 0 });
    cuts.forEach((c, i) => {
      const end = Math.max(c.at, cuts[i + 1]?.at ?? blocks.length);
      groups.push({ title: c.title, blocks: blocks.slice(c.at, end) });
    });
  } else {
    for (let from = 1; from <= pageCount; from += BOOK_LIMITS.pagesPerChunk) {
      const to = from + BOOK_LIMITS.pagesPerChunk;
      groups.push({ title: null, blocks: blocks.filter((b) => b.pg >= from && b.pg < to) });
    }
  }
  return chunkGroups(groups);
};

/** Uzun bölüm parçalanır: tek bölüm 5000 kelimeyi geçmez, ekran ve istek küçük kalır. groups: [{ title, blocks }] */
export const chunkGroups = (groups) => {
  const sections = [];
  for (const g of groups) {
    if (!g.blocks.length) continue;
    let cur = [];
    let words = 0;
    let part = 0;
    const push = () => {
      if (!cur.length) return;
      part += 1;
      sections.push({ title: g.title, part, blocks: cur, wordCount: words, pageStart: cur[0].pg, pageEnd: cur[cur.length - 1].pg });
      cur = [];
      words = 0;
    };
    for (const b of g.blocks) {
      const w = wordsOf(b.x);
      if (words && words + w > BOOK_LIMITS.sectionWords) push();
      cur.push(b);
      words += w;
    }
    push();
  }
  return sections.map((s, position) => ({ ...s, position }));
};

/**
 * @param data PDF baytları (Uint8Array)
 * @param ocrPages { [sayfa]: metin } taranmış sayfaların OCR çıktısı
 * @returns { pageCount, textlessPages, sections, wordCount, info }
 */
export const extractBook = async (data, { ocrPages = {} } = {}) => {
  const pdf = await getDocumentProxy(data, { verbosity: 0, isEvalSupported: false, disableFontFace: true, useSystemFonts: false }).catch((e) => {
    if (e?.name === 'PasswordException') throw fail('READING_PDF_PASSWORD');
    throw fail('READING_PDF_INVALID');
  });
  try {
    if (pdf.numPages > BOOK_LIMITS.maxPages) throw fail('READING_PDF_TOO_LONG');
    const pages = [];
    const textlessPages = [];
    let chars = 0;
    let colHint = null;
    for (let pg = 1; pg <= pdf.numPages; pg++) {
      if (ocrPages[pg] !== undefined) {
        const blocks = ocrBlocks(ocrPages[pg], pg);
        pages.push({ pg, ocr: true, blocks, lines: [] });
        chars += String(ocrPages[pg]).length;
        continue;
      }
      const page = await pdf.getPage(pg);
      const out = await pageLines(page, colHint);
      const { lines, H } = out;
      if (out.gap) colHint = out.gap;
      page.cleanup();
      const n = lines.reduce((sum, l) => sum + l.text.length, 0);
      chars += n;
      if (chars > BOOK_LIMITS.maxChars) throw fail('READING_PDF_TOO_LONG');
      if (n < BOOK_LIMITS.textlessChars) textlessPages.push(pg);
      pages.push({ pg, lines, H });
    }
    const textPages = pages.filter((p) => !p.ocr);
    stripRunningLines(textPages);
    const { skipped, toc } = frontBackMatter(textPages);
    // Adres satırı reklam sayfasını tanımaya yarar; sayfa kararından sonra atılır.
    for (const p of textPages) p.lines = skipped.has(p.pg) ? [] : p.lines.filter((l) => !JUNK_LINE.test(l.text));
    const blocks = buildBlocks(pages);
    const sections = makeSections(blocks, await outlineStarts(pdf), pdf.numPages, toc);
    const wordCount = sections.reduce((n, s) => n + s.wordCount, 0);
    let info = {};
    try { info = (await pdf.getMetadata())?.info || {}; } catch { /* yoksay */ }
    const author = clean(info.Author || '');
    return { pageCount: pdf.numPages, textlessPages, skippedPages: [...skipped].sort((a, b) => a - b), sections, wordCount, author: author.length >= 3 && author.length <= 120 && !/^(unknown|admin|user|microsoft)/i.test(author) ? author : null };
  } finally {
    // Alt süreç iş bitince kapanır; pdf.js belleği onunla gider.
    await pdf.cleanup?.().catch?.(() => {});
  }
};

/** Metin katmanı olmayan belge mi? (OCR gerektirir) */
export const isScanned = ({ pageCount, textlessPages, wordCount }) => textlessPages.length / Math.max(1, pageCount) >= BOOK_LIMITS.scannedRatio || wordCount < pageCount * 5;
