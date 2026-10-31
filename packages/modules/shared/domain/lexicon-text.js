// Dokun-çevir metin kuralları — web, mobil ve sunucu aynı kuralı kullanır.
// Kelimeye dokununca sözlük, cümleye basılı tutunca cümle çevirisi açılır; burada yalnız metni parçalara ayırırız.
// Kelime: Latin harfleri (Türkçe dahil) + iç kesme/tire ("don't", "well-known"). Boşluk işaretleri
// ({{1}}, [[II]], ----, ____) kelime sayılmaz. SAF kod: node bağımlılığı yok (mobil vendor'a kopyalanır).

const LETTER = 'A-Za-z\\u00C0-\\u024F';
const WORD_RE = new RegExp(`(?:[A-Za-z]\\.){2,}|[${LETTER}]+(?:['’\\-][${LETTER}]+)*`, 'g');
const MARKER_RE = /\{\{\d+\}\}|\[\[[IVX]+\]\]|-{2,}|_{2,}|…{2,}/g;
const ABBR = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'vs', 'etc', 'e.g', 'i.e', 'no', 'fig', 'jr', 'sr', 'approx', 'u.s', 'u.k', 'dept', 'inc', 'ltd', 'co', 'ca']);
const CLOSERS = /[.!?…"'”’)\]]/;

/** Boşlukları tekleyip kırpar (önbellek anahtarı bu biçimden üretilir). */
export const normalizeSentence = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Sözlük anahtarı: küçük harf, düz kesme, iyelik ('s) ve uçtaki işaretler atılır. */
export const lexiconForm = (w) =>
  String(w ?? '')
    .normalize('NFKC')
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/^['-]+|['-]+$/g, '')
    .replace(/'s$/, '');

/**
 * Cümle aralıkları: [{ start, end, text }]. Satır sonu her zaman cümle bitirir; "e.g.", "Dr." gibi kısaltmalar,
 * "3.5" gibi sayılar ve küçük harfle devam eden metin cümle bitirmez.
 */
export const splitSentences = (text) => {
  const s = String(text ?? '');
  const out = [];
  let start = 0;
  const push = (end) => {
    const raw = s.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (t) out.push({ start: start + lead, end: start + lead + t.length, text: t });
    start = end;
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\n') {
      push(i);
      start = i + 1;
      continue;
    }
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '…') continue;
    let j = i + 1;
    while (j < s.length && CLOSERS.test(s[j])) j++;
    if (j < s.length && !/\s/.test(s[j])) continue;
    if (ch === '.') {
      const before = (/([A-Za-z.]+)$/.exec(s.slice(Math.max(0, i - 12), i))?.[1] || '').toLowerCase();
      if (ABBR.has(before) || /^[a-z]$/.test(before)) continue;
      let k = j;
      while (k < s.length && /[ \t]/.test(s[k])) k++;
      if (k < s.length && /[a-z]/.test(s[k])) continue;
    }
    push(j);
    i = j - 1;
  }
  push(s.length);
  return out;
};

/**
 * Metni dokunulabilir parçalara ayırır.
 * Biçimli metinde (kalın/italik parçalar) cümleler bütün paragraftan hesaplanır: her parça için
 * tokenize(parça, { sentences, offset }) çağrılır (offset: parçanın paragraf içindeki başlangıcı).
 * @returns {{ sentences: Array<{start,end,text}>, tokens: Array<{ text, start, word?: true, sentence: number }> }}
 *   token.sentence: içinde bulunduğu cümlenin sırası (cümle dışı boşluk/işaret için en yakın önceki; hiç yoksa -1).
 */
export const tokenize = (text, { sentences: given, offset = 0 } = {}) => {
  const s = String(text ?? '');
  const sentences = given || splitSentences(s);
  const masked = s.replace(MARKER_RE, (m) => ' '.repeat(m.length));
  const tokens = [];
  let si = 0;
  const sentenceAt = (local) => {
    const pos = offset + local;
    while (si < sentences.length - 1 && pos >= sentences[si + 1].start) si++;
    return sentences.length && pos >= sentences[0].start ? si : -1;
  };
  let last = 0;
  const re = new RegExp(WORD_RE.source, 'g');
  let m;
  while ((m = re.exec(masked))) {
    if (m.index > last) tokens.push({ text: s.slice(last, m.index), start: offset + last, sentence: sentenceAt(last) });
    tokens.push({ text: s.slice(m.index, m.index + m[0].length), start: offset + m.index, word: true, sentence: sentenceAt(m.index) });
    last = m.index + m[0].length;
  }
  if (last < s.length) tokens.push({ text: s.slice(last), start: offset + last, sentence: sentenceAt(last) });
  return { sentences, tokens };
};

