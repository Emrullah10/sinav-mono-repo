// Kitabın içindeki soru malzemesi okuma metninden ayrılır (çıkarma sürüm 3); kitap soruları (book-quiz.js) bunu kullanır.
// Kurallar bilerek temkinli: yanlışlıkla okuma metni atılmasın.
//   1) Başlığı etkinlik/alıştırma/soru olan bölüm (ör. "Activities", "Exercises", "Answer key") bütünüyle ayrılır.
//   2) Metin içindeki çoktan seçmeli test: ardışık bloklarda en az iki şık satırı ("a … b … c …") ve en az iki soru işareti.
//      Hemen önündeki kısa yönerge ("Try to answer these questions…") ve arkasındaki "(The answers are on page 44.)" de gider.
//   3) Cevap anahtarı satırı ("Answers to questions on page 1: 1a 2b 3b …") nerede olursa ayrılır.

const QUIZ_TITLE = /^(activities|exercises|questions|comprehension( questions)?|comprehension check|review( questions)?|discussion( questions)?|study questions|reading comprehension|answer key|answers( to (the )?(questions|activities|exercises))?|key to (the )?(activities|exercises))$/i;
const OPT_LOWER = /(?:^|\s)a\s+\S.*?\sb\s+\S.*?\sc\s+\S/;
const OPT_PAREN = /(?:^|\s)\(?[aA][).]\s+\S.*?\s\(?[bB][).]\s+\S.*?\s\(?[cC][).]\s+\S/;
const STEM = /^\d{1,2}[.)]?\s+\S.*\?/;
const KEY = /^\(?\s*answers?\b[^:\n]{0,60}:?\s*(?:\d{1,2}\s*[.)]?\s*[a-eA-E]\b[\s,;.]*){3,}/i;
const KEY_HINT = /^\(?\s*(?:the\s+)?(?:answers?\s+(?:are|is)\s+on\s+page\s+\d+|answer\s+key\b.*)\.?\s*\)?\.?$/i;
const INSTR = /\b(answer|answers|questions?|quiz|choose|circle|tick|true or false|correct)\b/i;
const MAX_TEXT = 30000;

const isOpt = (t) => OPT_LOWER.test(t) || OPT_PAREN.test(t);
const qMarks = (t) => (String(t).match(/\?/g) || []).length;
const norm = (t) => String(t || '').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const titleOf = (g) => String(g.title || (g.blocks[0]?.t === 'h' ? g.blocks[0].x : '') || '').replace(/\s+/g, ' ').trim();

/** Ardışık test blokları: [from, to) aralıkları. */
const quizRuns = (blocks) => {
  const runs = [];
  let i = 0;
  while (i < blocks.length) {
    let j = i;
    let opts = 0;
    let qs = 0;
    while (j < blocks.length && blocks[j].t !== 'h') {
      const x = String(blocks[j].x || '');
      const opt = isOpt(x);
      if (!opt && !STEM.test(x)) break;
      if (opt) opts += 1;
      qs += qMarks(x);
      j += 1;
    }
    if (opts >= 2 && qs >= 2) {
      let from = i;
      let to = j;
      const prev = blocks[from - 1];
      if (prev && prev.t !== 'h' && String(prev.x).length <= 240 && INSTR.test(prev.x)) from -= 1;
      const next = blocks[to];
      if (next && next.t !== 'h' && (KEY_HINT.test(String(next.x).trim()) || KEY.test(next.x))) to += 1;
      runs.push([from, to]);
      i = to;
    } else {
      i = Math.max(j, i + 1);
    }
  }
  return runs;
};

/**
 * groups: [{ title, blocks }] (bölüme ayrılmadan önce). Soru malzemesini çıkarır, gruplar yerinde değişir.
 * → { questions: [{ page, text }], activities: [{ page, text }], keys: [metin] } (boşsa null)
 */
export const pullQuizMaterial = (groups) => {
  const questions = [];
  const activities = [];
  const keys = [];
  const textOf = (bs) => bs.map((b) => String(b.x || '').trim()).filter(Boolean).join('\n');
  for (let gi = groups.length - 1; gi >= 0; gi -= 1) {
    const g = groups[gi];
    if (QUIZ_TITLE.test(norm(titleOf(g)))) {
      const rest = [];
      for (const b of g.blocks) (KEY.test(b.x) ? keys.push(String(b.x).trim()) : rest.push(b));
      const text = textOf(rest.filter((b, k) => !(k === 0 && b.t === 'h')));
      if (text) activities.unshift({ page: g.blocks[0]?.pg ?? null, text });
      groups.splice(gi, 1);
      continue;
    }
    const drop = new Set();
    for (const [from, to] of quizRuns(g.blocks)) {
      questions.unshift({ page: g.blocks[from].pg ?? null, text: textOf(g.blocks.slice(from, to)) });
      for (let k = from; k < to; k += 1) drop.add(k);
      // "Bölüm adı + test başlığı" birleşik başlık ("The Ship of Dreams How much do you already know?"): bölüm adına indirilir.
      const head = g.blocks[from - 1];
      if (head?.t === 'h' && /\?\s*$/.test(head.x)) {
        const title = String(g.title || '').trim();
        if (title && norm(head.x).startsWith(norm(title)) && norm(head.x) !== norm(title)) head.x = title;
        else if (!title || norm(head.x) !== norm(title)) drop.add(from - 1);
      }
    }
    g.blocks.forEach((b, k) => { if (!drop.has(k) && b.t !== 'h' && KEY.test(b.x)) { keys.push(String(b.x).trim()); drop.add(k); } });
    if (drop.size) g.blocks = g.blocks.filter((_, k) => !drop.has(k));
    // Yalnız başlık kalan grup okunacak bir şey taşımaz.
    if (!g.blocks.some((b) => b.t !== 'h')) groups.splice(gi, 1);
  }
  if (!questions.length && !activities.length && !keys.length) return null;
  // Saklanan malzeme sınırlı tutulur (kitap üst verisinde durur).
  let budget = MAX_TEXT;
  const cap = (list) => list.map((it) => {
    const text = it.text.slice(0, Math.max(0, budget));
    budget -= text.length;
    return { ...it, text };
  }).filter((it) => it.text);
  return { questions: cap(questions), activities: cap(activities), keys: keys.slice(0, 20).map((k) => k.slice(0, 600)) };
};
