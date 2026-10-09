import { DomainError, withTransaction, addDays, daysBetween, isoWeekday, peekUsage, getEntitlements, requiredCorrect } from 'app-shared';
import { withCtx } from './lib/ctx.js';
import { requireEnrollment, enrollmentView, loadGoalReasons, catalogOf, diagnosticStatusOf, examDateOf } from './lib/enroll.js';
import { ensurePlan, loadActivePlan, regeneratePlan } from './lib/plan-engine.js';
import { loadTaskByCode, startTaskRow, refreshPlanDayStatus, TASK_SEL, TASK_FROM } from './lib/plan-tasks.js';
import { settleMissedDays, effectiveStreak, touchActivity, useFreezeForToday, goalMinutesFor, STREAK_COLS } from './lib/activity.js';
import { latestEstimate, estimateView } from './lib/estimate.js';
import { countDueMistakes } from './lib/mistakes.js';
import { taskStarterFor, tierOf } from './lib/session-io.js';
import { codeParam, intParam, clamp } from './lib/util.js';
import { scoringOf } from './lib/estimate.js';

const taskView = (t, catalog) => {
  const qt = t.targetQuestionTypeId ? catalog.questionTypes.find((x) => x.id === Number(t.targetQuestionTypeId)) : null;
  const sk = t.targetSkillId ? catalog.skills.find((x) => x.id === Number(t.targetSkillId)) : null;
  return {
    code: t.code, position: t.position, kind: t.kind, status: t.status, reason: t.reason, reasonParams: t.reasonParams || {}, params: t.params || {},
    estimatedMinutes: t.estimatedMinutes, progressPct: t.progressPct,
    questionType: qt ? { key: qt.key, name: qt.name, iconKey: qt.iconKey } : null, skill: sk ? { key: sk.key, name: sk.name } : null,
    startedAt: t.startedAt ? new Date(t.startedAt).toISOString() : null, completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : null,
  };
};

const loadDay = async (q, planId, date) => {
  const { rows: d } = await q('SELECT plan_day_id AS id, plan_day_code AS code, plan_day_plan_date::text AS date, plan_day_planned_minutes AS minutes, plan_day_status AS status, plan_day_adjusted_reason AS "adjustedReason" FROM learning.plan_day WHERE plan_day_study_plan_id=$1 AND plan_day_plan_date=$2', [planId, date]);
  if (!d[0]) return null;
  const { rows: t } = await q(`SELECT ${TASK_SEL} ${TASK_FROM} WHERE t.plan_task_plan_day_id=$1 ORDER BY t.plan_task_position`, [d[0].id]);
  return { ...d[0], id: Number(d[0].id), code: Number(d[0].code), tasks: t.map((x) => ({ ...x, id: Number(x.id), code: Number(x.code) })) };
};

const dayView = (day, catalog) => day && ({
  code: day.code, date: day.date, plannedMinutes: day.minutes, status: day.status, adjustedReason: day.adjustedReason, tasks: day.tasks.map((t) => taskView(t, catalog)),
  completedMinutes: day.tasks.filter((t) => t.status === 'completed').reduce((s, t) => s + t.estimatedMinutes, 0),
});

