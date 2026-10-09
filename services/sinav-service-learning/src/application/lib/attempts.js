import { DomainError } from 'app-shared';
import { clamp } from './util.js';

export const SESSION_SEL = `
  s.study_session_id AS id, s.study_session_code AS code, s.study_session_user_account_id AS "userId", s.study_session_enrollment_id AS "enrollmentId", s.study_session_kind AS kind,
  s.study_session_status AS status, s.study_session_mode AS mode, s.study_session_source_plan_task_id AS "sourcePlanTaskId", s.study_session_config AS config,
  s.study_session_started_at AS "startedAt", s.study_session_ended_at AS "endedAt", s.study_session_last_activity_at AS "lastActivityAt", s.study_session_active_seconds AS "activeSeconds",
  s.study_session_planned_item_count AS "plannedItemCount", s.study_session_answered_count AS "answeredCount", s.study_session_correct_count AS "correctCount",
  s.study_session_wrong_count AS "wrongCount", s.study_session_blank_count AS "blankCount", s.study_session_hints_used AS "hintsUsed", s.study_session_score::float8 AS score`;

export const ITEM_SEL = `
  i.study_session_item_id AS id, i.study_session_item_code AS code, i.study_session_item_study_session_id AS "sessionId", i.study_session_item_position AS position,
  i.study_session_item_item_id AS "itemId", i.study_session_item_question_id AS "questionId", i.study_session_item_status AS status, i.study_session_item_option_order AS "optionOrder",
  i.study_session_item_selected_label AS "selectedLabel", i.study_session_item_is_correct AS "isCorrect", i.study_session_item_is_flagged AS "isFlagged",
  i.study_session_item_eliminated_labels AS "eliminatedLabels", i.study_session_item_tries AS tries, i.study_session_item_hints_revealed AS "hintsRevealed",
  i.study_session_item_solution_viewed AS "solutionViewed", i.study_session_item_time_spent_ms AS "timeSpentMs", i.study_session_item_first_seen_at AS "firstSeenAt",
  i.study_session_item_answered_at AS "answeredAt", i.study_session_item_metadata AS meta`;

const normSession = (s) => s && ({ ...s, id: Number(s.id), code: Number(s.code), userId: Number(s.userId), enrollmentId: s.enrollmentId ? Number(s.enrollmentId) : null, sourcePlanTaskId: s.sourcePlanTaskId ? Number(s.sourcePlanTaskId) : null });
const normItem = (i) => i && ({ ...i, id: Number(i.id), code: Number(i.code), sessionId: Number(i.sessionId), itemId: Number(i.itemId), questionId: Number(i.questionId), eliminatedLabels: i.eliminatedLabels || [] });

export const loadSession = async (q, ctx, code, { lock = false } = {}) => {
  const { rows } = await q(`SELECT ${SESSION_SEL} FROM learning.study_session s WHERE s.study_session_code=$1 AND s.study_session_user_account_id=$2 ${lock ? 'FOR UPDATE' : ''}`, [code, ctx.userId]);
  if (!rows[0]) throw new DomainError('SESSION_NOT_FOUND', 'Session not found', undefined, 404);
  return normSession(rows[0]);
};

export const loadItems = async (q, sessionId) => {
  const { rows } = await q(`SELECT ${ITEM_SEL} FROM learning.study_session_item i WHERE i.study_session_item_study_session_id=$1 ORDER BY i.study_session_item_position`, [sessionId]);
  return rows.map(normItem);
};

export const loadItem = async (q, sessionId, position, { lock = false } = {}) => {
  const { rows } = await q(`SELECT ${ITEM_SEL} FROM learning.study_session_item i WHERE i.study_session_item_study_session_id=$1 AND i.study_session_item_position=$2 ${lock ? 'FOR UPDATE' : ''}`, [sessionId, position]);
  if (!rows[0]) throw new DomainError('SESSION_ITEM_NOT_FOUND', 'Item not found', undefined, 404);
  return normItem(rows[0]);
};