/** Cümle çevirisi isteği: hedef cümlenin çevresinden sınırlara uyan bir pencere → { sentences, index } (null: hedef çok uzun). */
export const sentenceWindow = (list, index, limits = LEXICON_LIMITS) => {
  const texts = list.map((x) => normalizeSentence(typeof x === 'string' ? x : x.text));
  if (!texts[index] || texts[index].length > limits.sentenceMax) return null;
  let from = index;
  let to = index + 1;
  let total = texts[index].length;
  const fits = (i) => i >= 0 && i < texts.length && texts[i].length <= limits.sentenceMax && total + texts[i].length <= limits.blockMax && to - from < limits.sentencesMax;
  for (let grew = true; grew; ) {
    grew = false;
    if (fits(to)) { total += texts[to].length; to++; grew = true; }
    if (fits(from - 1)) { from--; total += texts[from].length; grew = true; }
  }
  return { sentences: texts.slice(from, to), index: index - from };
};

const TR_CHARS = /[çğışöüÇĞİŞÖÜ]/;
const EN_STOP = new Set(
  'the a an of to in is are was were and or but that this these those it its for on with as by at from be been being has have had not no can will would should could may might must do does did which who whom whose what when where why how than then there their they we you he she i my our your his her them us if so such into about more most also only very just'.split(' '),
);
const TR_STOP = new Set('ve bir bu için ile da de çok gibi ama olarak değil mi ne ki en daha var yok ya veya şu o her ise kadar sonra önce göre olan diye cok icin degil'.split(' '));

/** Karışık metinde (öğretmen mesajı, açıklama) cümle İngilizce mi? Türkçe harf ya da Türkçe bağlaç ağır basarsa hayır. */
export const looksEnglish = (sentence) => {
  const s = String(sentence ?? '');
  if (TR_CHARS.test(s)) return false;
  const words = s.toLowerCase().match(/[a-z']+/g) || [];
  if (!words.length) return false;
  let en = 0;
  let tr = 0;
  for (const w of words) {
    if (EN_STOP.has(w)) en++;
    if (TR_STOP.has(w)) tr++;
  }
  return tr <= en;
};

/** Cümle çevirisi isteğinde gönderilen sınırlar (sunucu da aynı sınırı uygular). */
export const LEXICON_LIMITS = Object.freeze({ wordMax: 40, sentenceMax: 600, sentencesMax: 40, blockMax: 8000 });

// ── Markdown (web Markdown bileşeninin ayrıştırıcısı) ──
// Web ekranı bu blokları çizer; sunucu (dokun-çevir ön-çevirisi) aynı fonksiyonlarla TapText'in göreceği düz satırları üretir.
// Cümle önbelleğinin anahtarı cümle metni olduğu için ikisi birebir aynı bölmeli — bu yüzden tek yerde durur.
/** Blok listesi: { type: 'h'|'hr'|'quote'|'ul'|'ol'|'p', text?, items?, level? } */
export const parseMarkdownBlocks = (src) => {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) { blocks.push({ type: 'h', level: m[1].length, text: m[2] }); i++; continue; }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { blocks.push({ type: 'hr' }); i++; continue; }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push({ type: 'quote', text: buf.join(' ') });
      continue;
    }
    if (/^\s*([-*])\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const re = ordered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
      const items = [];
      while (i < lines.length && re.test(lines[i])) items.push(re.exec(lines[i++])[1]);
      blocks.push({ type: ordered ? 'ol' : 'ul', items });
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>\s?|\s*[-*]\s+|\s*\d+[.)]\s+|-{3,}\s*$)/.test(lines[i])) buf.push(lines[i++]);
    if (!buf.length) { buf.push(lines[i++]); }
    blocks.push({ type: 'p', text: buf.join(' ') });
  }
  return blocks;
};

// Dokun-çevir için satırı düz parçalara ayırır (iç içe biçim tek düzeye iner): { text, bold?, italic?, code?, href? }.
export const markdownRuns = (text) => {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('**')) out.push({ text: tok.slice(2, -2).replace(/\*/g, ''), bold: true });
    else if (tok.startsWith('`')) out.push({ text: tok.slice(1, -1), code: true });
    else if (tok.startsWith('[')) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      out.push(mm ? { text: mm[1], href: mm[2] } : { text: tok });
    } else out.push({ text: tok.slice(1, -1), italic: true });
    last = m.index + tok.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
};

/** Markdown kaynağının dokunulabilir düz satırları (TapText'e giden metin; biçim işaretleri atılmış). */
export const markdownTapLines = (src) => parseMarkdownBlocks(src).flatMap((b) => (b.type === 'hr' ? [] : b.items || [b.text]))
  .map((t) => markdownRuns(t).map((r) => r.text).join(''));