export default (deps) => {
  const q = deps.rawQuery;

  const weekOf = async (ctx) => {
    const monday = addDays(ctx.today, 1 - isoWeekday(ctx.today));
    const { rows } = await q(
      `SELECT activity_day_activity_date::text AS date, activity_day_goal_met AS "goalMet", activity_day_freeze_used AS "freezeUsed", activity_day_active_seconds AS seconds,
              activity_day_questions_answered AS answered, activity_day_cards_reviewed AS cards, activity_day_notes_read AS notes
         FROM learning.activity_day WHERE activity_day_user_account_id=$1 AND activity_day_activity_date BETWEEN $2 AND $3`, [ctx.userId, monday, addDays(monday, 6)]);
    const m = new Map(rows.map((r) => [r.date, r]));
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(monday, i);
      const r = m.get(date);
      const active = !!r && (r.answered > 0 || r.cards > 0 || r.notes > 0 || r.seconds >= 180);
      return { date, weekday: i + 1, isToday: date === ctx.today, active, goalMet: !!r?.goalMet, freezeUsed: !!r?.freezeUsed };
    });
  };

  const today = ({ caller }) => withCtx(deps, caller, async (ctx) => {
    const enr = await requireEnrollment(q, ctx.userId);
    const catalog = await catalogOf(enr);
    const tier = await tierOf(ctx.userId);
    const settled = await withTransaction(async (tx) => {
      const s = await settleMissedDays(tx, ctx);
      await ensurePlan(tx, ctx, { enrollment: enr, catalog, tier });
      return s;
    });
    const plan = await loadActivePlan(q, ctx.userId, enr.id);
    const day = plan ? await loadDay(q, plan.id, ctx.today) : null;
    const [est, diag, due, ent, usage, streakRow, actRows] = await Promise.all([
      latestEstimate(q, ctx.userId, enr.id), diagnosticStatusOf(q, ctx.userId, enr.id), countDueMistakes(q, ctx.userId, ctx.now), getEntitlements(ctx.userId),
      peekUsage({ userId: ctx.userId, feature: 'questions_per_day', tz: ctx.tz, now: ctx.now }),
      q(`SELECT ${STREAK_COLS} FROM learning.streak WHERE streak_user_account_id=$1`, [ctx.userId]),
      q('SELECT activity_day_active_seconds AS "activeSeconds", activity_day_questions_answered AS answered, activity_day_correct_answers AS correct, activity_day_cards_reviewed AS cards, activity_day_goal_minutes AS "goalMinutes", activity_day_goal_met AS "goalMet" FROM learning.activity_day WHERE activity_day_user_account_id=$1 AND activity_day_activity_date=$2', [ctx.userId, ctx.today]),
    ]);
    const { rows: cards } = await q("SELECT count(*)::int AS n FROM learning.card WHERE card_user_account_id=$1 AND card_suspended_at IS NULL AND card_due_at <= $2", [ctx.userId, ctx.now]);
    const act = actRows.rows[0] || { activeSeconds: 0, answered: 0, correct: 0, cards: 0, goalMinutes: null, goalMet: false };
    const goalMinutes = act.goalMinutes ?? (await goalMinutesFor(q, ctx, ctx.today));
    const tasks = day ? day.tasks : [];
    const nextTask = tasks.find((t) => ['in_progress', 'pending'].includes(t.status)) || null;
    return {
      date: ctx.today,
      enrollment: enrollmentView(enr, catalog, ctx.today, await loadGoalReasons(q, enr.id)),
      requiredCorrect: requiredCorrect(enr.targetScore, scoringOf(catalog), catalog.blueprint.questionCount),
      estimate: estimateView(est, catalog, enr.targetScore),
      diagnostic: { status: diag.status, sessionCode: diag.sessionCode },
      streak: { ...effectiveStreak(streakRow.rows[0], ctx.today), week: await weekOf(ctx), settled: { missedDays: settled.gap, freezesUsed: settled.freezeUsed, broken: settled.broken, previousLength: settled.previousLength } },
      goal: { minutes: goalMinutes, activeSeconds: act.activeSeconds, activeMinutes: Math.floor(act.activeSeconds / 60), met: act.goalMet, questionsAnswered: act.answered, correctAnswers: act.correct, cardsReviewed: act.cards },
      plan: plan ? { code: plan.code, versionNo: plan.versionNo, generatedAt: new Date(plan.generatedAt).toISOString(), horizonEnd: plan.horizonEnd } : null,
      day: dayView(day, catalog),
      nextTaskCode: nextTask ? Number(nextTask.code) : null,
      due: { mistakes: due, cards: cards[0].n },
      access: { tier: ent.tier, trialEndsAt: ent.trialEndsAt, validUntil: ent.validUntil },
      usage: { questionsPerDay: { used: usage.used, limit: usage.limit, remaining: usage.remaining } },
    };
  });

  const startTask = ({ caller, code }) => withCtx(deps, caller, async (ctx) => {
    const c = codeParam(code);
    const enr = await requireEnrollment(q, ctx.userId);
    const catalog = await catalogOf(enr);
    const task = await loadTaskByCode(q, ctx, c);
    if (task.planStatus !== 'active') throw new DomainError('PLAN_TASK_STALE', 'This task belongs to an old plan', undefined, 409);
    if (['completed', 'skipped', 'postponed'].includes(task.status)) throw new DomainError('PLAN_TASK_NOT_OPEN', 'Task is already closed', { status: task.status }, 409);
    const starter = taskStarterFor(task.kind);
    if (!starter) throw new DomainError('PLAN_TASK_KIND_UNSUPPORTED', 'This task type is not available yet', { kind: task.kind }, 501);
    const out = await starter(deps, ctx, task, catalog, enr);
    await withTransaction(async (tx) => startTaskRow(tx, ctx, task));
    const after = await loadTaskByCode(q, ctx, c);
    return { task: { code: task.code, kind: task.kind, status: after.status }, ...out };
  });

  const postponeTask = ({ caller, code }) => withCtx(deps, caller, async (ctx) => {
    const c = codeParam(code);
    return withTransaction(async (tx) => {
      const t = await loadTaskByCode(tx.query.bind(tx), ctx, c, { lock: true });
      if (!['pending', 'in_progress'].includes(t.status)) throw new DomainError('PLAN_TASK_NOT_OPEN', 'Task is already closed', { status: t.status }, 409);
      if (t.planStatus !== 'active') throw new DomainError('PLAN_TASK_STALE', 'This task belongs to an old plan', undefined, 409);
      const { rows: nd } = await tx.query(
        `SELECT plan_day_id AS id, plan_day_plan_date::text AS date FROM learning.plan_day WHERE plan_day_study_plan_id=$1 AND plan_day_plan_date > $2 AND plan_day_status NOT IN ('rest','skipped','frozen')
          ORDER BY plan_day_plan_date LIMIT 1`, [t.planId, t.date]);
      if (!nd[0]) throw new DomainError('PLAN_TASK_CANNOT_POSTPONE', 'There is no later day in your plan', undefined, 409);
      const { rows: pos } = await tx.query('SELECT COALESCE(MAX(plan_task_position),0)+1 AS p FROM learning.plan_task WHERE plan_task_plan_day_id=$1', [nd[0].id]);
      const ins = await tx.query(
        `INSERT INTO learning.plan_task (plan_task_tenant_code, plan_task_organization_id, plan_task_plan_day_id, plan_task_position, plan_task_kind, plan_task_reason, plan_task_params, plan_task_reason_params,
            plan_task_estimated_minutes, plan_task_target_item_id, plan_task_target_question_type_id, plan_task_target_skill_id)
         SELECT plan_task_tenant_code, plan_task_organization_id, $2, $3, plan_task_kind, plan_task_reason, plan_task_params, plan_task_reason_params, plan_task_estimated_minutes,
                plan_task_target_item_id, plan_task_target_question_type_id, plan_task_target_skill_id FROM learning.plan_task WHERE plan_task_id=$1 RETURNING plan_task_id AS id, plan_task_code AS code`,
        [t.id, nd[0].id, pos[0].p]);
      await tx.query("UPDATE learning.plan_task SET plan_task_status='postponed', plan_task_postponed_to_task_id=$2 WHERE plan_task_id=$1", [t.id, ins.rows[0].id]);
      const dayStatus = await refreshPlanDayStatus(tx, ctx, t.dayId);
      return { task: { code: t.code, status: 'postponed' }, movedTo: { taskCode: Number(ins.rows[0].code), date: nd[0].date }, dayStatus };
    });
  });

  const skipTask = ({ caller, code }) => withCtx(deps, caller, async (ctx) => {
    const c = codeParam(code);
    return withTransaction(async (tx) => {
      const t = await loadTaskByCode(tx.query.bind(tx), ctx, c, { lock: true });
      if (!['pending', 'in_progress'].includes(t.status)) throw new DomainError('PLAN_TASK_NOT_OPEN', 'Task is already closed', { status: t.status }, 409);
      await tx.query("UPDATE learning.plan_task SET plan_task_status='skipped' WHERE plan_task_id=$1", [t.id]);
      const dayStatus = await refreshPlanDayStatus(tx, ctx, t.dayId);
      return { task: { code: t.code, status: 'skipped' }, dayStatus };
    });
  });

  const heartbeat = ({ caller, seconds, sessionCode }) => withCtx(deps, caller, async (ctx) => {
    const sec = clamp(Math.round(Number(seconds) || 0), 0, 120);
    if (!sec) return { activeSeconds: 0, goalJustMet: false };
    const res = await withTransaction(async (tx) => {
      if (sessionCode) {
        await tx.query(
          "UPDATE learning.study_session SET study_session_active_seconds = study_session_active_seconds + $3, study_session_last_activity_at=$4 WHERE study_session_code=$1 AND study_session_user_account_id=$2 AND study_session_status='in_progress'",
          [codeParam(sessionCode, 'sessionCode'), ctx.userId, sec, ctx.now]);
      }
      return touchActivity(tx, ctx, { activeSeconds: sec });
    });
    return { activeSeconds: res.activityDay.activeSeconds, goalJustMet: res.goalJustMet, milestone: res.milestone, freezeGranted: res.freezeGranted, streakCurrent: res.streak.current };
  });

  const daySummary = ({ caller, date }) => withCtx(deps, caller, async (ctx) => {
    const d = date || ctx.today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new DomainError('VALIDATION_ERROR', 'date must be YYYY-MM-DD', { field: 'date' }, 400);
    const enr = await requireEnrollment(q, ctx.userId);
    const catalog = await catalogOf(enr);
    const plan = await loadActivePlan(q, ctx.userId, enr.id);
    const { rows: a } = await q(
      `SELECT activity_day_active_seconds AS "activeSeconds", activity_day_questions_answered AS answered, activity_day_correct_answers AS correct, activity_day_cards_reviewed AS cards,
              activity_day_new_cards AS "newCards", activity_day_notes_read AS notes, activity_day_goal_minutes AS "goalMinutes", activity_day_goal_met AS "goalMet"
         FROM learning.activity_day WHERE activity_day_user_account_id=$1 AND activity_day_activity_date=$2`, [ctx.userId, d]);
    const { rows: st } = await q(`SELECT ${STREAK_COLS} FROM learning.streak WHERE streak_user_account_id=$1`, [ctx.userId]);
    const day = plan ? await loadDay(q, plan.id, d) : null;
    const tomorrow = plan ? await loadDay(q, plan.id, addDays(d, 1)) : null;
    const act = a[0] || { activeSeconds: 0, answered: 0, correct: 0, cards: 0, newCards: 0, notes: 0, goalMinutes: null, goalMet: false };
    return {
      date: d,
      activity: { activeSeconds: act.activeSeconds, activeMinutes: Math.floor(act.activeSeconds / 60), questionsAnswered: act.answered, correctAnswers: act.correct, accuracy: act.answered ? Math.round((act.correct / act.answered) * 1000) / 10 : null, cardsReviewed: act.cards, newCards: act.newCards, notesRead: act.notes, goalMinutes: act.goalMinutes, goalMet: act.goalMet },
      streak: { ...effectiveStreak(st[0], ctx.today), week: await weekOf(ctx) },
      day: dayView(day, catalog), tomorrow: dayView(tomorrow, catalog),
    };
  });

  const adjust = ({ caller, shortDay, skipDay, reset, focus }) => withCtx(deps, caller, async (ctx) => {
    const modes = [shortDay !== undefined && shortDay !== null && shortDay !== false, !!skipDay, !!reset, !!focus].filter(Boolean).length;
    if (modes !== 1) throw new DomainError('PLAN_ADJUST_INVALID', 'Send exactly one of shortDay, skipDay, reset, focus', undefined, 400);
    const enr = await requireEnrollment(q, ctx.userId);
    const catalog = await catalogOf(enr);
    const tier = await tierOf(ctx.userId);
    let extra = {};
    let reason;
    let freeze = null;
    if (shortDay !== undefined && shortDay !== null && shortDay !== false) {
      const minutes = intParam(shortDay?.minutes ?? shortDay, { min: 5, max: 240, name: 'shortDay.minutes' });
      extra = { overrides: new Map([[ctx.today, minutes]]) }; reason = 'short_day';
    } else if (skipDay) { extra = { skipToday: true }; reason = 'missed_days'; }
    else if (reset) { extra = { resetFocus: true }; reason = 'manual_reset'; }
    else {
      const qt = catalog.questionTypes.find((t) => t.key === focus.questionTypeKey);
      if (!qt) throw new DomainError('PLAN_ADJUST_INVALID', 'Unknown questionTypeKey', { field: 'focus.questionTypeKey' }, 400);
      extra = { focusAdd: { typeId: qt.id, weight: 2.5, until: addDays(ctx.today, 14) } }; reason = 'focus_added';
    }
    await withTransaction(async (tx) => {
      if (skipDay) freeze = await useFreezeForToday(tx, ctx);
      await regeneratePlan(tx, ctx, { enrollment: enr, catalog, reason, tier, ...extra });
    });
    return { reason, freeze, ...(await todayDay(ctx, enr, catalog)) };
  });

  const todayDay = async (ctx, enr, catalog) => {
    const plan = await loadActivePlan(q, ctx.userId, enr.id);
    return { plan: plan ? { code: plan.code, versionNo: plan.versionNo } : null, day: dayView(plan ? await loadDay(q, plan.id, ctx.today) : null, catalog) };
  };

  const preview = ({ caller, days }) => withCtx(deps, caller, async (ctx) => {
    const n = clamp(Number(days) || 7, 1, 30);
    const enr = await requireEnrollment(q, ctx.userId);
    const catalog = await catalogOf(enr);
    await withTransaction(async (tx) => ensurePlan(tx, ctx, { enrollment: enr, catalog, tier: await tierOf(ctx.userId) }));
    const plan = await loadActivePlan(q, ctx.userId, enr.id);
    const list = [];
    for (let i = 0; i < n; i += 1) {
      const d = plan ? await loadDay(q, plan.id, addDays(ctx.today, i)) : null;
      if (d) list.push(dayView(d, catalog));
    }
    const ex = examDateOf(enr);
    return { plan: plan ? { code: plan.code, versionNo: plan.versionNo } : null, daysToExam: ex ? daysBetween(ctx.today, ex) : null, days: list };
  });

  return Object.freeze({ today, startTask, postponeTask, skipTask, heartbeat, daySummary, adjust, preview });
};
