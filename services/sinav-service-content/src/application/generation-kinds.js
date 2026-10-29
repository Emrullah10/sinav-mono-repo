// Yapay zekâ taslak üretimi: not ve metin (passage) türleri için istemler, doğrulama ve gövde kurucular.
// Soru türü istemi generation.js'te kalır. Her sistem istemi `[gen:<tür>]` işaretiyle başlar (sahte LLM bunu okur).

export const LABELS = ['A', 'B', 'C', 'D', 'E'];
export const HINT_KINDS = ['focus', 'rule', 'eliminate', 'solution'];
export const READING_KINDS = ['main_idea', 'inference', 'detail', 'vocabulary_in_context', 'author_attitude'];
export const PASSAGE_KINDS = ['reading', 'cloze', 'paragraph'];
export const NOTE_KINDS = ['skill', 'strategy'];
export const AREAS = ['health', 'science', 'social'];
export const PARAGRAPH_TYPES = ['paragraph_completion', 'irrelevant_sentence'];

export const QUESTIONS_PER_PASSAGE = { reading: 4, cloze: 5, paragraph: 1 };
export const MAX_COUNT = { question: 60, note: 10, passage: 10 };
/** İstek başına üretilen birim sayısı (paragraf: 3 kısa metin; diğerleri tek). */
export const unitsPerRequest = (p) => (p.kind === 'question' ? 5 : p.kind === 'passage' && p.passageKind === 'paragraph' ? 3 : 1);
export const maxTokensFor = (p) => (p.kind === 'note' ? 8000 : p.kind === 'passage' ? 12000 : 6000);

const nz = (s) => typeof s === 'string' && s.trim().length > 0;
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const TR = 'Turkish text must be calm, second person ("sen"), no exclamation marks or emoji.';

const questionShape = (labels, extra) => `{"stem": string${extra.stem || ''},
 "options": array of exactly ${labels.length} objects {"label": ${labels.map((l) => `"${l}"`).join('|')}, "text": string, "rationale": string|null} (Turkish rationale for each WRONG option, null for the correct one),
 "correctLabel": ${labels.map((l) => `"${l}"`).join('|')}, "shortReason": Turkish, one short sentence starting with "Doğru.", "explanation": Turkish, 2-4 sentences,
 "hints": array of exactly 4 objects in this order {"kind":"focus","body"}, {"kind":"rule","body"}, {"kind":"eliminate","body","eliminatesLabels":[two different WRONG labels]}, {"kind":"solution","body"} (Turkish),
 "difficulty": 1-5, "estimatedSeconds": integer${extra.fields || ''}}`;

const COMMON = `Content must be original (never copy real exam questions or published texts), academic register, distractors plausible, no two options identical. ${TR}`;

// ── not ──────────────────────────────────────────────────────────────────
export const notePrompts = (p, existingTitles) => ({
  system: `[gen:note]
You write original study notes ("hap not") in Turkish for students preparing for ${p.examKey || 'YDS'}-style English exams. A note is short enough to read in about 60-120 seconds.
Return ONLY a JSON object {"note": {...}}. The note object has:
"title" (Turkish, specific), "summary" (Turkish, one sentence), "readingSeconds" (integer 40-150),
"ruleMd" (Turkish Markdown: 3-6 bullet points, English terms in *italics*, key ideas in **bold**),
"examples" (array of 2-4 objects {"en": English sentence, "tr": Turkish translation}),
"trapMd" (Turkish Markdown, the common exam trap, 1-3 sentences) or null,
"checks" (array of 2 or 3 quick check questions of the given check question type, each exactly:
${questionShape(LABELS, {})}).
${COMMON}`,
  user: `Write 1 ${p.noteKind} note.
Skill: ${p.skillKeys.join(', ')}
Check question type: ${p.questionTypeKey}
Target difficulty: ${p.difficulty} (1 easy .. 5 hard)
${p.topic ? `Focus: ${p.topic}\n` : ''}${p.instructions ? `Extra instructions: ${p.instructions}\n` : ''}${existingTitles.length ? `Existing note titles (do not repeat these topics): ${existingTitles.join(' | ')}\n` : ''}`,
});

// ── metin ────────────────────────────────────────────────────────────────
const PASSAGE_SPEC = {
  reading: { words: '180-260', body: 'an academic expository text in 3-4 paragraphs separated by blank lines', q: (n) => `exactly ${n} questions; each has "readingQuestionKind" (one of ${READING_KINDS.join('|')}); use at least 3 different kinds; no blanks` },
  cloze: { words: '120-170', body: 'a coherent academic text with exactly 5 numbered blanks written as {{1}} {{2}} {{3}} {{4}} {{5}} in the text', q: () => 'exactly 5 questions, one per blank, each has "blankNo" (1-5) and "stem" set to "Blank <n>: choose the option that best completes the passage."; options are the words or phrases that fit the blank' },
  paragraph: { words: '70-110', body: 'a short academic paragraph', q: () => 'exactly 1 question. For paragraph_completion: one sentence of the paragraph is replaced by "______", stem "Choose the sentence that best completes the paragraph.", and the options are five candidate sentences. For irrelevant_sentence: the paragraph has exactly five sentences, each preceded by [[I]] [[II]] [[III]] [[IV]] [[V]], stem "Which numbered sentence breaks the flow of the paragraph?", and the options A-E are the texts "I", "II", "III", "IV", "V"' },
};

