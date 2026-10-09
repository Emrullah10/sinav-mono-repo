import { DomainError } from 'app-shared';
import { invalidateToday } from './cache.js';

export const TASK_SEL = `
  t.plan_task_id AS id, t.plan_task_code AS code, t.plan_task_position AS position, t.plan_task_kind AS kind, t.plan_task_status AS status, t.plan_task_reason AS reason,
  t.plan_task_params AS params, t.plan_task_reason_params AS "reasonParams", t.plan_task_estimated_minutes AS "estimatedMinutes", t.plan_task_progress_pct AS "progressPct",
  t.plan_task_target_item_id AS "targetItemId", t.plan_task_target_question_type_id AS "targetQuestionTypeId", t.plan_task_target_skill_id AS "targetSkillId",
  t.plan_task_started_at AS "startedAt", t.plan_task_completed_at AS "completedAt",
  d.plan_day_id AS "dayId", d.plan_day_code AS "dayCode", d.plan_day_plan_date::text AS "date", d.plan_day_status AS "dayStatus", d.plan_day_study_plan_id AS "planId",
  p.study_plan_status AS "planStatus"`;
export const TASK_FROM = `FROM learning.plan_task t JOIN learning.plan_day d ON d.plan_day_id = t.plan_task_plan_day_id JOIN learning.study_plan p ON p.study_plan_id = d.plan_day_study_plan_id`;

export const loadTaskByCode = async (q, ctx, code, { lock = false } = {}) => {
  const { rows } = await q(`SELECT ${TASK_SEL} ${TASK_FROM} WHERE t.plan_task_code=$1 AND d.plan_day_user_account_id=$2 ${lock ? 'FOR UPDATE OF t' : ''}`, [code, ctx.userId]);
  if (!rows[0]) throw new DomainError('PLAN_TASK_NOT_FOUND', 'Plan task not found', undefined, 404);
  const t = rows[0];
  return { ...t, id: Number(t.id), code: Number(t.code), dayId: Number(t.dayId), planId: Number(t.planId), targetItemId: t.targetItemId ? Number(t.targetItemId) : null, targetQuestionTypeId: t.targetQuestionTypeId ? Number(t.targetQuestionTypeId) : null, targetSkillId: t.targetSkillId ? Number(t.targetSkillId) : null };
};

/** Gün durumunu görevlerden türet: hepsi tamam → completed; bekleyen yok ama atlanan var → partial/skipped. */
export const refreshPlanDayStatus = async (tx, ctx, dayId) => {
  const { rows } = await tx.query(
    `SELECT count(*) FILTER (WHERE plan_task_status IN ('pending','in_progress'))::int AS open, count(*) FILTER (WHERE plan_task_status='completed')::int AS done, count(*)::int AS total
       FROM learning.plan_task WHERE plan_task_plan_day_id=$1`, [dayId]);
  const { open, done, total } = rows[0];
  if (!total || open > 0) return null;
  const status = done === total ? 'completed' : done > 0 ? 'partial' : 'skipped';
  const r = await tx.query(
    "UPDATE learning.plan_day SET plan_day_status=$2, plan_day_completed_at = COALESCE(plan_day_completed_at, $3) WHERE plan_day_id=$1 AND plan_day_status IN ('pending','partial') RETURNING plan_day_plan_date::text AS date", [dayId, status, ctx.now]);
  if (r.rows[0] && status === 'completed') {
    await tx.query('UPDATE learning.activity_day SET activity_day_goal_met = true WHERE activity_day_user_account_id=$1 AND activity_day_activity_date=$2', [ctx.userId, r.rows[0].date]);
  }
  return r.rows[0] ? status : null;
};

export const startTaskRow = async (tx, ctx, task) => {
  if (['completed', 'skipped', 'postponed'].includes(task.status)) return;
  await tx.query("UPDATE learning.plan_task SET plan_task_status='in_progress', plan_task_started_at = COALESCE(plan_task_started_at, $2) WHERE plan_task_id=$1 AND plan_task_status IN ('pending','in_progress')", [task.id, ctx.now]);
};

/** İlerleme yüzdesini yükselt (geri düşmez). */
export const setTaskProgress = async (tx, ctx, taskId, pct) => {
  await tx.query(
    "UPDATE learning.plan_task SET plan_task_progress_pct = GREATEST(plan_task_progress_pct, $2), plan_task_status = CASE WHEN plan_task_status='pending' THEN 'in_progress' ELSE plan_task_status END, plan_task_started_at = COALESCE(plan_task_started_at, $3) WHERE plan_task_id=$1 AND plan_task_status IN ('pending','in_progress')",
    [taskId, Math.max(0, Math.min(99, Math.round(pct))), ctx.now]);
  ctx.after.push(() => invalidateToday(ctx.userId, ctx.today));
};

/** Görevi tamamla (idempotent: koşullu) ve gün durumunu yenile. @returns {boolean} bu çağrıyla tamamlandı mı */
export const completeTask = async (tx, ctx, taskId) => {
  const { rows } = await tx.query(
    `UPDATE learning.plan_task SET plan_task_status='completed', plan_task_progress_pct=100, plan_task_completed_at=$2, plan_task_started_at = COALESCE(plan_task_started_at, $2)
      WHERE plan_task_id=$1 AND plan_task_status IN ('pending','in_progress') RETURNING plan_task_plan_day_id AS "dayId"`, [taskId, ctx.now]);
  if (!rows[0]) return false;
  const dayStatus = await refreshPlanDayStatus(tx, ctx, Number(rows[0].dayId));
  ctx.after.push(() => invalidateToday(ctx.userId, ctx.today));
  return { dayStatus };
};

/** Bugünün (aktif plandaki) uygun bekleyen/süren görevi: tür + isteğe bağlı hedef madde. */
export const findOpenTodayTask = async (q, ctx, { kind, targetItemId = null }) => {
  const { rows } = await q(
    `SELECT ${TASK_SEL} ${TASK_FROM}
      WHERE d.plan_day_user_account_id=$1 AND d.plan_day_plan_date=$2 AND p.study_plan_status='active' AND t.plan_task_kind=$3 AND t.plan_task_status IN ('pending','in_progress')
        AND ($4::bigint IS NULL OR t.plan_task_target_item_id=$4) ORDER BY (t.plan_task_status='in_progress') DESC, t.plan_task_position LIMIT 1`, [ctx.userId, ctx.today, kind, targetItemId]);
  return rows[0] ? { ...rows[0], id: Number(rows[0].id), dayId: Number(rows[0].dayId) } : null;
};

/** Oturum tamamlanınca bağlı plan görevini kapat (L2 de çağırır). */
export const completeTaskForSession = async (tx, ctx, session) => {
  if (!session.sourcePlanTaskId) return false;
  return completeTask(tx, ctx, Number(session.sourcePlanTaskId));
};

/** Kullanıcının bugünkü tür görevini (ör. 'translation', 'mock_exam', 'error_review') tamamla; yoksa false. */
export const completeTodayTaskOfKind = async (tx, ctx, kind, opts = {}) => {
  const t = await findOpenTodayTask(tx.query.bind(tx), ctx, { kind, ...opts });
  return t ? completeTask(tx, ctx, t.id) : false;
};
