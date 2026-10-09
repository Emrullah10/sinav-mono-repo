// Demo öğrenciler (Elif, Zeynep): gerçek servisler (gateway) üzerinden kayıt, seviye tespiti, alıştırma,
// kelime tekrarı, hata defteri ve deneme. Cevap anahtarı yalnız DB'den OKUNUR (doğruluk oranını
// kişiliğe göre ayarlamak için); hiçbir tabloya doğrudan yazılmaz. Yeniden çalıştırmak güvenlidir:
// her adım mevcut durumu kontrol edip atlanır. Ayrıntı: docs/DEMO-DATA.md
//   npm run seed:demo            (ya da: node scripts/seed/demo-learners.mjs [--only elif|zeynep])
import { call, latestCode } from '../dev/client.mjs';
import { createHash } from 'node:crypto';
import { connect } from './db.mjs';

const ID = 'sinav-service-identity/v1/';
const LR = 'sinav-service-learning/v1/';
const BL = 'sinav-service-billing/v1/';
// clientRef UUID olmalı; aynı girdiden aynı UUID (yeniden çalıştırmada tekrar yanıt idempotent)
const ref = (s) => { const h = createHash('sha1').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Kişilikler ────────────────────────────────────────────────────────────────
// accuracy: hedef doğruluk; premium: deneme (trial) başlatılır, sınırsız soru/deneme.
const PERSONAS = {
  elif: {
    email: 'elif.demo@sinav.local', displayName: 'Elif', premium: true, targetScore: 75,
    reasons: ['academic_career'], availability: [45, 45, 30, 45, 30, 90, 90],
    diagnosticAccuracy: 0.6, accuracy: 0.72,
    practice: [{ types: ['reading'], count: 10 }, { types: ['grammar'], count: 10 }, { types: ['vocabulary'], count: 10 }, { count: 15 }, { count: 10, mode: 'timed' }],
    vocab: { deck: 'yds-frequent', newPerDay: 15, sessions: 2, limit: 25, goodRate: 0.8 },
    mocks: [{ type: 'mini', accuracy: 0.74 }, { type: 'full', accuracy: 0.7, blankRate: 0.05 }],
  },
  zeynep: {
    email: 'zeynep.demo@sinav.local', displayName: 'Zeynep', premium: false, targetScore: 55,
    reasons: ['job_requirement'], availability: [20, 0, 20, 0, 20, 40, 0],
    diagnosticAccuracy: 0.38, accuracy: 0.46,
    practice: [{ count: 8 }],
    vocab: { deck: 'yds-frequent', newPerDay: 5, sessions: 1, limit: 15, goodRate: 0.55 },
    mocks: [{ type: 'mini', accuracy: 0.42, blankRate: 0.1 }],
  },
};

// ── Küçük yardımcılar ─────────────────────────────────────────────────────────
const rng = (seedStr) => { // deterministik (mulberry32)
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i += 1) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a += 0x6d2b79f5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};
const log = (who, msg) => console.log(`[demo:${who}] ${msg}`);