export const passagePrompts = (p, n, existingTitles) => {
  const spec = PASSAGE_SPEC[p.passageKind];
  const qCount = QUESTIONS_PER_PASSAGE[p.passageKind];
  return {
    system: `[gen:passage:${p.passageKind}]
You write original English passages with multiple-choice questions for Turkish students preparing for ${p.examKey || 'YDS'}-style exams.
Return ONLY a JSON object {"passages": [ ... ]} with exactly ${n} passage object(s). Each passage object has:
"title" (English), "body" (${spec.body}; ${spec.words} words), "terms" (array of up to 4 objects {"term": English word or phrase from the text, "definitionTr": Turkish meaning}),
"questions" (${spec.q(qCount)}), where every question is exactly:
${questionShape(LABELS, { fields: ', plus "readingQuestionKind" or "blankNo" as stated above' })}
${COMMON} The passage must not rely on outside knowledge; every answer must be derivable from the text.`,
    user: `Write ${n} ${p.passageKind} passage(s).
${p.questionTypeKey && p.passageKind === 'paragraph' ? `Question type: ${p.questionTypeKey}\n` : ''}Subject area: ${p.subjectAreaKey || 'any academic area'}
Skills: ${p.skillKeys.join(', ') || 'any suitable'}
Target difficulty: ${p.difficulty} (1 easy .. 5 hard)
${p.topic ? `Topic: ${p.topic}\n` : ''}${p.instructions ? `Extra instructions: ${p.instructions}\n` : ''}${existingTitles.length ? `Existing titles (do not repeat these topics): ${existingTitles.join(' | ')}\n` : ''}Vary the correct option label across questions.`,
  };
};

// ── kontrol (cevap anahtarını bağımsız çözdür) ───────────────────────────────
export const checkPrompts = ({ passageBody = null, questions }) => ({
  system: `[gen:check]
You solve English multiple-choice questions. Return ONLY a JSON object {"answers": [{"n": <question number>, "label": "<option label>"}]} with one entry per question. Choose the single best option; do not explain.`,
  user: `${passageBody ? `Passage:\n${passageBody}\n\n` : ''}${questions.map((q, i) => `Q${i + 1}. ${q.stem || '(see blank in passage)'}${q.blankNo ? ` [blank ${q.blankNo}]` : ''}\nOptions: ${q.options.map((o) => `${o.label}) ${o.text}`).join('  ')}`).join('\n\n')}`,
});

// ── doğrulama ────────────────────────────────────────────────────────────
const optionList = (q) => (Array.isArray(q.options) ? q.options : Object.entries(q.options || {}).map(([label, text]) => ({ label, text })));

export const checkQuestion = (q, { labels = LABELS, reading = false, cloze = false } = {}) => {
  const e = [];
  if (!q || typeof q !== 'object') return ['soru nesne değil'];
  if (!cloze && !nz(q.stem)) e.push('stem boş');
  if (!nz(q.explanation)) e.push('explanation boş');
  const opts = optionList(q);
  if (opts.length !== labels.length || !labels.every((l, i) => String(opts[i]?.label || labels[i]).toUpperCase() === l)) e.push(`şıklar ${labels.join('')} olmalı`);
  else {
    if (opts.some((o) => !nz(o.text))) e.push('boş şık');
    if (new Set(opts.map((o) => String(o.text).trim().toLowerCase())).size !== opts.length) e.push('yinelenen şık');
  }
  if (!labels.includes(String(q.correctLabel || '').toUpperCase())) e.push('correctLabel geçersiz');
  if (reading && !READING_KINDS.includes(q.readingQuestionKind)) e.push('readingQuestionKind geçersiz');
  if (cloze && !(Number.isInteger(q.blankNo) && q.blankNo >= 1)) e.push('blankNo geçersiz');
  // Gönderim doğrulaması (bodies.js validateBody) tam 4 ipucu ister; bozuk ipucuyla kaydedilen taslak gönderilemez.
  const correct = String(q.correctLabel || '').toUpperCase();
  const h = Array.isArray(q.hints) ? q.hints : [];
  if (h.length !== 4 || !HINT_KINDS.every((k, i) => h[i]?.kind === k && nz(h[i]?.body))) e.push('hints sırayla focus/rule/eliminate/solution olmalı');
  else {
    const el = h[2].eliminatesLabels;
    if (!Array.isArray(el) || el.length !== 2 || new Set(el).size !== 2 || el.some((l) => !labels.includes(String(l).toUpperCase()) || String(l).toUpperCase() === correct)) e.push('eliminate ipucu iki farklı yanlış şık olmalı');
  }
  return e;
};

