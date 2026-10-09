import { addDays, isoWeekday, daysBetween, DomainError } from 'app-shared';
import { clamp } from './util.js';
import { loadMasteryMap } from './mastery.js';
import { latestEstimate } from './estimate.js';
import { examDateOf, horizonEnd, diagnosticStatusOf, loadAvailability, DEFAULT_HORIZON_DAYS } from './enroll.js';
import { countDueMistakes } from './mistakes.js';
import { invalidateToday } from './cache.js';

// Plan üreticisi v1. Girdi → deterministik gün/görev listesi (saf), sonra kalıcılaştırma.
export const PLAN_GENERATOR_VERSION = 'v1';
export const DEFAULT_DAY_MINUTES = 30;
const MAX_TASKS = 6;

const weightOf = (t, focusMap) => t.count * (1 - (t.p ?? 0.4)) ** 1.5 * (focusMap.get(t.id) || 1);
const fitPractice = (minutes, secPerQ) => {
  const per = secPerQ * 1.15;
  const raw = Math.floor((minutes * 60) / per);
  let count = raw >= 10 ? Math.floor(raw / 5) * 5 : Math.max(3, raw);
  count = clamp(count, 3, 20);
  return { count, est: clamp(Math.ceil((count * per) / 60), 1, Math.max(1, minutes)) };
};

/**
 * Saf plan üretici.
 * @param {object} I {
 *   fromDate, endDate, examDate|null, availability: Map<weekday,min>, overrides: Map<date,min>, defaultMinutes,
 *   types:[{id,key,name,count,secPerQ,p,evidence,mastery,weakSkill:{id,name}|null}], focus: Map<typeId,weight>,
 *   dueMistakes, dueCards, diagnosticPending, notes:[{itemId,itemCode,title,minutes,typeId,skillId,skillName,strategy}],
 *   keptToday:{ minutes, count } }
 */
