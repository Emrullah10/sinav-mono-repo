import { DomainError, withTransaction, getQuestionDtosForPairs, requiredCorrect } from 'app-shared';
import { withCtx } from './lib/ctx.js';
import { requireEnrollment, catalogOf, loadActiveEnrollment } from './lib/enroll.js';
import { loadPublishedQuestions, toUnits, selectUnits, flattenUnits, insertSessionItems } from './lib/questions.js';
import { loadSession } from './lib/attempts.js';
import { submitAnswer, completeSession } from './lib/session-engine.js';
import { updateMastery } from './lib/mastery.js';
import { estimateScore, sectionsOf, scoringOf, saveScoreEstimate, defaultLevelEstimate, trialValue } from './lib/estimate.js';
import { regenActive } from './lib/plan-io.js';
import { getItemView, getSessionView, setSessionPaused } from './lib/session-io.js';
import { codeParam, intParam, round1, clientRefParam } from './lib/util.js';

export const DIAGNOSTIC_QUESTIONS = 30;
export const DIAGNOSTIC_ALGO = 'fixed-v1';
const HALF = Math.floor(DIAGNOSTIC_QUESTIONS / 2);

const ensureSetting = (tx, ctx) => tx.query(
  `INSERT INTO learning.learner_setting (learner_setting_tenant_code, learner_setting_organization_id, learner_setting_user_account_id) VALUES ($1,$2,$3)
   ON CONFLICT (learner_setting_user_account_id) DO NOTHING`, [ctx.tenantCode, ctx.orgId, ctx.userId]);