export const checkNote = (n, p) => {
  const e = [];
  if (!n || typeof n !== 'object') return ['not nesne değil'];
  for (const k of ['title', 'summary', 'ruleMd']) if (!nz(n[k])) e.push(`${k} boş`);
  if (!Array.isArray(n.examples) || !n.examples.length || n.examples.some((x) => !nz(x?.en) || !nz(x?.tr))) e.push('examples geçersiz');
  if (!Array.isArray(n.checks) || n.checks.length < 2 || n.checks.length > 3) e.push('checks 2-3 soru olmalı');
  else n.checks.forEach((c, i) => { const ce = checkQuestion(c); if (ce.length) e.push(`check[${i}]: ${ce.join(', ')}`); });
  return e;
};

export const checkPassage = (x, p) => {
  const e = [];
  if (!x || typeof x !== 'object') return ['metin nesne değil'];
  if (!nz(x.title)) e.push('title boş');
  const minWords = { reading: 120, cloze: 80, paragraph: 40 }[p.passageKind];
  if (words(x.body) < minWords) e.push(`body çok kısa (${words(x.body)} sözcük)`);
  const want = QUESTIONS_PER_PASSAGE[p.passageKind];
  if (!Array.isArray(x.questions) || x.questions.length !== want) { e.push(`${want} soru gerekli`); return e; }
  if (p.passageKind === 'cloze') {
    for (let i = 1; i <= want; i += 1) if (!String(x.body).includes(`{{${i}}}`)) e.push(`gövdede {{${i}}} boşluğu yok`);
    if (new Set(x.questions.map((q) => q.blankNo)).size !== want) e.push('blankNo yinelenen');
  }
  if (p.passageKind === 'paragraph' && p.questionTypeKey === 'irrelevant_sentence' && !/\[\[I\]\]/.test(String(x.body))) e.push('gövdede [[I]]..[[V]] işaretleri yok');
  x.questions.forEach((q, i) => {
    const qe = checkQuestion(q, { reading: p.passageKind === 'reading', cloze: p.passageKind === 'cloze' });
    if (qe.length) e.push(`soru ${i + 1}: ${qe.join(', ')}`);
  });
  return e;
};

// ── gövde kurucular ──────────────────────────────────────────────────────
export const questionBody = (q, { questionTypeKey, difficulty, labels = LABELS }) => {
  const options = optionList(q);
  const correct = String(q.correctLabel || '').toUpperCase();
  return {
    questionTypeKey, stem: nz(q.stem) ? q.stem : `Blank ${q.blankNo ?? ''}: choose the option that best completes the passage.`,
    // Model istenmeyen alanlara geçersiz değer yazabiliyor; kayıt (bodies.js) bunları reddettiği için yalnız geçerli olanlar taşınır.
    difficulty: Math.min(5, Math.max(1, Math.trunc(Number(q.difficulty)) || difficulty)), estimatedSeconds: Number.isInteger(q.estimatedSeconds) && q.estimatedSeconds > 0 ? q.estimatedSeconds : null,
    shortReason: q.shortReason || null, explanation: q.explanation || '',
    readingQuestionKind: questionTypeKey === 'reading' && READING_KINDS.includes(q.readingQuestionKind) ? q.readingQuestionKind : null,
    blankNo: questionTypeKey === 'cloze' && Number.isInteger(q.blankNo) ? q.blankNo : null,
    options: options.map((o, i) => ({ label: String(o.label || labels[i]).toUpperCase(), text: o.text, rationale: o.rationale ?? null, isCorrect: String(o.label || labels[i]).toUpperCase() === correct })),
    hints: (q.hints || []).map((h, i) => ({ stepNo: i + 1, kind: h.kind, body: h.body, eliminatesLabels: (h.eliminatesLabels || []).map((l) => String(l).toUpperCase()) })),
  };
};

export const passageBody = (x, p) => ({
  passageKind: p.passageKind, title: x.title, body: x.body, bodyFormat: 'plain',
  terms: (Array.isArray(x.terms) ? x.terms : []).filter((t) => nz(t?.term) && nz(t?.definitionTr)).slice(0, 8).map((t) => ({ term: t.term, definitionTr: t.definitionTr })),
  questions: x.questions.map((q, i) => ({
    ...questionBody(q, { questionTypeKey: p.questionTypeKey, difficulty: p.difficulty }),
    groupPosition: p.passageKind === 'cloze' ? q.blankNo : i + 1,
  })),
});

export const noteBody = (n, p, checkCodes) => ({
  noteKind: p.noteKind, title: n.title, readingSeconds: Number(n.readingSeconds) || null, ruleMd: n.ruleMd, examples: n.examples.map((x) => ({ en: x.en, tr: x.tr })),
  trapMd: nz(n.trapMd) ? n.trapMd : null, summary: n.summary, checkQuestions: checkCodes.map((c, i) => ({ position: i + 1, questionItemCode: c })),
});

/** Soru türünü beceri anahtarından türetir (seed'deki checkType ile aynı mantık). */
export const checkTypeFromSkills = (skillKeys = []) => {
  const k = skillKeys[0] || '';
  if (k.startsWith('grammar')) return 'grammar';
  if (k.startsWith('vocab')) return 'vocabulary';
  if (k.startsWith('translation')) return 'translation';
  if (k.startsWith('reading')) return 'reading';
  return 'grammar';
};