export const composePlan = (I) => {
  const days = [];
  const served = new Map(I.types.map((t) => [t.id, 0]));
  const usedNotes = new Set();
  const nDays = daysBetween(I.fromDate, I.endDate) + 1;
  // Haftalık deneme günü: her 7 günlük blokta en uygun (en uzun) gün
  const mockDays = new Set();
  const mockStart = nDays > 14 ? 6 : 2;
  for (let w = 0; w * 7 < nDays; w += 1) {
    let best = null;
    for (let i = w * 7; i < Math.min(nDays, (w + 1) * 7); i += 1) {
      const date = addDays(I.fromDate, i);
      const m = I.overrides.get(date) ?? I.availability.get(isoWeekday(date)) ?? I.defaultMinutes;
      if (i >= mockStart && m >= 45 && date !== I.examDate && (!best || m >= best.m)) best = { i, m, date };
    }
    if (best) mockDays.add(best.date);
  }
  const pickType = () => {
    let best = null;
    for (const t of I.types) {
      const score = weightOf(t, I.focus) / (1 + served.get(t.id));
      if (!best || score > best.score) best = { t, score };
    }
    return best?.t || null;
  };
  const practiceReason = (t) => (t.evidence >= 3 && t.p < 0.6 ? 'weak_skill' : 'coverage');
  const practiceTask = (t, minutes) => {
    const { count, est } = fitPractice(minutes, t.secPerQ);
    served.set(t.id, served.get(t.id) + 1);
    return {
      kind: 'practice', reason: practiceReason(t), estimatedMinutes: est,
      params: { questionTypeKeys: [t.key], count, mode: 'learning', difficulty: 'adaptive' },
      reasonParams: { typeKey: t.key, typeName: t.name, mastery: t.evidence >= 3 ? Math.round(t.mastery) : null, skillName: t.weakSkill?.name || null },
      targetQuestionTypeId: t.id, targetSkillId: t.weakSkill?.id || null,
    };
  };

  for (let i = 0; i < nDays; i += 1) {
    const date = addDays(I.fromDate, i);
    const isToday = i === 0;
    if (I.examDate && date === I.examDate) { days.push({ date, minutes: 0, status: 'rest', tasks: [], examDay: true }); continue; }
    let minutes = I.overrides.get(date) ?? I.availability.get(isoWeekday(date)) ?? I.defaultMinutes;
    const shortened = I.overrides.has(date);
    if (minutes <= 0) { days.push({ date, minutes: 0, status: 'rest', tasks: [] }); continue; }
    if (I.examDate && daysBetween(date, I.examDate) === 1) minutes = Math.min(minutes, 20); // sınav arifesi: hafif
    const kept = isToday ? I.keptToday || { minutes: 0, count: 0 } : { minutes: 0, count: 0 };
    let budget = minutes - kept.minutes;
    const slots = MAX_TASKS - kept.count;
    const day = { date, minutes, status: 'pending', tasks: [], adjustedReason: shortened ? 'short_day' : null };
    const T = { diag: null, err: null, note: null, practice: [], tr: null, vocab: null, mock: null };

    if (budget < 3) { days.push({ ...day, tasks: [] }); continue; }

    if (I.diagnosticPending && isToday) {
      const est = clamp(budget >= 20 ? 20 : budget, 5, 20);
      T.diag = { kind: 'diagnostic', reason: 'diagnostic_pending', estimatedMinutes: est, params: {}, reasonParams: {} };
      budget -= est;
    }
    const isMock = mockDays.has(date) && !isToday && budget >= 45;
    if (isMock) {
      const full = budget >= 180;
      const est = full ? 180 : clamp(Math.min(budget, 45), 30, 45);
      T.mock = { kind: 'mock_exam', reason: 'exam_rhythm', estimatedMinutes: est, params: { formType: full ? 'full' : 'mini' }, reasonParams: { daysToExam: I.examDate ? daysBetween(date, I.examDate) : null } };
      budget -= est;
    }
    // Hata tekrarı: bugün vadesi gelen varsa; sonraki günlerde iki günde bir (boşsa başlatınca otomatik kapanır)
    const wantErr = isToday ? I.dueMistakes > 0 : i % 2 === 1 && minutes >= 25;
    if (wantErr && budget >= 5 && !T.diag) {
      const est = clamp(isToday ? Math.ceil(I.dueMistakes * 0.75) : 7, 5, 10);
      T.err = { kind: 'error_review', reason: 'due_mistakes', estimatedMinutes: Math.min(est, budget), params: { limit: 10 }, reasonParams: { count: isToday ? I.dueMistakes : null } };
      budget -= T.err.estimatedMinutes;
    }
    // Kelime tekrarı (kartlar L2'nin; yeni kelimeler de bu görevde)
    if (minutes >= 25 && budget >= 12 && !T.diag) {
      const est = minutes >= 45 ? 10 : 6;
      T.vocab = { kind: 'vocab_review', reason: isToday && I.dueCards > 0 ? 'due_review' : 'new_content', estimatedMinutes: est, params: { limit: 20 }, reasonParams: { count: isToday ? I.dueCards : null } };
      budget -= est;
    }
    // Çeviri koçu: Salı/Perşembe
    if (!isMock && minutes >= 30 && [2, 4].includes(isoWeekday(date)) && budget >= 25 && !T.diag) {
      T.tr = { kind: 'translation', reason: 'coverage', estimatedMinutes: 10, params: { direction: 'en-tr' }, reasonParams: {} };
      budget -= 10;
    }
    // Alıştırma(lar): kalan bütçe
    if (!isMock && !T.diag || (T.diag && budget >= 12)) {
      let rest = budget;
      const n = rest >= 40 ? 2 : 1;
      for (let k = 0; k < n && rest >= 5; k += 1) {
        const t = pickType();
        if (!t) break;
        const m = Math.floor(rest / (n - k));
        const p = practiceTask(t, m);
        T.practice.push(p);
        rest -= p.estimatedMinutes;
      }
      budget = rest;
      // Hap not: bugünkü alıştırma türüne ait okunmamış not (strateji önce)
      if (T.practice.length && minutes >= 20 && budget >= 3) {
        const typeIds = new Set(T.practice.map((p) => p.targetQuestionTypeId));
        const cand = I.notes.find((n) => !usedNotes.has(n.itemId) && typeIds.has(n.typeId));
        if (cand) {
          usedNotes.add(cand.itemId);
          const est = clamp(Math.ceil(cand.minutes), 2, 6);
          T.note = {
            kind: 'note', reason: cand.strategy ? 'new_content' : 'weak_skill', estimatedMinutes: Math.min(est, budget), params: { itemCode: cand.itemCode, title: cand.title },
            reasonParams: { skillName: cand.skillName || null, typeName: I.types.find((x) => x.id === cand.typeId)?.name || null }, targetItemId: cand.itemId, targetSkillId: cand.skillId || null, targetQuestionTypeId: cand.typeId,
          };
          budget -= T.note.estimatedMinutes;
        }
      }
      // Hâlâ ≥ 10 dk artıyorsa son alıştırmayı büyüt
      if (budget >= 8 && T.practice.length) {
        const last = T.practice.at(-1);
        const t = I.types.find((x) => x.id === last.targetQuestionTypeId);
        const grown = fitPractice(last.estimatedMinutes + budget, t.secPerQ);
        budget -= grown.est - last.estimatedMinutes;
        last.estimatedMinutes = grown.est; last.params.count = grown.count;
      }
    }
    const ordered = [T.diag, T.err, T.note, ...T.practice, T.mock, T.tr, T.vocab].filter(Boolean).slice(0, slots);
    if (!ordered.length && slots > 0) {
      const t = pickType();
      if (t) ordered.push(practiceTask(t, Math.max(5, minutes - kept.minutes)));
    }
    day.tasks = ordered;
    days.push(day);
  }
  return days;
};