/**
 * Değişmez cevap olayı. client_ref ile idempotent: aynı (kullanıcı, client_ref) varsa `{ duplicate:true }` döner.
 * @param {object} a { session, item, dto, selectedLabel|null, tryNo, timeMs, hintsRevealed, clientRef, countsForMastery, correct, metadata, now }
 */
export const recordAttempt = async (tx, ctx, a) => {
  const blank = a.selectedLabel === null || a.selectedLabel === undefined;
  const { rows } = await tx.query(
    `INSERT INTO learning.attempt (attempt_tenant_code, attempt_organization_id, attempt_user_account_id, attempt_study_session_id, attempt_study_session_item_id, attempt_item_id, attempt_question_id,
        attempt_question_type_id, attempt_try_no, attempt_selected_label, attempt_is_correct, attempt_is_blank, attempt_hints_revealed, attempt_time_ms, attempt_answered_at, attempt_client_ref,
        attempt_counts_for_mastery, attempt_metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT (attempt_user_account_id, attempt_client_ref) DO NOTHING RETURNING attempt_id AS id, attempt_code AS code`,
    [ctx.tenantCode, ctx.orgId, ctx.userId, a.session.id, a.item.id, a.item.itemId, a.item.questionId, a.dto.questionType.id, clamp(a.tryNo || 1, 1, 3), blank ? null : a.selectedLabel,
      blank ? false : !!a.correct, blank, clamp(a.hintsRevealed || 0, 0, 10), Math.max(0, Math.round(a.timeMs || 0)), a.now || ctx.now, a.clientRef || null,
      a.countsForMastery !== false, JSON.stringify(a.metadata || {})]);
  if (!rows[0]) return { duplicate: true };
  return { id: Number(rows[0].id), code: Number(rows[0].code), duplicate: false };
};

export const findAttemptByClientRef = async (q, userId, clientRef) => {
  if (!clientRef) return null;
  const { rows } = await q('SELECT attempt_id AS id, attempt_study_session_id AS "sessionId", attempt_study_session_item_id AS "itemId" FROM learning.attempt WHERE attempt_user_account_id=$1 AND attempt_client_ref=$2', [userId, clientRef]);
  return rows[0] ? { id: Number(rows[0].id), sessionId: Number(rows[0].sessionId), itemId: Number(rows[0].itemId) } : null;
};

/** Oturum sayaçlarını maddelerden yeniden hesapla (tek doğruluk kaynağı: study_session_item). `finalize` ise bekleyenler boş sayılır. */
export const recomputeSessionCounters = async (tx, sessionId, { finalize = false } = {}) => {
  const { rows } = await tx.query(
    `UPDATE learning.study_session s SET
        study_session_answered_count = a.answered, study_session_correct_count = a.correct, study_session_wrong_count = a.answered - a.correct,
        study_session_blank_count = CASE WHEN $2 THEN a.total - a.answered ELSE a.skipped END,
        study_session_hints_used = a.hints, study_session_planned_item_count = a.total
       FROM (SELECT count(*) FILTER (WHERE study_session_item_status='answered')::int AS answered,
                    count(*) FILTER (WHERE study_session_item_status='answered' AND study_session_item_is_correct)::int AS correct,
                    count(*) FILTER (WHERE study_session_item_status='skipped')::int AS skipped,
                    count(*)::int AS total, COALESCE(sum(study_session_item_hints_revealed),0)::int AS hints
               FROM learning.study_session_item WHERE study_session_item_study_session_id=$1) a
      WHERE s.study_session_id=$1
      RETURNING s.study_session_answered_count AS "answeredCount", s.study_session_correct_count AS "correctCount", s.study_session_wrong_count AS "wrongCount", s.study_session_blank_count AS "blankCount",
                s.study_session_hints_used AS "hintsUsed", s.study_session_planned_item_count AS "plannedItemCount"`, [sessionId, finalize]);
  return rows[0];
};

export const touchSession = (tx, sessionId, now, extra = '') =>
  tx.query(`UPDATE learning.study_session SET study_session_last_activity_at=$2 ${extra} WHERE study_session_id=$1`, [sessionId, now]);
