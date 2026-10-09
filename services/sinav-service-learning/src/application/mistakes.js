import { DomainError, withTransaction, getPublishedQuestionDtos, getTrackCatalog } from 'app-shared';
import { withCtx } from './lib/ctx.js';
import { requireEnrollment, catalogOf } from './lib/enroll.js';
import { MISTAKE_LADDER_DAYS, RESOLVE_STREAK } from './lib/mistakes.js';
import { MISTAKE_TYPES } from './lib/session-engine.js';
import { registerTaskStarter, getSessionView } from './lib/session-io.js';
import { findOpenSessionForTask } from './lib/practice.js';
import { completeTask } from './lib/plan-tasks.js';
import { codeParam, clamp, shuffle, preview } from './lib/util.js';

const STATUSES = ['open', 'resolved', 'archived'];
const iso = (d) => (d ? new Date(d).toISOString() : null);

export default (deps) => {
  const q = deps.rawQuery;

  const list = ({ caller, query }) => withCtx(deps, caller, async (ctx) => {
    const qq = query || {};
    const status = qq.status && STATUSES.includes(qq.status) ? qq.status : 'open';
    if (qq.status && !STATUSES.includes(qq.status)) throw new DomainError('VALIDATION_ERROR', `status must be one of ${STATUSES.join(', ')}`, { field: 'status' }, 400);
    if (qq.mistakeType && !MISTAKE_TYPES.includes(qq.mistakeType)) throw new DomainError('VALIDATION_ERROR', `mistakeType must be one of ${MISTAKE_TYPES.join(', ')}`, { field: 'mistakeType' }, 400);
    const page = clamp(Number(qq.page) || 1, 1, 1000);
    const size = clamp(Number(qq.pageSize) || 20, 1, 50);
    const sort = { due: 'm.mistake_next_review_at ASC NULLS LAST', recent: 'm.mistake_updated_at DESC', wrong: 'm.mistake_wrong_count DESC' }[qq.sort] || 'm.mistake_next_review_at ASC NULLS LAST';
    const { rows } = await q(
      `SELECT m.mistake_code AS code, m.mistake_item_id AS "itemId", i.item_code AS "itemCode", t.question_type_key AS "typeKey", t.question_type_name AS "typeName", m.mistake_status AS status,
              m.mistake_mistake_type AS "mistakeType", m.mistake_suggested_mistake_type AS "suggestedType", m.mistake_wrong_count AS "wrongCount", m.mistake_review_count AS "reviewCount",
              m.mistake_correct_streak AS streak, m.mistake_interval_days::float8 AS "intervalDays", m.mistake_next_review_at AS "nextReviewAt", m.mistake_last_reviewed_at AS "lastReviewedAt",
              m.mistake_created_at AS "createdAt", count(*) OVER()::int AS total
         FROM learning.mistake m JOIN content.item i ON i.item_id=m.mistake_item_id JOIN content.question_type t ON t.question_type_id=m.mistake_question_type_id
        WHERE m.mistake_user_account_id=$1 AND m.mistake_status=$2 AND ($3::varchar IS NULL OR t.question_type_key=$3) AND ($4::varchar IS NULL OR m.mistake_mistake_type=$4)
          AND ($5::boolean IS NOT TRUE OR m.mistake_next_review_at <= $6)
        ORDER BY ${sort} LIMIT $7 OFFSET $8`,
      [ctx.userId, status, qq.typeKey || null, qq.mistakeType || null, qq.due === 'true' || qq.due === true ? true : null, ctx.now, size, (page - 1) * size]);
    const dtos = await getPublishedQuestionDtos(rows.map((r) => Number(r.itemId)));
    const { rows: counts } = await q(
      `SELECT count(*) FILTER (WHERE mistake_status='open')::int AS open, count(*) FILTER (WHERE mistake_status='resolved')::int AS resolved, count(*) FILTER (WHERE mistake_status='archived')::int AS archived,
              count(*) FILTER (WHERE mistake_status='open' AND mistake_next_review_at <= $2)::int AS due FROM learning.mistake WHERE mistake_user_account_id=$1`, [ctx.userId, ctx.now]);
    const { rows: byType } = await q(
      `SELECT t.question_type_key AS key, t.question_type_name AS name, count(*)::int AS n FROM learning.mistake m JOIN content.question_type t ON t.question_type_id=m.mistake_question_type_id
        WHERE m.mistake_user_account_id=$1 AND m.mistake_status='open' GROUP BY 1,2 ORDER BY n DESC`, [ctx.userId]);
    return {
      items: rows.map((r) => {
        const d = dtos.get(Number(r.itemId));
        return {
          code: Number(r.code), itemCode: Number(r.itemCode), type: { key: r.typeKey, name: r.typeName }, stemPreview: preview(d?.stem, 140), status: r.status,
          mistakeType: r.mistakeType, suggestedMistakeType: r.suggestedType, wrongCount: r.wrongCount, reviewCount: r.reviewCount, correctStreak: r.streak, resolveAfter: RESOLVE_STREAK,
          intervalDays: r.intervalDays, nextReviewAt: iso(r.nextReviewAt), lastReviewedAt: iso(r.lastReviewedAt), isDue: !!r.nextReviewAt && new Date(r.nextReviewAt) <= ctx.now, createdAt: iso(r.createdAt),
        };
      }),
      page, pageSize: size, total: rows[0]?.total || 0,
      counts: { open: counts[0].open, resolved: counts[0].resolved, archived: counts[0].archived, due: counts[0].due }, byType, ladderDays: MISTAKE_LADDER_DAYS, mistakeTypes: MISTAKE_TYPES,
    };
  });

  const patch = ({ caller, code, mistakeType, status }) => withCtx(deps, caller, async (ctx) => {
    if (mistakeType === undefined && status === undefined) throw new DomainError('VALIDATION_ERROR', 'Nothing to update', undefined, 400);
    if (mistakeType !== undefined && mistakeType !== null && !MISTAKE_TYPES.includes(mistakeType)) throw new DomainError('MISTAKE_TYPE_INVALID', 'Unknown mistake type', { allowed: MISTAKE_TYPES }, 400);
    if (status !== undefined && !STATUSES.includes(status)) throw new DomainError('VALIDATION_ERROR', `status must be one of ${STATUSES.join(', ')}`, { field: 'status' }, 400);
    const { rows } = await q(
      `UPDATE learning.mistake SET mistake_mistake_type = CASE WHEN $3::boolean THEN $4 ELSE mistake_mistake_type END,
              mistake_status = COALESCE($5, mistake_status),
              mistake_resolved_at = CASE WHEN $5='resolved' THEN $6 WHEN $5='open' THEN NULL ELSE mistake_resolved_at END,
              mistake_correct_streak = CASE WHEN $5='open' THEN 0 ELSE mistake_correct_streak END,
              mistake_next_review_at = CASE WHEN $5='open' THEN $6 WHEN $5 IN ('resolved','archived') THEN NULL ELSE mistake_next_review_at END
        WHERE mistake_code=$1 AND mistake_user_account_id=$2 RETURNING mistake_code AS code, mistake_status AS status, mistake_mistake_type AS "mistakeType", mistake_next_review_at AS "nextReviewAt"`,
      [codeParam(code), ctx.userId, mistakeType !== undefined, mistakeType ?? null, status ?? null, ctx.now]);
    if (!rows[0]) throw new DomainError('MISTAKE_NOT_FOUND', 'Mistake not found', undefined, 404);
    return { code: Number(rows[0].code), status: rows[0].status, mistakeType: rows[0].mistakeType, nextReviewAt: iso(rows[0].nextReviewAt) };
  });

  /** Vadesi gelen açık hatalardan "error_review" oturumu. */
  const createReview = async (ctx, { limit, typeKey, taskId = null, enr }) => {
    const L = clamp(Number(limit) || 10, 3, 30);
    const { rows } = await q(
      `SELECT m.mistake_item_id AS "itemId", qn.question_id AS "questionId" FROM learning.mistake m JOIN content.item i ON i.item_id=m.mistake_item_id AND i.item_status='published'
         JOIN content.question qn ON qn.question_item_revision_id=i.item_published_revision_id JOIN content.question_type t ON t.question_type_id=m.mistake_question_type_id
        WHERE m.mistake_user_account_id=$1 AND m.mistake_status='open' AND m.mistake_next_review_at <= $2 AND ($4::varchar IS NULL OR t.question_type_key=$4)
        ORDER BY m.mistake_next_review_at LIMIT $3`, [ctx.userId, ctx.now, L, typeKey || null]);
    if (!rows.length) return { empty: true, code: null };
    const dtos = await getPublishedQuestionDtos(rows.map((r) => Number(r.itemId)));
    const picks = rows.map((r) => ({ itemId: Number(r.itemId), questionId: Number(r.questionId), dto: dtos.get(Number(r.itemId)) })).filter((p) => p.dto && p.dto.questionId === p.questionId);
    if (!picks.length) return { empty: true, code: null };
    const code = await withTransaction(async (tx) => {
      const { rows: r } = await tx.query(
        `INSERT INTO learning.study_session (study_session_tenant_code, study_session_organization_id, study_session_user_account_id, study_session_enrollment_id, study_session_kind, study_session_status,
            study_session_mode, study_session_source_plan_task_id, study_session_config, study_session_started_at, study_session_last_activity_at, study_session_planned_item_count)
         VALUES ($1,$2,$3,$4,'error_review','in_progress','learning',$5,$6,$7,$7,$8) RETURNING study_session_id AS id, study_session_code AS code`,
        [ctx.tenantCode, ctx.orgId, ctx.userId, enr.id, taskId, JSON.stringify({ questionTypeKeys: typeKey ? [typeKey] : [], limit: L }), ctx.now, picks.length]);
      const sid = Number(r[0].id);
      for (let i = 0; i < picks.length; i += 1) {
        const order = shuffle(picks[i].dto.options.map((o) => o.label));
        await tx.query(
          `INSERT INTO learning.study_session_item (study_session_item_tenant_code, study_session_item_organization_id, study_session_item_study_session_id, study_session_item_position,
              study_session_item_item_id, study_session_item_question_id, study_session_item_option_order) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [ctx.tenantCode, ctx.orgId, sid, i + 1, picks[i].itemId, picks[i].questionId, order]);
      }
      return Number(r[0].code);
    });
    return { empty: false, code };
  };

  const startReview = ({ caller, limit, typeKey }) => withCtx(deps, caller, async (ctx) => {
    const enr = await requireEnrollment(q, ctx.userId);
    const r = await createReview(ctx, { limit, typeKey, enr });
    if (r.empty) return { empty: true, session: null };
    return { empty: false, code: r.code, session: (await getSessionView(deps, ctx, r.code)).view };
  });

  void catalogOf; void getTrackCatalog;
  return Object.freeze({ list, patch, startReview, createReview });
};

registerTaskStarter('error_review', async (deps, ctx, task, catalog, enr) => {
  const open = await findOpenSessionForTask(deps.rawQuery, ctx.userId, task.id);
  if (open) return { empty: false, session: { code: open.code, kind: open.kind, resumed: true } };
  const r = await deps.uc.mistakes.createReview(ctx, { limit: task.params?.limit || 10, taskId: task.id, enr });
  if (r.empty) {
    await withTransaction(async (tx) => completeTask(tx, ctx, task.id));
    return { empty: true, session: null };
  }
  return { empty: false, session: { code: r.code, kind: 'error_review', resumed: false } };
});