// ── Girdi toplama ───────────────────────────────────────────────────────────
const loadNoteQueue = async (q, ctx, catalog, tiers) => {
  const { rows } = await q(
    `SELECT i.item_id AS "itemId", i.item_code AS "itemCode", n.note_title AS title, n.note_reading_seconds AS seconds, n.note_note_kind AS kind
       FROM content.item i JOIN content.note n ON n.note_item_revision_id = i.item_published_revision_id
      WHERE i.item_kind='note' AND i.item_status='published' AND i.item_access_tier = ANY($2)
        AND ($3::bigint[] IS NULL OR EXISTS (SELECT 1 FROM content.item_exam ie WHERE ie.item_exam_item_id=i.item_id AND ie.item_exam_exam_id = ANY($3)))
        AND NOT EXISTS (SELECT 1 FROM learning.note_progress np WHERE np.note_progress_user_account_id=$1 AND np.note_progress_note_item_id=i.item_id)`,
    [ctx.userId, tiers, catalog.poolExamIds?.length ? catalog.poolExamIds : null]);
  if (!rows.length) return [];
  const { rows: sk } = await q('SELECT item_skill_item_id AS "itemId", item_skill_skill_id AS "skillId", item_skill_is_primary AS "isPrimary" FROM content.item_skill WHERE item_skill_item_id = ANY($1)', [rows.map((r) => Number(r.itemId))]);
  const out = [];
  for (const r of rows) {
    const id = Number(r.itemId);
    const strat = catalog.questionTypes.find((t) => t.strategyNoteItemId === id);
    let typeId = strat?.id || null;
    let skillId = null;
    const mine = sk.filter((s) => Number(s.itemId) === id).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    for (const s of mine) {
      skillId = skillId || Number(s.skillId);
      if (!typeId) typeId = catalog.questionTypeSkills.find((x) => x.skillId === Number(s.skillId))?.questionTypeId || null;
    }
    if (!typeId) continue;
    out.push({ itemId: id, itemCode: Number(r.itemCode), title: r.title, minutes: (r.seconds || 90) / 60 + 2, typeId, skillId, skillName: catalog.skills.find((x) => x.id === skillId)?.name || null, strategy: !!strat || r.kind === 'strategy' });
  }
  out.sort((a, b) => Number(b.strategy) - Number(a.strategy));
  return out;
};