const must = (r, what) => {
  if (r.status >= 400 || !r.body?.success) throw new Error(`${what}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  return r.data;
};
// Gateway geçici 429/5xx verirse birkaç kez dener.
const tryCall = async (token, method, path, body, what = path) => {
  for (let i = 0; i < 4; i += 1) {
    const r = await call(token, method, path, body);
    if (r.status === 429 || r.status >= 500) { await sleep(800 * (i + 1)); continue; }
    return r;
  }
  throw new Error(`${what}: gateway yanıt vermiyor`);
};

let db;
const answerKey = async (itemCode) => {
  const r = await db.query(
    `SELECT o.question_option_label AS label FROM content.item i
       JOIN content.item_revision r ON r.item_revision_item_id = i.item_id
       JOIN content.question q ON q.question_item_revision_id = r.item_revision_id
       JOIN content.question_option o ON o.question_option_question_id = q.question_id AND o.question_option_is_correct
      WHERE i.item_code = $1 ORDER BY r.item_revision_revision_no DESC LIMIT 1`, [itemCode]);
  return r.rows[0]?.label || null;
};
const pickLabel = async (rand, itemCode, labels, accuracy) => {
  const key = await answerKey(itemCode);
  if (key && rand() < accuracy) return key;
  const wrong = labels.filter((l) => l !== key);
  return wrong[Math.floor(rand() * wrong.length)] || labels[0];
};

// ── Oturum açma / kayıt (idempotent) ──────────────────────────────────────────
// İlk çalıştırmada e-posta koduyla kayıt olur ve şifre koyar; sonraki çalıştırmalar şifreyle girer
// (e-posta kodu saatlik sınırına takılmaz).
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'DemoSinav2026!';
const authenticate = async (p) => {
  const pw = await call(null, 'POST', `${ID}auth/password/login`, { email: p.email, password: DEMO_PASSWORD });
  if (pw.status === 200) { log(p.displayName, 'şifreyle girildi'); return pw.data.auth.accessToken; }
  let first = await call(null, 'POST', `${ID}auth/email/code`, { email: p.email, purpose: 'signup' });
  if (first.status === 429) { // 45 sn bekleme penceresi
    await sleep(((first.error?.details?.retryAfter || 45) + 1) * 1000);
    first = await call(null, 'POST', `${ID}auth/email/code`, { email: p.email, purpose: 'signup' });
  }
  let token;
  if (first.status === 200) { // yeni hesap: misafir → öğrenci
    const g = must(await tryCall(null, 'POST', `${ID}auth/guest`, {}), 'guest');
    const code = await latestCode(p.email, 'Kayıt');
    const reg = must(await tryCall(g.auth.accessToken, 'POST', `${ID}auth/register`, {
      email: p.email, code, displayName: p.displayName,
      consents: [{ type: 'kvkk_notice', granted: true }, { type: 'terms_of_use', granted: true }],
    }), 'register');
    token = reg.auth.accessToken;
    log(p.displayName, 'hesap oluşturuldu');
  } else if (first.error?.code === 'AUTH_EMAIL_ALREADY_REGISTERED') { // şifresiz mevcut hesap
    for (let i = 0; i < 3; i += 1) {
      const s = await call(null, 'POST', `${ID}auth/email/code`, { email: p.email, purpose: 'login' });
      if (s.status === 429) { await sleep(((s.error?.details?.retryAfter || 45) + 1) * 1000); continue; }
      break;
    }
    const code = await latestCode(p.email, 'Giriş');
    token = must(await call(null, 'POST', `${ID}auth/email/verify`, { email: p.email, code }), 'login').auth.accessToken;
    log(p.displayName, 'mevcut hesapla kodla girildi');
  } else throw new Error(`signup kodu: ${JSON.stringify(first.body)}`);
  must(await call(token, 'PUT', `${ID}account/password`, { newPassword: DEMO_PASSWORD }), 'password');
  return token;
};

// ── Adımlar ──────────────────────────────────────────────────────────────────
const ensurePremium = async (t, p) => {
  if (!p.premium) return;
  const ent = must(await tryCall(t, 'GET', `${BL}entitlements`), 'entitlements');
  if (ent.tier === 'premium') return;
  if (!ent.trial?.eligible) { log(p.displayName, 'premium deneme hakkı yok, ücretsiz devam'); return; }
  const r = await tryCall(t, 'POST', `${BL}checkout`, {
    priceKey: 'premium-monthly', startTrial: true, acceptPreInfo: true, acceptDistanceSales: true,
    billingProfile: { partyType: 'individual', fullName: 'Elif Demir', addressLine: 'Demo Mah. Örnek Sk. 1', city: 'İstanbul', district: 'Kadıköy', country: 'TR' },
  });
  if (r.status >= 400) log(p.displayName, `premium başlatılamadı (${r.error?.code}), ücretsiz devam`); else log(p.displayName, 'premium deneme başladı');
};

const ensureEnrollment = async (t, p) => {
  const cur = must(await tryCall(t, 'GET', `${LR}enrollments/active`), 'enrollment');
  if (cur.enrollment?.track?.key === 'yds-en') { log(p.displayName, 'kayıt zaten var'); return; }
  must(await tryCall(t, 'POST', `${LR}enrollments`, { trackKey: 'yds-en', targetScore: p.targetScore, dateMode: 'unknown', goalReasonKeys: [] }), 'enrollment');
  must(await tryCall(t, 'PUT', `${LR}availability`, { days: p.availability.map((minutes, i) => ({ weekday: i + 1, minutes })) }), 'availability');
  log(p.displayName, `YDS kaydı (hedef ${p.targetScore}) ve haftalık müsaitlik yazıldı`);
};

const answerSession = async (t, rand, sessionCode, accuracy, positions, { path = 'sessions', eachTimeMs = [9000, 45000] } = {}) => {
  let right = 0;
  for (const n of positions) {
    const view = must(await tryCall(t, 'GET', `${LR}${path}/${sessionCode}/items/${n}`), 'item');
    const q = view.question;
    if (view.state?.status === 'answered') continue;
    const labels = q.options.map((o) => o.label);
    const label = await pickLabel(rand, q.itemCode, labels, accuracy);
    const timeMs = Math.round(eachTimeMs[0] + rand() * (eachTimeMs[1] - eachTimeMs[0]));
    let r = await tryCall(t, 'POST', `${LR}${path}/${sessionCode}/items/${n}/answer`, { selectedLabel: label, timeMs, clientRef: ref(`demo-${sessionCode}-${n}`) });
    if (r.status === 402) return { quota: true, right };
    let d = must(r, 'answer');
    if (d.outcome === 'wrong_retry') { // öğrenme modu: ikinci deneme
      const left = labels.filter((l) => !(d.feedback?.eliminatedLabels || []).includes(l) && l !== label);
      const second = rand() < 0.5 ? (await answerKey(q.itemCode)) || left[0] : left[Math.floor(rand() * left.length)] || left[0];
      d = must(await tryCall(t, 'POST', `${LR}${path}/${sessionCode}/items/${n}/answer`, { selectedLabel: second, timeMs: timeMs + 8000, clientRef: ref(`demo-${sessionCode}-${n}-2`) }), 'answer2');
    }
    if (d.outcome === 'correct' || d.outcome === 'correct_on_retry' || d.feedback?.isCorrect) right += 1;
    if (d.halfway) await tryCall(t, 'POST', `${LR}diagnostics/${sessionCode}/pause`).then(() => tryCall(t, 'POST', `${LR}diagnostics`));
  }
  return { quota: false, right };
};

const ensureDiagnostic = async (t, p, rand) => {
  const e = must(await tryCall(t, 'GET', `${LR}enrollments/active`), 'enrollment').enrollment;
  if (e.diagnostic.status === 'completed') { log(p.displayName, 'seviye tespiti zaten tamam'); return; }
  const start = must(await tryCall(t, 'POST', `${LR}diagnostics`, {}), 'diagnostic start');
  const code = start.session.code;
  const total = start.session.plannedItemCount;
  for (let n = 1; n <= total; n += 1) {
    const v = await tryCall(t, 'GET', `${LR}diagnostics/${code}?position=${n}`);
    const cur = must(v, 'diag item').current;
    if (!cur || cur.state?.status === 'answered') continue;
    const labels = cur.question.options.map((o) => o.label);
    const label = rand() < 0.04 ? null : await pickLabel(rand, cur.question.itemCode, labels, p.diagnosticAccuracy);
    let a = await tryCall(t, 'POST', `${LR}diagnostics/${code}/answers`, { position: n, selectedLabel: label, timeMs: 12000 + Math.round(rand() * 40000), clientRef: ref(`demo-diag-${code}-${n}`) });
    must(a, 'diag answer');
  }
  must(await tryCall(t, 'POST', `${LR}diagnostics/${code}/complete`), 'diagnostic complete');
  log(p.displayName, `seviye tespiti tamamlandı (${total} soru)`);
};

const ensurePractice = async (t, p, rand) => {
  const prog = must(await tryCall(t, 'GET', `${LR}progress/overview?range=90`), 'progress');
  const diagN = 30;
  if ((prog.totals?.questionsAnswered || 0) >= diagN + p.practice.reduce((s, x) => s + x.count, 0) * 0.5) { log(p.displayName, 'alıştırma geçmişi zaten var'); return; }
  for (const plan of p.practice) {
    const body = { count: plan.count, mode: plan.mode || 'learning', difficulty: 'adaptive' };
    if (plan.types) body.questionTypeKeys = plan.types;
    let r = await tryCall(t, 'POST', `${LR}practice-sessions`, body);
    if (r.status === 404 && plan.types) { delete body.questionTypeKeys; r = await tryCall(t, 'POST', `${LR}practice-sessions`, body); }
    if (r.status === 402) { log(p.displayName, 'günlük soru hakkı doldu, alıştırma durduruldu'); return; }
    const s = must(r, 'practice start');
    const positions = s.session.items.map((i) => i.position);
    const res = await answerSession(t, rand, s.code, p.accuracy, positions);
    must(await tryCall(t, 'POST', `${LR}sessions/${s.code}/complete`), 'practice complete');
    log(p.displayName, `alıştırma tamamlandı: ${positions.length} soru${res.quota ? ' (kota)' : ''}`);
    if (res.quota) return;
  }
};

const ensureVocab = async (t, p, rand) => {
  const ov = must(await tryCall(t, 'GET', `${LR}vocab/overview`), 'vocab');
  if (ov.totals.cards > 0) { log(p.displayName, 'kelime kartları zaten var'); return; }
  const v = p.vocab;
  must(await tryCall(t, 'PUT', `${LR}vocab/decks/${v.deck}/subscription`, { newPerDay: v.newPerDay, isActive: true }), 'subscription');
  for (let s = 0; s < v.sessions; s += 1) {
    const rs = must(await tryCall(t, 'POST', `${LR}vocab/review-sessions`, { deckKey: v.deck, limit: v.limit }), 'review session');
    if (rs.empty) break;
    const code = rs.session.code;
    let reviewed = 0;
    for (let i = 0; i < 80; i += 1) {
      const nx = must(await tryCall(t, 'GET', `${LR}vocab/review-sessions/${code}/next`), 'next');
      if (nx.done || !nx.card) break;
      const x = rand();
      const rating = x < v.goodRate ? (rand() < 0.2 ? 'easy' : 'good') : x < v.goodRate + 0.15 ? 'hard' : 'again';
      const r = await tryCall(t, 'POST', `${LR}vocab/cards/${nx.card.code}/reviews`, { rating, durationMs: 2500 + Math.round(rand() * 6000), sessionCode: code, clientRef: ref(`demo-card-${nx.card.code}-${i}`) });
      if (r.status === 402) break;
      must(r, 'review'); reviewed += 1;
    }
    await tryCall(t, 'POST', `${LR}vocab/review-sessions/${code}/complete`);
    log(p.displayName, `kelime oturumu: ${reviewed} inceleme`);
  }
};

const ensureMistakeLabels = async (t, p, rand) => {
  const types = ['knowledge_gap', 'attention', 'time', 'trap', 'vocabulary'];
  const list = must(await tryCall(t, 'GET', `${LR}mistakes?status=open&pageSize=50`), 'mistakes');
  let n = 0;
  for (const m of list.items) {
    if (m.mistakeType) continue;
    const kind = m.suggestedMistakeType || types[Math.floor(rand() * types.length)];
    const r = await tryCall(t, 'PATCH', `${LR}mistakes/${m.code}`, { mistakeType: kind });
    if (r.status === 200) n += 1;
  }
  log(p.displayName, `hata defteri: ${list.counts?.open ?? list.total} açık, ${n} hataya tür etiketi yazıldı`);
};

const ensureMocks = async (t, p, rand) => {
  const ov = must(await tryCall(t, 'GET', `${LR}exams/overview`), 'exams');
  const takenTypes = new Set(ov.history.map((h) => h.formType));
  for (const m of p.mocks) {
    if (takenTypes.has(m.type)) continue;
    const form = ov.forms.find((f) => f.formType === m.type && !f.locked && f.taken === 0);
    if (!form) { log(p.displayName, `${m.type} deneme formu uygun değil (kilit/kota)`); continue; }
    const st = await tryCall(t, 'POST', `${LR}exam-sittings`, { formCode: form.code });
    if (st.status >= 400) { log(p.displayName, `${m.type} deneme başlatılamadı: ${st.error?.code}`); continue; }
    const sitting = st.data.sitting;
    const total = sitting.questionCount;
    let flagged = 0;
    for (let from = 1; from <= total; from += 40) {
      const qs = must(await tryCall(t, 'GET', `${LR}exam-sittings/${sitting.code}/questions?from=${from}&to=${Math.min(total, from + 39)}`), 'exam questions');
      for (const q of qs.items) {
        if (rand() < (m.blankRate || 0.03)) continue; // boş bırakılan
        const label = await pickLabel(rand, q.itemCode, q.options.map((o) => o.label), m.accuracy);
        const flag = flagged < 5 && rand() < 0.06; if (flag) flagged += 1;
        must(await tryCall(t, 'PUT', `${LR}exam-sittings/${sitting.code}/answers/${q.position}`, { selectedLabel: label, timeMs: 20000 + Math.round(rand() * 60000), flagged: flag || undefined }), 'exam answer');
      }
    }
    const res = must(await tryCall(t, 'POST', `${LR}exam-sittings/${sitting.code}/submit`), 'exam submit');
    log(p.displayName, `${m.type} deneme teslim: ${res.result?.score}/${res.result?.scoreMax} (${res.result?.correct} doğru)`);
  }
};

// ── Ana akış ─────────────────────────────────────────────────────────────────
const main = async () => {
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
  db = await connect();
  try {
    for (const [key, p] of Object.entries(PERSONAS)) {
      if (only && only !== key) continue;
      const rand = rng(key);
      const t = await authenticate(p);
      await ensurePremium(t, p);
      await ensureEnrollment(t, p);
      await ensureDiagnostic(t, p, rand);
      await ensurePractice(t, p, rand);
      await ensureVocab(t, p, rand);
      await ensureMocks(t, p, rand);
      await ensureMistakeLabels(t, p, rand);
      const today = must(await tryCall(t, 'GET', `${LR}today`), 'today');
      log(p.displayName, `özet: seri ${today.streak?.current}, tahmin ${today.estimate ? `${today.estimate.low}-${today.estimate.high}` : '-'}, açık hata ${today.due?.mistakes ?? 0} vadeli`);
    }
  } finally { await db.end(); }
};

main().catch((e) => { console.error(e); process.exit(1); });