export default (deps) => {
  const q = deps.rawQuery;

  const diagView = (s, halfway) => ({ ...s.view, halfway: !!halfway, halfwayAt: HALF });

  const isHalfway = (session) => session.status !== 'completed' && session.answeredCount >= HALF && !session.config?.halfwayDone;

  const start = ({ caller }) => withCtx(deps, caller, async (ctx) => {
    const enr = await requireEnrollment(q, ctx.userId);
    const { rows: ex } = await q(
      `SELECT study_session_code AS code, study_session_status AS status FROM learning.study_session
        WHERE study_session_user_account_id=$1 AND study_session_kind='diagnostic' AND study_session_enrollment_id=$2 ORDER BY study_session_id DESC LIMIT 1`, [ctx.userId, enr.id]);
    if (ex[0] && ['in_progress', 'paused', 'completed'].includes(ex[0].status)) {
      const code = Number(ex[0].code);
      if (ex[0].status === 'paused') await setSessionPaused(deps, ctx, code, false);
      const s = await getSessionView(deps, ctx, code);
      return { resumed: true, session: diagView(s, isHalfway(s.session)) };
    }
    const catalog = await catalogOf(enr);
    const rows = await loadPublishedQuestions(q, ctx.userId, { examIds: catalog.poolExamIds, tiers: ['free'], language: catalog.track.contentLanguage });
    const weights = new Map(catalog.sections.map((s) => [s.questionTypeId, s.questionCount]));
    const picked = flattenUnits(selectUnits(toUnits(rows), { count: DIAGNOSTIC_QUESTIONS, typeWeights: weights, targetDifficulty: 3, allowOvershoot: 0 }));
    if (picked.length < 5) throw new DomainError('DIAGNOSTIC_UNAVAILABLE', 'There are not enough questions for the placement test yet', undefined, 503);
    const code = await withTransaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(7003, $1::int)', [ctx.userId]);
      const { rows: r } = await tx.query(
        `INSERT INTO learning.study_session (study_session_tenant_code, study_session_organization_id, study_session_user_account_id, study_session_enrollment_id, study_session_kind, study_session_status,
            study_session_mode, study_session_config, study_session_started_at, study_session_last_activity_at, study_session_planned_item_count)
         VALUES ($1,$2,$3,$4,'diagnostic','in_progress','standard',$5,$6,$6,$7) RETURNING study_session_id AS id, study_session_code AS code`,
        [ctx.tenantCode, ctx.orgId, ctx.userId, enr.id, JSON.stringify({ algorithm: DIAGNOSTIC_ALGO, halfwayAt: HALF }), ctx.now, picked.length]);
      await insertSessionItems(tx, ctx, Number(r[0].id), picked);
      return Number(r[0].code);
    });
    const s = await getSessionView(deps, ctx, code);
    return { resumed: false, session: diagView(s, false) };
  });

  const get = ({ caller, code, position }) => withCtx(deps, caller, async (ctx) => {
    const c = codeParam(code);
    const s = await getSessionView(deps, ctx, c);
    if (s.session.kind !== 'diagnostic') throw new DomainError('SESSION_NOT_FOUND', 'Session not found', undefined, 404);
    const base = { session: diagView(s, isHalfway(s.session)) };
    const pos = position ? intParam(position, { name: 'position' }) : base.session.currentPosition;
    if (s.session.status === 'completed' || !pos) return { ...base, current: null };
    const { view } = await getItemView(deps, ctx, c, pos);
    return { ...base, current: view };
  });

  const answer = ({ caller, code, position, selectedLabel, timeMs, clientRef }) => withCtx(deps, caller, async (ctx) => {
    const c = codeParam(code);
    const s = await loadSession(q, ctx, c);
    if (s.kind !== 'diagnostic') throw new DomainError('SESSION_NOT_FOUND', 'Session not found', undefined, 404);
    const res = await submitAnswer(deps, ctx, { code: c, position: intParam(position, { name: 'position' }), selectedLabel: selectedLabel ?? null, timeMs, clientRef: clientRefParam(clientRef) });
    const now = await loadSession(q, ctx, c);
    const halfway = isHalfway(now) && !res.replayed;
    if (halfway) await q("UPDATE learning.study_session SET study_session_config = study_session_config || '{\"halfwayDone\":true}'::jsonb WHERE study_session_id=$1", [now.id]);
    let nextItem = null;
    if (!halfway && res.next) nextItem = (await getItemView(deps, ctx, c, res.next)).view;
    return { replayed: res.replayed, outcome: res.outcome, progress: res.progress, next: res.next, halfway, nextItem };
  });

  const pause = ({ caller, code }) => withCtx(deps, caller, async (ctx) => setSessionPaused(deps, ctx, codeParam(code), true));

  const complete = ({ caller, code }) => withCtx(deps, caller, async (ctx) => {
    const c = codeParam(code);
    const s0 = await loadSession(q, ctx, c);
    if (s0.kind !== 'diagnostic') throw new DomainError('SESSION_NOT_FOUND', 'Session not found', undefined, 404);
    if (s0.status === 'completed') return { already: true, result: await resultOf(ctx, c) };
    const enr = await requireEnrollment(q, ctx.userId);
    const catalog = await catalogOf(enr);
    await completeSession(deps, ctx, {
      code: c,
      hooks: {
        afterComplete: async (tx, cx, { session, items }) => {
          const dtoMap = await getQuestionDtosForPairs(items.map((i) => ({ itemId: i.itemId, questionId: i.questionId })));
          const perType = new Map();
          const detail = new Map();
          for (const it of items) {
            const dto = dtoMap.get(it.questionId);
            if (!dto) continue;
            const answered = it.status === 'answered' && it.selectedLabel;
            const correct = answered && it.isCorrect === true;
            const v = trialValue({ correct, blank: !answered, difficulty: dto.difficulty });
            const t = perType.get(dto.questionType.id) || { s: 0, n: 0 };
            t.s += v; t.n += 1; perType.set(dto.questionType.id, t);
            const d = detail.get(dto.questionType.id) || { correct: 0, wrong: 0, blank: 0 };
            if (!answered) d.blank += 1; else if (correct) d.correct += 1; else d.wrong += 1;
            detail.set(dto.questionType.id, d);
            await updateMastery(tx, cx, { questionTypeId: dto.questionType.id, skills: dto.skills, difficulty: dto.difficulty, correct: !!correct, hinted: false });
          }
          const est = estimateScore({ sections: sectionsOf(catalog), perType, scoring: scoringOf(catalog), questionCount: catalog.blueprint.questionCount });
          const typeEstimates = est.types.map((t) => ({ typeKey: catalog.questionTypes.find((x) => x.id === t.typeId)?.key, p: t.p, n: t.n, ...(detail.get(t.typeId) || { correct: 0, wrong: 0, blank: 0 }) }));
          await tx.query(
            `INSERT INTO learning.diagnostic_result (diagnostic_result_tenant_code, diagnostic_result_organization_id, diagnostic_result_user_account_id, diagnostic_result_study_session_id,
                diagnostic_result_enrollment_id, diagnostic_result_algorithm_version, diagnostic_result_score_low, diagnostic_result_score_high, diagnostic_result_score_point,
                diagnostic_result_confidence, diagnostic_result_basis_question_count, diagnostic_result_type_estimates)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (diagnostic_result_study_session_id) DO NOTHING`,
            [cx.tenantCode, cx.orgId, cx.userId, session.id, enr.id, DIAGNOSTIC_ALGO, est.low, est.high, est.point, est.confidence, est.basisQuestionCount, JSON.stringify(typeEstimates)]);
          await saveScoreEstimate(tx, cx, { enrollmentId: enr.id, source: 'diagnostic', sourceSessionId: session.id, est });
          await ensureSetting(tx, cx);
          await tx.query('UPDATE learning.learner_setting SET learner_setting_onboarding_completed_at=COALESCE(learner_setting_onboarding_completed_at,$2) WHERE learner_setting_user_account_id=$1', [cx.userId, cx.now]);
          await tx.query("UPDATE learning.plan_task SET plan_task_status='completed', plan_task_progress_pct=100, plan_task_completed_at=$2 WHERE plan_task_kind='diagnostic' AND plan_task_status IN ('pending','in_progress') AND plan_task_plan_day_id IN (SELECT plan_day_id FROM learning.plan_day WHERE plan_day_user_account_id=$1)", [cx.userId, cx.now]);
          await regenActive(tx, cx, 'diagnostic');
          return null;
        },
      },
    });
    return { already: false, result: await resultOf(ctx, c) };
  });

  const resultOf = async (ctx, c) => {
    const session = await loadSession(q, ctx, c);
    if (session.kind !== 'diagnostic') throw new DomainError('SESSION_NOT_FOUND', 'Session not found', undefined, 404);
    if (session.status !== 'completed') throw new DomainError('SESSION_NOT_FINISHED', 'The placement test is not finished', { status: session.status }, 409);
    const { rows } = await q(
      `SELECT diagnostic_result_score_low::float8 AS low, diagnostic_result_score_high::float8 AS high, diagnostic_result_score_point::float8 AS point, diagnostic_result_confidence::float8 AS confidence,
              diagnostic_result_basis_question_count AS basis, diagnostic_result_type_estimates AS types, diagnostic_result_enrollment_id AS "enrollmentId"
         FROM learning.diagnostic_result WHERE diagnostic_result_study_session_id=$1`, [session.id]);
    const r = rows[0];
    if (!r) throw new DomainError('DIAGNOSTIC_RESULT_NOT_FOUND', 'Result not found', undefined, 404);
    const enr = await loadActiveEnrollment(q, ctx.userId);
    const catalog = await catalogOf(enr);
    const scoring = scoringOf(catalog);
    const need = requiredCorrect(enr.targetScore, scoring, catalog.blueprint.questionCount);
    const types = (r.types || []).map((t) => {
      const qt = catalog.questionTypes.find((x) => x.key === t.typeKey) || {};
      const sec = catalog.sections.find((x) => x.questionTypeId === qt.id);
      return { typeKey: t.typeKey, name: qt.name || t.typeKey, questionCountInExam: sec?.questionCount || 0, answered: t.n, correct: t.correct, wrong: t.wrong, blank: t.blank, estimatedAccuracy: t.p };
    });
    const ranked = [...types].filter((t) => t.answered > 0).sort((a, b) => b.estimatedAccuracy - a.estimatedAccuracy);
    const total = session.plannedItemCount;
    return {
      sessionCode: session.code, completedAt: session.endedAt ? new Date(session.endedAt).toISOString() : null,
      estimate: { low: r.low, high: r.high, point: r.point, confidence: r.confidence, basisQuestionCount: r.basis, scoreMax: catalog.blueprint.scoreMax },
      target: { score: enr.targetScore, requiredCorrect: need, gapPoints: Math.max(0, Math.round((enr.targetScore - r.point) * 10) / 10) },
      totals: { total, correct: session.correctCount, wrong: session.wrongCount, blank: session.blankCount, accuracy: total ? round1((session.correctCount / total) * 100) : 0 },
      types, strongest: ranked.slice(0, 2).map((t) => t.typeKey), weakest: ranked.slice(-2).reverse().map((t) => t.typeKey),
      planReady: true,
    };
  };

  const result = ({ caller, code }) => withCtx(deps, caller, (ctx) => resultOf(ctx, codeParam(code)));

  const skip = ({ caller }) => withCtx(deps, caller, async (ctx) => {
    const enr = await requireEnrollment(q, ctx.userId);
    const { rows: sk } = await q('SELECT learner_setting_diagnostic_skipped_at AS at FROM learning.learner_setting WHERE learner_setting_user_account_id=$1', [ctx.userId]);
    if (sk[0]?.at) return { skipped: true, already: true };
    const { rows } = await q("SELECT 1 FROM learning.study_session WHERE study_session_user_account_id=$1 AND study_session_kind='diagnostic' AND study_session_enrollment_id=$2 AND study_session_status='completed'", [ctx.userId, enr.id]);
    if (rows[0]) throw new DomainError('DIAGNOSTIC_ALREADY_COMPLETED', 'The placement test is already completed', undefined, 409);
    const catalog = await catalogOf(enr);
    await withTransaction(async (tx) => {
      await ensureSetting(tx, ctx);
      await tx.query('UPDATE learning.learner_setting SET learner_setting_diagnostic_skipped_at=COALESCE(learner_setting_diagnostic_skipped_at,$2), learner_setting_onboarding_completed_at=COALESCE(learner_setting_onboarding_completed_at,$2) WHERE learner_setting_user_account_id=$1', [ctx.userId, ctx.now]);
      await tx.query("UPDATE learning.study_session SET study_session_status='abandoned', study_session_ended_at=$3 WHERE study_session_user_account_id=$1 AND study_session_kind='diagnostic' AND study_session_enrollment_id=$2 AND study_session_status IN ('in_progress','paused')", [ctx.userId, enr.id, ctx.now]);
      await saveScoreEstimate(tx, ctx, { enrollmentId: enr.id, source: 'default_level', est: defaultLevelEstimate(catalog) });
      await tx.query("UPDATE learning.plan_task SET plan_task_status='skipped' WHERE plan_task_kind='diagnostic' AND plan_task_status IN ('pending','in_progress') AND plan_task_plan_day_id IN (SELECT plan_day_id FROM learning.plan_day WHERE plan_day_user_account_id=$1)", [ctx.userId]);
      await regenActive(tx, ctx, 'diagnostic_skipped');
    });
    return { skipped: true };
  });

  return Object.freeze({ start, get, answer, pause, complete, result, skip });
};