export const gatherPlanInputs = async (q, ctx, { enrollment, catalog, tier = 'free' }) => {
  const [typeMastery, skillMastery, est, avail, diag, dueMistakes, cards] = await Promise.all([
    loadMasteryMap(q, ctx.userId, 'type'),
    loadMasteryMap(q, ctx.userId, 'skill'),
    latestEstimate(q, ctx.userId, enrollment.id),
    loadAvailability(q, ctx.userId),
    diagnosticStatusOf(q, ctx.userId, enrollment.id),
    countDueMistakes(q, ctx.userId, ctx.now),
    q("SELECT count(*)::int AS n FROM learning.card WHERE card_user_account_id=$1 AND card_state <> 'suspended' AND card_due_at <= $2", [ctx.userId, ctx.now]),
  ]);
  const types = catalog.sections.map((s) => {
    const qt = catalog.questionTypes.find((t) => t.id === s.questionTypeId);
    const m = typeMastery.get(s.questionTypeId);
    const ev = m?.evidence || 0;
    const skillIds = catalog.questionTypeSkills.filter((x) => x.questionTypeId === s.questionTypeId).map((x) => x.skillId);
    let weak = null;
    for (const sid of skillIds) {
      const sm = skillMastery.get(sid);
      if (sm?.evidence >= 2 && (!weak || sm.mastery < weak.mastery)) weak = { id: sid, mastery: sm.mastery, name: catalog.skills.find((k) => k.id === sid)?.name };
    }
    return {
      id: s.questionTypeId, key: qt.key, name: qt.name, count: s.questionCount, secPerQ: s.targetSecondsPerQuestion || qt.defaultTargetSeconds || 75,
      p: ev >= 3 ? 0.2 + 0.7 * (m.mastery / 100) : null, evidence: ev, mastery: m?.mastery || 0, weakSkill: weak,
    };
  });
  const notes = await loadNoteQueue(q, ctx, catalog, tier === 'premium' ? ['free', 'premium'] : ['free']);
  return {
    types, notes, estimate: est, availabilityRows: avail,
    availability: new Map(avail.map((a) => [a.weekday, a.minutes])),
    diagnostic: diag, dueMistakes, dueCards: cards.rows[0].n,
  };
};

// ── Kalıcılaştırma ──────────────────────────────────────────────────────────
const PLAN_COLS = `study_plan_id AS id, study_plan_code AS code, study_plan_version_no AS "versionNo", study_plan_status AS status, study_plan_regen_reason AS "regenReason",
  study_plan_horizon_start::text AS "horizonStart", study_plan_horizon_end::text AS "horizonEnd", study_plan_generated_at AS "generatedAt", study_plan_inputs AS inputs, study_plan_enrollment_id AS "enrollmentId"`;

export const loadActivePlan = async (q, userId, enrollmentId) => {
  const { rows } = await q(`SELECT ${PLAN_COLS} FROM learning.study_plan WHERE study_plan_user_account_id=$1 AND study_plan_enrollment_id=$2 AND study_plan_status='active'`, [userId, enrollmentId]);
  return rows[0] ? { ...rows[0], id: Number(rows[0].id), code: Number(rows[0].code), enrollmentId: Number(rows[0].enrollmentId) } : null;
};

/**
 * Yeni plan sürümü üret: eskisini 'superseded' yapar, bugünün tamamlanmış/süren görevlerini yeni güne taşır.
 * @param {object} o { enrollment, catalog, reason, tier, overrides?: Map<date,min>, focusAdd?: {typeId,weight,until}, resetFocus?, skipToday?: bool }
 */
export const regeneratePlan = async (tx, ctx, o) => {
  const q = tx.query.bind(tx);
  const { enrollment, catalog, reason } = o;
  await q('SELECT pg_advisory_xact_lock(7001, $1::int)', [ctx.userId]);
  const old = await loadActivePlan(q, ctx.userId, enrollment.id);
  const inp = await gatherPlanInputs(q, ctx, { enrollment, catalog, tier: o.tier });
  const from = ctx.today;
  const examDate = examDateOf(enrollment);
  const end = horizonEnd(enrollment, from);
  // Odak ağırlıkları: önceki sürümden devral (süresi dolmamış), yenisini ekle
  const focus = new Map();
  const focusList = [];
  const carry = o.resetFocus ? [] : old?.inputs?.focus || [];
  for (const f of carry) if (f.until >= from) { focus.set(f.typeId, f.weight); focusList.push(f); }
  if (o.focusAdd) { focus.set(o.focusAdd.typeId, o.focusAdd.weight); focusList.push(o.focusAdd); }
  const overrides = new Map(o.overrides || []);

  // Bugünden önce kaçırılan planlı günleri işaretle
  if (old) await q("UPDATE learning.plan_day SET plan_day_status='missed' WHERE plan_day_study_plan_id=$1 AND plan_day_plan_date < $2 AND plan_day_status='pending'", [old.id, from]);

  // Bugünün korunacak görevleri (tamamlanan/süren/atlanan/ertelenen)
  let kept = [];
  if (old) {
    const { rows } = await q(
      `SELECT t.plan_task_id AS id, t.plan_task_status AS status, t.plan_task_estimated_minutes AS minutes
         FROM learning.plan_task t JOIN learning.plan_day d ON d.plan_day_id = t.plan_task_plan_day_id
        WHERE d.plan_day_study_plan_id=$1 AND d.plan_day_plan_date=$2 AND t.plan_task_status <> 'pending' ORDER BY t.plan_task_position`, [old.id, from]);
    kept = rows.map((r) => ({ id: Number(r.id), status: r.status, minutes: r.minutes }));
  }
  const keptMinutes = kept.filter((k) => ['completed', 'in_progress'].includes(k.status)).reduce((s, k) => s + k.minutes, 0);

  const days = composePlan({
    fromDate: from, endDate: end < from ? from : end, examDate, availability: inp.availability, overrides, defaultMinutes: DEFAULT_DAY_MINUTES,
    types: inp.types, focus, dueMistakes: inp.dueMistakes, dueCards: inp.dueCards,
    diagnosticPending: inp.diagnostic.status !== 'completed',
    notes: inp.notes, keptToday: { minutes: keptMinutes, count: kept.length },
  });
  if (o.skipToday) { const t = days[0]; if (t) { t.tasks = []; t.status = 'skipped'; t.minutes = 0; t.adjustedReason = 'missed_days'; } }

  const { rows: vr } = await q('SELECT COALESCE(MAX(study_plan_version_no),0)+1 AS v FROM learning.study_plan WHERE study_plan_enrollment_id=$1', [enrollment.id]);
  if (old) await q("UPDATE learning.study_plan SET study_plan_status='superseded' WHERE study_plan_id=$1 AND study_plan_status='active'", [old.id]);
  const est = inp.estimate;
  const inputs = {
    algorithm: PLAN_GENERATOR_VERSION, daysToExam: examDate ? daysBetween(from, examDate) : null, examDate, targetScore: enrollment.targetScore,
    availability: Object.fromEntries(inp.availability), availabilityDefaulted: inp.availabilityRows.length === 0, overrides: Object.fromEntries(overrides),
    estimate: est ? { low: est.low, high: est.high, point: est.point, source: est.source } : null,
    weights: inp.types.map((t) => ({ typeKey: t.key, p: t.p, evidence: t.evidence, w: Math.round(weightOf(t, focus) * 100) / 100 })),
    dueMistakes: inp.dueMistakes, dueCards: inp.dueCards, diagnostic: inp.diagnostic.status, focus: focusList, horizonDays: DEFAULT_HORIZON_DAYS,
  };
  const { rows: pr } = await q(
    `INSERT INTO learning.study_plan (study_plan_tenant_code, study_plan_organization_id, study_plan_user_account_id, study_plan_enrollment_id, study_plan_version_no, study_plan_status,
        study_plan_regen_reason, study_plan_generator_version, study_plan_horizon_start, study_plan_horizon_end, study_plan_inputs, study_plan_generated_at)
     VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$8,$9,$10,$11) RETURNING ${PLAN_COLS}`,
    [ctx.tenantCode, ctx.orgId, ctx.userId, enrollment.id, vr[0].v, reason, PLAN_GENERATOR_VERSION, from, days.at(-1).date, JSON.stringify(inputs), ctx.now]);
  const plan = { ...pr[0], id: Number(pr[0].id), code: Number(pr[0].code) };

  const { rows: dr } = await q(
    `INSERT INTO learning.plan_day (plan_day_tenant_code, plan_day_organization_id, plan_day_study_plan_id, plan_day_user_account_id, plan_day_plan_date, plan_day_planned_minutes, plan_day_status, plan_day_adjusted_reason)
     SELECT $1,$2,$3,$4,d,m,s,NULLIF(r,'') FROM unnest($5::date[], $6::int[], $7::text[], $8::text[]) AS t(d,m,s,r)
     RETURNING plan_day_id AS id, plan_day_plan_date::text AS date`,
    [ctx.tenantCode, ctx.orgId, plan.id, ctx.userId, days.map((d) => d.date), days.map((d) => clamp(d.tasks.reduce((s, t) => s + t.estimatedMinutes, 0) + (d.date === from ? keptMinutes : 0), 0, 480) || (d.status === 'rest' || d.status === 'skipped' ? 0 : d.minutes)), days.map((d) => d.status), days.map((d) => d.adjustedReason || '')]);
  const dayId = new Map(dr.map((r) => [r.date, Number(r.id)]));

  // Taşınan (korunan) görevler: yeni bugüne re-parent
  let pos = 0;
  if (kept.length) {
    const todayId = dayId.get(from);
    for (const k of kept) {
      pos += 1;
      await q('UPDATE learning.plan_task SET plan_task_plan_day_id=$2, plan_task_position=$3 WHERE plan_task_id=$1', [k.id, todayId, pos]);
    }
  }
  const rowsT = [];
  for (const d of days) {
    let p = d.date === from ? pos : 0;
    for (const t of d.tasks) { p += 1; rowsT.push({ dayId: dayId.get(d.date), position: p, ...t }); }
  }
  if (rowsT.length) {
    await q(
      `INSERT INTO learning.plan_task (plan_task_tenant_code, plan_task_organization_id, plan_task_plan_day_id, plan_task_position, plan_task_kind, plan_task_reason, plan_task_params,
          plan_task_reason_params, plan_task_estimated_minutes, plan_task_target_item_id, plan_task_target_question_type_id, plan_task_target_skill_id)
       SELECT $1,$2,d,p,k,r,pa::jsonb,rp::jsonb,m,ti,tq,ts
         FROM unnest($3::bigint[], $4::int[], $5::text[], $6::text[], $7::text[], $8::text[], $9::int[], $10::bigint[], $11::bigint[], $12::bigint[]) AS t(d,p,k,r,pa,rp,m,ti,tq,ts)`,
      [ctx.tenantCode, ctx.orgId, rowsT.map((t) => t.dayId), rowsT.map((t) => t.position), rowsT.map((t) => t.kind), rowsT.map((t) => t.reason),
        rowsT.map((t) => JSON.stringify(t.params || {})), rowsT.map((t) => JSON.stringify(t.reasonParams || {})), rowsT.map((t) => t.estimatedMinutes),
        rowsT.map((t) => t.targetItemId ?? null), rowsT.map((t) => t.targetQuestionTypeId ?? null), rowsT.map((t) => t.targetSkillId ?? null)]);
  }
  ctx.after.push(() => invalidateToday(ctx.userId, from, addDays(from, 1)));
  return { plan, dayCount: days.length, taskCount: rowsT.length + kept.length, keptCount: kept.length };
};

/** Aktif plan yoksa (ya da ufku bitmişse) 'initial' ile üret. */
export const ensurePlan = async (tx, ctx, { enrollment, catalog, tier }) => {
  const q = tx.query.bind(tx);
  let plan = await loadActivePlan(q, ctx.userId, enrollment.id);
  if (plan && plan.horizonEnd >= ctx.today) return { plan, generated: false };
  if (plan && plan.horizonEnd < ctx.today && examDateOf(enrollment) && examDateOf(enrollment) < ctx.today) return { plan, generated: false }; // sınav geçti
  const r = await regeneratePlan(tx, ctx, { enrollment, catalog, reason: 'initial', tier });
  return { plan: r.plan, generated: true };
};

export const planRequired = () => new DomainError('PLAN_NOT_FOUND', 'No active plan', undefined, 404);
