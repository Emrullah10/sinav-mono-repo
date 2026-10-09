import {
  DomainError, withTransaction, consumeQuota, refundQuota, peekUsage, getEntitlements, getQuestionDtosForPairs, getTrackCatalog, scoreFromCounts, maxScore, requiredCorrect,
} from 'app-shared';
import { withCtx, loadCtxForUser, flushAfter } from './lib/ctx.js';
import { requireEnrollment, catalogOf } from './lib/enroll.js';
import { recordAttempt, loadItems, recomputeSessionCounters } from './lib/attempts.js';
import { buildItemView, solutionBlock, sessionProgress } from './lib/session-engine.js';
import { updateMastery } from './lib/mastery.js';
import { upsertMistake, suggestMistakeType } from './lib/mistakes.js';
import { touchActivity } from './lib/activity.js';
import { completeTodayTaskOfKind } from './lib/plan-tasks.js';
import { estimateScore, saveScoreEstimate, trialValue, sectionsOf, estimateView, latestEstimate } from './lib/estimate.js';
import { regenActive } from './lib/plan-io.js';
import { registerTaskStarter, tierOf } from './lib/session-io.js';
import { codeParam, intParam, clamp, round1, preview } from './lib/util.js';

const FORM_SEL = `i.item_id AS "itemId", i.item_code AS code, i.item_access_tier AS tier, f.exam_form_id AS "formId", f.exam_form_blueprint_id AS "blueprintId", f.exam_form_title AS title,
  f.exam_form_form_type AS "formType", f.exam_form_question_count AS "questionCount", f.exam_form_duration_seconds AS "durationSeconds", f.exam_form_is_recommended AS recommended`;
const FORM_FROM = `FROM content.item i JOIN content.exam_form f ON f.exam_form_item_revision_id=i.item_published_revision_id WHERE i.item_kind='exam_form' AND i.item_status='published'`;
const QUOTA_FEATURE = { full: 'full_exams_per_month', mini: 'mini_exams_per_month' };
const MODES = ['standard', 'relaxed', 'timed', 'quick', 'learning'];
const GRACE_MS = 3000;
const iso = (d) => (d ? new Date(d).toISOString() : null);

export default (deps) => {
  const q = deps.rawQuery;

  const loadForm = async (qq, code, poolExamIds = null) => {
    const { rows } = await qq(
      `SELECT ${FORM_SEL} ${FORM_FROM} AND i.item_code=$1 AND ($2::bigint[] IS NULL OR EXISTS (SELECT 1 FROM content.item_exam ie WHERE ie.item_exam_item_id=i.item_id AND ie.item_exam_exam_id = ANY($2)))`,
      [codeParam(code, 'formCode'), poolExamIds]);
    if (!rows[0]) throw new DomainError('EXAM_FORM_NOT_FOUND', 'Exam form not found', undefined, 404);
    return { ...rows[0], itemId: Number(rows[0].itemId), code: Number(rows[0].code), formId: Number(rows[0].formId), blueprintId: Number(rows[0].blueprintId) };
  };

  const SITTING_SEL = `
    x.exam_sitting_id AS id, x.exam_sitting_code AS code, x.exam_sitting_study_session_id AS "sessionId", x.exam_sitting_exam_form_item_id AS "formItemId", x.exam_sitting_exam_form_id AS "formId",
    x.exam_sitting_blueprint_id AS "blueprintId", x.exam_sitting_time_limit_seconds AS "limitSeconds", x.exam_sitting_extra_time_percent AS "extraPercent", x.exam_sitting_deadline_at AS "deadlineAt",
    x.exam_sitting_paused_at AS "pausedAt", x.exam_sitting_remaining_seconds_at_pause AS "remainingAtPause", x.exam_sitting_paused_total_seconds AS "pausedTotal", x.exam_sitting_current_position AS "currentPosition",
    x.exam_sitting_submitted_at AS "submittedAt", x.exam_sitting_submit_reason AS "submitReason", x.exam_sitting_score::float8 AS score, x.exam_sitting_correct_count AS correct,
    x.exam_sitting_wrong_count AS wrong, x.exam_sitting_blank_count AS blank, x.exam_sitting_is_personal_best AS "isPersonalBest",
    s.study_session_code AS "sessionCode", s.study_session_status AS "sessionStatus", s.study_session_mode AS mode, s.study_session_enrollment_id AS "enrollmentId", s.study_session_started_at AS "startedAt",
    s.study_session_ended_at AS "endedAt", s.study_session_config AS config, i.item_code AS "formCode", f.exam_form_title AS title, f.exam_form_form_type AS "formType", f.exam_form_question_count AS "questionCount"`;
  const SITTING_FROM = `FROM learning.exam_sitting x JOIN learning.study_session s ON s.study_session_id=x.exam_sitting_study_session_id JOIN content.item i ON i.item_id=x.exam_sitting_exam_form_item_id
    JOIN content.exam_form f ON f.exam_form_id=x.exam_sitting_exam_form_id`;

  const loadSitting = async (qq, ctx, code, { lock = false } = {}) => {
    const { rows } = await qq(`SELECT ${SITTING_SEL} ${SITTING_FROM} WHERE x.exam_sitting_code=$1 AND s.study_session_user_account_id=$2 ${lock ? 'FOR UPDATE OF x, s' : ''}`, [codeParam(code), ctx.userId]);
    if (!rows[0]) throw new DomainError('EXAM_SITTING_NOT_FOUND', 'Exam sitting not found', undefined, 404);
    const r = rows[0];
    return { ...r, id: Number(r.id), code: Number(r.code), sessionId: Number(r.sessionId), formItemId: Number(r.formItemId), formId: Number(r.formId), blueprintId: Number(r.blueprintId), sessionCode: Number(r.sessionCode), formCode: Number(r.formCode), enrollmentId: r.enrollmentId ? Number(r.enrollmentId) : null };
  };

  const loadBlueprint = async (qq, id) => {
    const { rows } = await qq('SELECT blueprint_question_count AS count, blueprint_scoring_method AS method, blueprint_scoring_params AS params, blueprint_score_max::float8 AS max FROM content.blueprint WHERE blueprint_id=$1', [id]);
    return { questionCount: rows[0].count, scoring: { method: rows[0].method, params: rows[0].params || {} }, scoreMax: rows[0].max };
  };

  const remainingSeconds = (s, now) => {
    if (s.submittedAt) return 0;
    if (s.pausedAt) return s.remainingAtPause ?? 0;
    return Math.max(0, Math.ceil((new Date(s.deadlineAt) - now) / 1000));
  };
  const statusOf = (s) => (s.submittedAt ? 'submitted' : s.pausedAt ? 'paused' : 'in_progress');

  const stateView = async (qq, ctx, s) => {
    const items = await loadItems(qq, s.sessionId);
    return {
      code: s.code, formCode: s.formCode, title: s.title, formType: s.formType, mode: s.mode, status: statusOf(s), questionCount: items.length,
      timeLimitSeconds: s.limitSeconds, extraTimePercent: s.extraPercent, deadlineAt: s.submittedAt ? null : iso(s.deadlineAt), serverNow: iso(ctx.now), remainingSeconds: remainingSeconds(s, ctx.now),
      pausedAt: iso(s.pausedAt), currentPosition: s.currentPosition, startedAt: iso(s.startedAt), submittedAt: iso(s.submittedAt), submitReason: s.submitReason,
      answeredCount: items.filter((i) => i.selectedLabel).length, flaggedPositions: items.filter((i) => i.isFlagged).map((i) => i.position),
      items: items.map((i) => ({ position: i.position, answered: !!i.selectedLabel, flagged: i.isFlagged })),
    };
  };

  // ── Gönderme (ortak: kullanıcı / zaman aşımı) ──
  const submitTx = async (tx, ctx, sitting, reason) => {
    const qq = tx.query.bind(tx);
    const items = await loadItems(qq, sitting.sessionId);
    const dtoMap = await getQuestionDtosForPairs(items.map((i) => ({ itemId: i.itemId, questionId: i.questionId })));
    const bp = await loadBlueprint(qq, sitting.blueprintId);
    let correct = 0; let wrong = 0; let blank = 0; let spentMs = 0;
    const perType = new Map();
    const itemResults = [];
    for (const it of items) {
      const dto = dtoMap.get(it.questionId);
      spentMs += it.timeSpentMs;
      if (!dto) { blank += 1; itemResults.push({ it, dto: null, ok: null }); continue; }
      const answered = !!it.selectedLabel;
      const ok = answered && it.selectedLabel === dto.correctLabel;
      if (!answered) blank += 1; else if (ok) correct += 1; else wrong += 1;
      const t = perType.get(dto.questionType.id) || { s: 0, n: 0 };
      t.s += trialValue({ correct: ok, blank: !answered, difficulty: dto.difficulty }); t.n += 1; perType.set(dto.questionType.id, t);
      itemResults.push({ it, dto, ok, answered });
    }
    const score = scoreFromCounts({ correct, wrong }, bp.scoring);
    for (const r of itemResults) {
      if (!r.dto) continue;
      const att = await recordAttempt(tx, ctx, {
        session: { id: sitting.sessionId }, item: r.it, dto: r.dto, selectedLabel: r.answered ? r.it.selectedLabel : null, tryNo: 1, timeMs: r.it.timeSpentMs, hintsRevealed: 0,
        clientRef: null, countsForMastery: !!r.answered, correct: r.ok, metadata: { mockExam: sitting.code },
      });
      if (r.answered) {
        const mast = await updateMastery(tx, ctx, { questionTypeId: r.dto.questionType.id, skills: r.dto.skills, difficulty: r.dto.difficulty, correct: r.ok, hinted: false });
        await qq('UPDATE learning.attempt SET attempt_metadata = attempt_metadata || $2::jsonb WHERE attempt_id=$1', [att.id, JSON.stringify({ skillDeltas: mast.skillDeltas, typeDelta: mast.typeDelta })]);
        if (!r.ok) await upsertMistake(tx, ctx, { itemId: r.it.itemId, questionTypeId: r.dto.questionType.id, attemptId: att.id, suggestedType: suggestMistakeType({ dto: r.dto, timeMs: r.it.timeSpentMs, selectedBlank: false }) });
      }
    }
    await qq(
      `UPDATE learning.study_session_item i SET study_session_item_status = CASE WHEN t.ans THEN 'answered' ELSE 'skipped' END, study_session_item_is_correct = t.ok, study_session_item_answered_at = CASE WHEN t.ans THEN COALESCE(i.study_session_item_answered_at,$2) END
         FROM unnest($1::bigint[], $3::boolean[], $4::boolean[]) AS t(id, ans, ok) WHERE i.study_session_item_id = t.id`,
      [itemResults.map((r) => r.it.id), ctx.now, itemResults.map((r) => !!r.answered), itemResults.map((r) => (r.answered ? !!r.ok : null))]);
    await recomputeSessionCounters(tx, sitting.sessionId, { finalize: true });
    const { rows: prev } = await qq(
      `SELECT max(x.exam_sitting_score)::float8 AS best FROM learning.exam_sitting x JOIN learning.study_session s ON s.study_session_id=x.exam_sitting_study_session_id
        JOIN content.exam_form f ON f.exam_form_id=x.exam_sitting_exam_form_id
       WHERE s.study_session_user_account_id=$1 AND x.exam_sitting_submitted_at IS NOT NULL AND f.exam_form_form_type=$2 AND x.exam_sitting_id <> $3`, [ctx.userId, sitting.formType, sitting.id]);
    const best = prev[0]?.best;
    const isPb = best === null || best === undefined || score > best;
    await qq(
      `UPDATE learning.exam_sitting SET exam_sitting_submitted_at=$2, exam_sitting_submit_reason=$3, exam_sitting_score=$4, exam_sitting_correct_count=$5, exam_sitting_wrong_count=$6, exam_sitting_blank_count=$7,
              exam_sitting_is_personal_best=$8, exam_sitting_paused_at=NULL, exam_sitting_remaining_seconds_at_pause=NULL WHERE exam_sitting_id=$1`,
      [sitting.id, ctx.now, reason, score, correct, wrong, blank, isPb]);
    await qq("UPDATE learning.study_session SET study_session_status='completed', study_session_ended_at=$2, study_session_last_activity_at=$2, study_session_score=$3, study_session_active_seconds=$4 WHERE study_session_id=$1",
      [sitting.sessionId, ctx.now, score, Math.round(spentMs / 1000)]);
    if (sitting.formType !== 'question_type_drill' && sitting.enrollmentId) {
      const { rows: en } = await qq('SELECT enrollment_track_id AS t FROM learning.enrollment WHERE enrollment_id=$1', [sitting.enrollmentId]);
      const catalog = await getTrackCatalog({ trackId: Number(en[0].t) });
      if (catalog?.blueprint) {
        const est = estimateScore({ sections: sectionsOf(catalog), perType, scoring: { method: catalog.blueprint.scoringMethod, params: catalog.blueprint.scoringParams || {} }, questionCount: catalog.blueprint.questionCount });
        await saveScoreEstimate(tx, ctx, { enrollmentId: sitting.enrollmentId, source: 'mock_exam', sourceSessionId: sitting.sessionId, est });
      }
    }
    await touchActivity(tx, ctx, { activeSeconds: 0, questionsAnswered: correct + wrong, correctAnswers: correct });
    await completeTodayTaskOfKind(tx, ctx, 'mock_exam');
    await regenActive(tx, ctx, 'mock_exam');
    return { correct, wrong, blank, score, isPersonalBest: isPb };
  };

  /** Süre dolduysa otomatik teslim; teslim edildiyse true. */
  const expireIfNeeded = async (ctx, code) => {
    return withTransaction(async (tx) => {
      const s = await loadSitting(tx.query.bind(tx), ctx, code, { lock: true });
      if (s.submittedAt) return { submitted: true, sitting: s };
      if (!s.pausedAt && new Date(s.deadlineAt).getTime() + GRACE_MS < ctx.now.getTime()) {
        await submitTx(tx, ctx, s, 'timeout');
        return { submitted: true, timedOut: true, sitting: s };
      }
      return { submitted: false, sitting: s };
    });
  };

  const requireOpen = async (ctx, code) => {
    const r = await expireIfNeeded(ctx, code);
    if (r.timedOut) throw new DomainError('EXAM_TIME_UP', 'Time is up; your exam was submitted', { sittingCode: r.sitting.code }, 409);
    if (r.submitted) throw new DomainError('EXAM_ALREADY_SUBMITTED', 'This exam was already submitted', { sittingCode: r.sitting.code }, 409);
    return r.sitting;
  };

  // ── Merkez ──
  const overview = ({ caller }) => withCtx(deps, caller, async (ctx) => {
    const enr = await requireEnrollment(q, ctx.userId);
    const catalog = await catalogOf(enr);
    const tier = await tierOf(ctx.userId);
    const { rows: forms } = await q(
      `SELECT ${FORM_SEL} ${FORM_FROM} AND EXISTS (SELECT 1 FROM content.item_exam ie WHERE ie.item_exam_item_id=i.item_id AND ie.item_exam_exam_id = ANY($1))
        ORDER BY CASE f.exam_form_form_type WHEN 'full' THEN 0 WHEN 'mini' THEN 1 ELSE 2 END, f.exam_form_is_recommended DESC, i.item_code`, [catalog.poolExamIds]);
    const { rows: st } = await q(
      `SELECT x.exam_sitting_exam_form_item_id AS "itemId", count(*) FILTER (WHERE x.exam_sitting_submitted_at IS NOT NULL)::int AS taken, max(x.exam_sitting_score) FILTER (WHERE x.exam_sitting_submitted_at IS NOT NULL)::float8 AS best,
              (array_agg(x.exam_sitting_score ORDER BY x.exam_sitting_submitted_at DESC) FILTER (WHERE x.exam_sitting_submitted_at IS NOT NULL))[1]::float8 AS last,
              max(x.exam_sitting_code) FILTER (WHERE x.exam_sitting_submitted_at IS NULL) AS active
         FROM learning.exam_sitting x JOIN learning.study_session s ON s.study_session_id=x.exam_sitting_study_session_id WHERE s.study_session_user_account_id=$1 GROUP BY 1`, [ctx.userId]);
    const by = new Map(st.map((r) => [Number(r.itemId), r]));
    const usage = {};
    for (const [k, f] of Object.entries(QUOTA_FEATURE)) { const u = await peekUsage({ userId: ctx.userId, feature: f, tz: ctx.tz, now: ctx.now }); usage[k] = { enabled: u.enabled, limit: u.limit, used: u.used, remaining: u.remaining, period: u.period }; }
    const est = await latestEstimate(q, ctx.userId, enr.id);
    const { rows: hist } = await q(
      `SELECT x.exam_sitting_code AS code, x.exam_sitting_score::float8 AS score, x.exam_sitting_submitted_at AS at, f.exam_form_form_type AS "formType", f.exam_form_title AS title, x.exam_sitting_is_personal_best AS pb
         FROM learning.exam_sitting x JOIN learning.study_session s ON s.study_session_id=x.exam_sitting_study_session_id JOIN content.exam_form f ON f.exam_form_id=x.exam_sitting_exam_form_id
        WHERE s.study_session_user_account_id=$1 AND x.exam_sitting_submitted_at IS NOT NULL ORDER BY x.exam_sitting_submitted_at DESC LIMIT 10`, [ctx.userId]);
    return {
      forms: forms.map((f) => {
        const h = by.get(Number(f.itemId));
        const locked = f.tier === 'premium' && tier !== 'premium';
        const qf = QUOTA_FEATURE[f.formType];
        return {
          code: Number(f.code), title: f.title, formType: f.formType, questionCount: f.questionCount, durationSeconds: f.durationSeconds, isRecommended: f.recommended, accessTier: f.tier,
          locked: locked || (qf ? usage[f.formType]?.enabled === false : false), taken: h?.taken || 0, bestScore: h?.best ?? null, lastScore: h?.last ?? null, activeSittingCode: h?.active ? Number(h.active) : null,
          quotaFeature: qf || null,
        };
      }),
      usage, estimate: estimateView(est, catalog, enr.targetScore), scoreMax: catalog.blueprint.scoreMax,
      history: hist.map((r) => ({ code: Number(r.code), title: r.title, formType: r.formType, score: r.score, submittedAt: iso(r.at), isPersonalBest: r.pb })),
    };
  });

  const formDetail = ({ caller, code }) => withCtx(deps, caller, async (ctx) => {
    const enr = await requireEnrollment(q, ctx.userId);
    const catalog = await catalogOf(enr);
    const f = await loadForm(q, code, catalog.poolExamIds);
    const tier = await tierOf(ctx.userId);
    const { rows: secs } = await q(
      `SELECT t.question_type_key AS key, t.question_type_name AS name, count(*)::int AS n, min(fq.exam_form_question_position) AS first, max(fq.exam_form_question_position) AS last
         FROM content.exam_form_question fq JOIN content.item qi ON qi.item_id=fq.exam_form_question_question_item_id JOIN content.question qn ON qn.question_item_revision_id=qi.item_published_revision_id
         JOIN content.question_type t ON t.question_type_id=qn.question_question_type_id WHERE fq.exam_form_question_exam_form_id=$1 GROUP BY 1,2 ORDER BY min(fq.exam_form_question_position)`, [f.formId]);
    const { rows: ls } = await q('SELECT learner_setting_extra_time_percent AS extra, learner_setting_default_mock_mode AS mode FROM learning.learner_setting WHERE learner_setting_user_account_id=$1', [ctx.userId]);
    const extra = ls[0]?.extra || 0;
    const feature = QUOTA_FEATURE[f.formType];
    const usage = feature ? await peekUsage({ userId: ctx.userId, feature, tz: ctx.tz, now: ctx.now }) : null;
    const { rows: act } = await q(
      `SELECT x.exam_sitting_code AS code FROM learning.exam_sitting x JOIN learning.study_session s ON s.study_session_id=x.exam_sitting_study_session_id
        WHERE s.study_session_user_account_id=$1 AND x.exam_sitting_exam_form_item_id=$2 AND x.exam_sitting_submitted_at IS NULL LIMIT 1`, [ctx.userId, f.itemId]);
    const bp = await loadBlueprint(q, f.blueprintId);
    return {
      code: f.code, title: f.title, formType: f.formType, questionCount: f.questionCount, durationSeconds: f.durationSeconds, accessTier: f.tier, locked: f.tier === 'premium' && tier !== 'premium',
      extraTimePercent: extra, effectiveDurationSeconds: Math.ceil(f.durationSeconds * (1 + extra / 100)), defaultMode: ls[0]?.mode || 'standard', modes: MODES,
      sections: secs.map((s) => ({ typeKey: s.key, name: s.name, questionCount: s.n, firstQuestionNo: s.first, lastQuestionNo: s.last })),
      scoring: { method: bp.scoring.method, params: bp.scoring.params, scoreMax: bp.scoreMax },
      rules: { canPause: true, canChangeAnswers: true, blankPenalty: false, wrongPenalty: (bp.scoring.params?.wrongPenalty || 0) > 0 },
      quota: usage ? { feature, enabled: usage.enabled, limit: usage.limit, used: usage.used, remaining: usage.remaining, period: usage.period } : null,
      activeSittingCode: act[0] ? Number(act[0].code) : null,
    };
  });

  // ── Başlatma ──
  const start = ({ caller, formCode, mode }) => withCtx(deps, caller, async (ctx) => {
    const enr = await requireEnrollment(q, ctx.userId);
    const catalog = await catalogOf(enr);
    const f = await loadForm(q, formCode, catalog.poolExamIds);
    const tier = await tierOf(ctx.userId);
    if (f.tier === 'premium' && tier !== 'premium') throw new DomainError('EXAM_FORM_LOCKED', 'This exam is part of Premium', { formCode: f.code }, 402);
    const { rows: act } = await q(
      `SELECT x.exam_sitting_code AS code, x.exam_sitting_exam_form_item_id AS "itemId" FROM learning.exam_sitting x JOIN learning.study_session s ON s.study_session_id=x.exam_sitting_study_session_id
        WHERE s.study_session_user_account_id=$1 AND x.exam_sitting_submitted_at IS NULL LIMIT 1`, [ctx.userId]);
    if (act[0]) {
      if (Number(act[0].itemId) !== f.itemId) throw new DomainError('EXAM_SITTING_ACTIVE', 'You have another exam in progress', { sittingCode: Number(act[0].code) }, 409);
      const r = await expireIfNeeded(ctx, Number(act[0].code));
      if (!r.submitted) return { resumed: true, sitting: await stateView(q, ctx, await loadSitting(q, ctx, Number(act[0].code))) };
    }
    const { rows: fq } = await q(
      `SELECT fq.exam_form_question_position AS pos, fq.exam_form_question_question_item_id AS "itemId", qn.question_id AS "questionId"
         FROM content.exam_form_question fq JOIN content.item qi ON qi.item_id=fq.exam_form_question_question_item_id AND qi.item_status='published'
         JOIN content.question qn ON qn.question_item_revision_id=qi.item_published_revision_id WHERE fq.exam_form_question_exam_form_id=$1 ORDER BY fq.exam_form_question_position`, [f.formId]);
    if (fq.length !== f.questionCount) throw new DomainError('EXAM_FORM_UNAVAILABLE', 'This exam is not ready yet', undefined, 503);
    const md = mode || (await q('SELECT learner_setting_default_mock_mode AS m FROM learning.learner_setting WHERE learner_setting_user_account_id=$1', [ctx.userId])).rows[0]?.m || 'standard';
    if (!MODES.includes(md)) throw new DomainError('VALIDATION_ERROR', `mode must be one of ${MODES.join(', ')}`, { field: 'mode' }, 400);
    const { rows: ls } = await q('SELECT learner_setting_extra_time_percent AS extra FROM learning.learner_setting WHERE learner_setting_user_account_id=$1', [ctx.userId]);
    const extra = ls[0]?.extra || 0;
    const limit = Math.ceil(f.durationSeconds * (1 + extra / 100));
    const feature = QUOTA_FEATURE[f.formType];
    let quotaTaken = false;
    try {
      if (feature) { await consumeQuota({ userId: ctx.userId, feature, n: 1, tz: ctx.tz, now: ctx.now }); quotaTaken = true; }
      const deadline = new Date(ctx.now.getTime() + limit * 1000);
      const sittingCode = await withTransaction(async (tx) => {
        const { rows: s } = await tx.query(
          `INSERT INTO learning.study_session (study_session_tenant_code, study_session_organization_id, study_session_user_account_id, study_session_enrollment_id, study_session_kind, study_session_status,
              study_session_mode, study_session_config, study_session_started_at, study_session_last_activity_at, study_session_planned_item_count)
           VALUES ($1,$2,$3,$4,'mock_exam','in_progress',$5,$6,$7,$7,$8) RETURNING study_session_id AS id`,
          [ctx.tenantCode, ctx.orgId, ctx.userId, enr.id, md, JSON.stringify({ formCode: f.code, formType: f.formType, timeLimitSeconds: limit, deadlineAt: deadline.toISOString() }), ctx.now, fq.length]);
        const sid = Number(s[0].id);
        await tx.query(
          `INSERT INTO learning.study_session_item (study_session_item_tenant_code, study_session_item_organization_id, study_session_item_study_session_id, study_session_item_position,
              study_session_item_item_id, study_session_item_question_id) SELECT $1,$2,$3,p,i,qq FROM unnest($4::int[], $5::bigint[], $6::bigint[]) AS t(p,i,qq)`,
          [ctx.tenantCode, ctx.orgId, sid, fq.map((r) => r.pos), fq.map((r) => Number(r.itemId)), fq.map((r) => Number(r.questionId))]);
        const { rows: x } = await tx.query(
          `INSERT INTO learning.exam_sitting (exam_sitting_tenant_code, exam_sitting_organization_id, exam_sitting_study_session_id, exam_sitting_exam_form_item_id, exam_sitting_exam_form_id, exam_sitting_blueprint_id,
              exam_sitting_time_limit_seconds, exam_sitting_extra_time_percent, exam_sitting_deadline_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING exam_sitting_code AS code`,
          [ctx.tenantCode, ctx.orgId, sid, f.itemId, f.formId, f.blueprintId, limit, extra, deadline]);
        return Number(x[0].code);
      });
      return { resumed: false, sitting: await stateView(q, ctx, await loadSitting(q, ctx, sittingCode)) };
    } catch (e) {
      if (quotaTaken) await refundQuota({ userId: ctx.userId, feature, n: 1, tz: ctx.tz, now: ctx.now }).catch(() => {});
      throw e;
    }
  });

  // ── Sınav ekranı ──
  const getSitting = ({ caller, code }) => withCtx(deps, caller, async (ctx) => {
    await expireIfNeeded(ctx, codeParam(code));
    return stateView(q, ctx, await loadSitting(q, ctx, codeParam(code)));
  });

  const questions = ({ caller, code, from, to }) => withCtx(deps, caller, async (ctx) => {
    const c = codeParam(code);
    const r = await expireIfNeeded(ctx, c);
    const s = await loadSitting(q, ctx, c);
    if (r.submitted && !s.submittedAt) throw new DomainError('EXAM_ALREADY_SUBMITTED', 'This exam was already submitted', undefined, 409);
    if (s.pausedAt) throw new DomainError('EXAM_PAUSED', 'The exam is paused', undefined, 409);
    const items = await loadItems(q, s.sessionId);
    const a = clamp(Number(from) || 1, 1, items.length);
    const b = clamp(Number(to) || a + 9, a, Math.min(items.length, a + 39));
    const dtoMap = await getQuestionDtosForPairs(items.map((i) => ({ itemId: i.itemId, questionId: i.questionId })));
    const passages = new Map();
    const out = items.filter((i) => i.position >= a && i.position <= b).map((i) => {
      const d = dtoMap.get(i.questionId);
      if (d?.passage) passages.set(d.passage.itemCode, { itemCode: d.passage.itemCode, kind: d.passage.kind, title: d.passage.title, body: d.passage.body, bodyFormat: d.passage.bodyFormat, terms: d.passage.terms });
      return {
        position: i.position, itemCode: d?.itemCode || null, type: d ? { key: d.questionType.key, name: d.questionType.name, format: d.questionType.format } : null, readingQuestionKind: d?.readingQuestionKind || null,
        stem: d?.stem || null, stemFormat: d?.stemFormat || null, blankNo: d?.blankNo ?? null, passageItemCode: d?.passage?.itemCode || null, options: (d?.options || []).map((o) => ({ label: o.label, text: o.text })),
        selectedLabel: i.selectedLabel, isFlagged: i.isFlagged, eliminatedLabels: i.eliminatedLabels, timeSpentMs: i.timeSpentMs,
      };
    });
    if (items.find((i) => i.position === a)?.status === 'pending') await q("UPDATE learning.study_session_item SET study_session_item_status='seen', study_session_item_first_seen_at=COALESCE(study_session_item_first_seen_at,$2) WHERE study_session_item_study_session_id=$1 AND study_session_item_position BETWEEN $3 AND $4 AND study_session_item_status='pending'", [s.sessionId, ctx.now, a, b]);
    return { from: a, to: b, total: items.length, items: out, passages: [...passages.values()], serverNow: iso(ctx.now), remainingSeconds: remainingSeconds(s, ctx.now) };
  });

  const putAnswer = ({ caller, code, position, selectedLabel, timeMs, flagged, eliminatedLabels }) => withCtx(deps, caller, async (ctx) => {
    const c = codeParam(code);
    const pos = intParam(position, { name: 'position' });
    const s = await requireOpen(ctx, c);
    if (s.pausedAt) throw new DomainError('EXAM_PAUSED', 'The exam is paused', undefined, 409);
    const items = await loadItems(q, s.sessionId);
    const item = items.find((i) => i.position === pos);
    if (!item) throw new DomainError('SESSION_ITEM_NOT_FOUND', 'Item not found', undefined, 404);
    const dtoMap = await getQuestionDtosForPairs([{ itemId: item.itemId, questionId: item.questionId }]);
    const dto = dtoMap.get(item.questionId);
    const label = selectedLabel === undefined ? undefined : (selectedLabel || null);
    if (label && !dto.options.some((o) => o.label === label)) throw new DomainError('ANSWER_OPTION_INVALID', 'Unknown option', { field: 'selectedLabel' }, 400);
    const elim = Array.isArray(eliminatedLabels) ? [...new Set(eliminatedLabels.filter((l) => dto.options.some((o) => o.label === l)))] : null;
    const t = clamp(Math.round(Number(timeMs) || 0), 0, 3_600_000);
    await withTransaction(async (tx) => {
      await tx.query(
        `UPDATE learning.study_session_item SET study_session_item_selected_label = CASE WHEN $3::boolean THEN $4 ELSE study_session_item_selected_label END,
                study_session_item_status = CASE WHEN ($3::boolean AND $4 IS NOT NULL) OR (NOT $3::boolean AND study_session_item_selected_label IS NOT NULL) THEN 'answered' WHEN study_session_item_status='pending' THEN 'seen' ELSE study_session_item_status END,
                study_session_item_is_flagged = COALESCE($5, study_session_item_is_flagged), study_session_item_eliminated_labels = COALESCE($6, study_session_item_eliminated_labels),
                study_session_item_time_spent_ms = study_session_item_time_spent_ms + $7, study_session_item_first_seen_at = COALESCE(study_session_item_first_seen_at,$8)
          WHERE study_session_item_id=$1 AND study_session_item_study_session_id=$2`,
        [item.id, s.sessionId, label !== undefined, label ?? null, flagged === undefined ? null : !!flagged, elim, t, ctx.now]);
      await tx.query('UPDATE learning.exam_sitting SET exam_sitting_current_position=$2 WHERE exam_sitting_id=$1', [s.id, pos]);
      await tx.query('UPDATE learning.study_session SET study_session_last_activity_at=$2 WHERE study_session_id=$1', [s.sessionId, ctx.now]);
    });
    const after = await loadItems(q, s.sessionId);
    return { position: pos, selectedLabel: after.find((i) => i.position === pos).selectedLabel, isFlagged: after.find((i) => i.position === pos).isFlagged, answeredCount: after.filter((i) => i.selectedLabel).length, remainingSeconds: remainingSeconds(s, ctx.now), serverNow: iso(ctx.now) };
  });

  const pause = ({ caller, code }) => withCtx(deps, caller, async (ctx) => {
    const s = await requireOpen(ctx, codeParam(code));
    if (s.pausedAt) return stateView(q, ctx, s);
    const rem = remainingSeconds(s, ctx.now);
    await withTransaction(async (tx) => {
      await tx.query('UPDATE learning.exam_sitting SET exam_sitting_paused_at=$2, exam_sitting_remaining_seconds_at_pause=$3 WHERE exam_sitting_id=$1', [s.id, ctx.now, rem]);
      await tx.query("UPDATE learning.study_session SET study_session_status='paused', study_session_last_activity_at=$2 WHERE study_session_id=$1", [s.sessionId, ctx.now]);
    });
    return stateView(q, ctx, await loadSitting(q, ctx, s.code));
  });

  const resume = ({ caller, code }) => withCtx(deps, caller, async (ctx) => {
    const c = codeParam(code);
    const s = await loadSitting(q, ctx, c);
    if (s.submittedAt) throw new DomainError('EXAM_ALREADY_SUBMITTED', 'This exam was already submitted', undefined, 409);
    if (!s.pausedAt) return stateView(q, ctx, s);
    const deadline = new Date(ctx.now.getTime() + (s.remainingAtPause ?? 0) * 1000);
    await withTransaction(async (tx) => {
      await tx.query(
        'UPDATE learning.exam_sitting SET exam_sitting_deadline_at=$2, exam_sitting_paused_total_seconds=exam_sitting_paused_total_seconds+$3, exam_sitting_paused_at=NULL, exam_sitting_remaining_seconds_at_pause=NULL WHERE exam_sitting_id=$1',
        [s.id, deadline, Math.max(0, Math.round((ctx.now - new Date(s.pausedAt)) / 1000))]);
      await tx.query("UPDATE learning.study_session SET study_session_status='in_progress', study_session_last_activity_at=$2, study_session_config = study_session_config || $3::jsonb WHERE study_session_id=$1", [s.sessionId, ctx.now, JSON.stringify({ deadlineAt: deadline.toISOString() })]);
    });
    return stateView(q, ctx, await loadSitting(q, ctx, c));
  });

  const submit = ({ caller, code }) => withCtx(deps, caller, async (ctx) => {
    const c = codeParam(code);
    const res = await withTransaction(async (tx) => {
      const s = await loadSitting(tx.query.bind(tx), ctx, c, { lock: true });
      if (s.submittedAt) return { already: true };
      const late = !s.pausedAt && new Date(s.deadlineAt).getTime() + GRACE_MS < ctx.now.getTime();
      const out = await submitTx(tx, ctx, s, late ? 'timeout' : 'user');
      return { already: false, timedOut: late, ...out };
    });
    return { already: res.already, timedOut: !!res.timedOut, result: await resultOf(ctx, c) };
  });

  // ── Sonuç, analiz, inceleme ──
  const resultOf = async (ctx, code) => {
    const s = await loadSitting(q, ctx, code);
    if (!s.submittedAt) throw new DomainError('EXAM_NOT_SUBMITTED', 'The exam is not submitted yet', undefined, 409);
    const bp = await loadBlueprint(q, s.blueprintId);
    const items = await loadItems(q, s.sessionId);
    const dtoMap = await getQuestionDtosForPairs(items.map((i) => ({ itemId: i.itemId, questionId: i.questionId })));
    const types = new Map();
    for (const it of items) {
      const d = dtoMap.get(it.questionId);
      if (!d) continue;
      const t = types.get(d.questionType.key) || { key: d.questionType.key, name: d.questionType.name, total: 0, correct: 0, wrong: 0, blank: 0, timeMs: 0 };
      t.total += 1; t.timeMs += it.timeSpentMs;
      if (!it.selectedLabel) t.blank += 1; else if (it.selectedLabel === d.correctLabel) t.correct += 1; else t.wrong += 1;
      types.set(d.questionType.key, t);
    }
    const enr = s.enrollmentId ? await requireEnrollment(q, ctx.userId) : null;
    const { rows: est } = await q("SELECT score_estimate_score_low::float8 AS low, score_estimate_score_high::float8 AS high, score_estimate_score_point::float8 AS point, score_estimate_confidence::float8 AS conf FROM learning.score_estimate WHERE score_estimate_source_session_id=$1 AND score_estimate_source='mock_exam' LIMIT 1", [s.sessionId]);
    const { rows: prev } = await q(
      `SELECT x.exam_sitting_score::float8 AS score FROM learning.exam_sitting x JOIN learning.study_session ss ON ss.study_session_id=x.exam_sitting_study_session_id
        WHERE ss.study_session_user_account_id=$1 AND x.exam_sitting_exam_form_id IN (SELECT exam_form_id FROM content.exam_form WHERE exam_form_form_type=$2) AND x.exam_sitting_submitted_at IS NOT NULL AND x.exam_sitting_id <> $3
        ORDER BY x.exam_sitting_submitted_at DESC LIMIT 1`, [ctx.userId, s.formType, s.id]);
    const ent = await getEntitlements(ctx.userId);
    const usedSec = Math.round(items.reduce((a, i) => a + i.timeSpentMs, 0) / 1000);
    return {
      code: s.code, formCode: s.formCode, title: s.title, formType: s.formType, mode: s.mode, submittedAt: iso(s.submittedAt), submitReason: s.submitReason,
      score: s.score, scoreMax: bp.scoreMax, correct: s.correct, wrong: s.wrong, blank: s.blank, total: s.correct + s.wrong + s.blank, accuracy: s.correct + s.wrong ? round1((s.correct / (s.correct + s.wrong)) * 100) : null,
      isPersonalBest: s.isPersonalBest, previousScore: prev[0]?.score ?? null, deltaFromPrevious: prev[0] ? Math.round((s.score - prev[0].score) * 100) / 100 : null,
      time: { limitSeconds: s.limitSeconds, usedSeconds: usedSec, pausedSeconds: s.pausedTotal },
      target: enr ? { score: enr.targetScore, requiredCorrect: requiredCorrect(enr.targetScore, bp.scoring, bp.questionCount), gapPoints: Math.max(0, Math.round((enr.targetScore - s.score) * 10) / 10) } : null,
      estimate: est[0] ? { low: est[0].low, high: est[0].high, point: est[0].point, confidence: est[0].conf } : null,
      types: [...types.values()].map((t) => ({ ...t, accuracy: t.correct + t.wrong ? round1((t.correct / (t.correct + t.wrong)) * 100) : null, avgSeconds: t.total ? Math.round(t.timeMs / 1000 / t.total) : 0, timeMs: undefined })),
      analysisLocked: !(ent.features?.detailed_analysis?.enabled), maxPossibleScore: maxScore(bp.questionCount, bp.scoring),
    };
  };

  const result = ({ caller, code }) => withCtx(deps, caller, async (ctx) => {
    await expireIfNeeded(ctx, codeParam(code));
    return resultOf(ctx, codeParam(code));
  });

  const analysis = ({ caller, code }) => withCtx(deps, caller, async (ctx) => {
    const c = codeParam(code);
    const ent = await getEntitlements(ctx.userId);
    if (!ent.features?.detailed_analysis?.enabled) throw new DomainError('FEATURE_LOCKED', 'Detailed analysis is part of Premium', { feature: 'detailed_analysis' }, 402);
    const base = await resultOf(ctx, c);
    const s = await loadSitting(q, ctx, c);
    const items = await loadItems(q, s.sessionId);
    const dtoMap = await getQuestionDtosForPairs(items.map((i) => ({ itemId: i.itemId, questionId: i.questionId })));
    const skills = new Map();
    let rushedWrong = 0; let slowRight = 0;
    for (const it of items) {
      const d = dtoMap.get(it.questionId);
      if (!d) continue;
      const ok = it.selectedLabel && it.selectedLabel === d.correctLabel;
      const est = (d.estimatedSeconds || 60) * 1000;
      if (it.selectedLabel && !ok && it.timeSpentMs < est * 0.35) rushedWrong += 1;
      if (ok && it.timeSpentMs > est * 1.8) slowRight += 1;
      for (const sk of d.skills) {
        const e = skills.get(sk.key) || { key: sk.key, total: 0, correct: 0, wrong: 0, blank: 0 };
        e.total += 1; if (!it.selectedLabel) e.blank += 1; else if (ok) e.correct += 1; else e.wrong += 1;
        skills.set(sk.key, e);
      }
    }
    const weakTypes = [...base.types].filter((t) => t.total >= 3 && t.accuracy !== null).sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);
    const potential = weakTypes.length ? weakTypes.reduce((sum, t) => sum + Math.max(0, Math.round((t.total * 0.7) - t.correct)), 0) : 0;
    return {
      ...base,
      skills: [...skills.values()].map((e) => ({ ...e, accuracy: e.correct + e.wrong ? round1((e.correct / (e.correct + e.wrong)) * 100) : null })).sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101)),
      habits: { rushedWrongCount: rushedWrong, slowCorrectCount: slowRight, blankRate: base.total ? round1((base.blank / base.total) * 100) : 0 },
      focus: weakTypes.map((t) => ({ typeKey: t.key, name: t.name, accuracy: t.accuracy, addToPlan: { method: 'POST', path: '/v1/plan/adjust', body: { focus: { questionTypeKey: t.key } } } })),
      potentialExtraCorrect: potential,
    };
  });

  const review = ({ caller, code, filter }) => withCtx(deps, caller, async (ctx) => {
    const c = codeParam(code);
    const s = await loadSitting(q, ctx, c);
    if (!s.submittedAt) throw new DomainError('EXAM_NOT_SUBMITTED', 'The exam is not submitted yet', undefined, 409);
    const f = filter || 'all';
    if (!['all', 'wrong', 'blank', 'correct', 'flagged'].includes(f)) throw new DomainError('VALIDATION_ERROR', 'filter must be all|wrong|blank|correct|flagged', { field: 'filter' }, 400);
    const items = await loadItems(q, s.sessionId);
    const dtoMap = await getQuestionDtosForPairs(items.map((i) => ({ itemId: i.itemId, questionId: i.questionId })));
    const rows = items.map((i) => {
      const d = dtoMap.get(i.questionId);
      const result = !i.selectedLabel ? 'blank' : i.selectedLabel === d?.correctLabel ? 'correct' : 'wrong';
      return { position: i.position, itemCode: d?.itemCode || null, type: d ? { key: d.questionType.key, name: d.questionType.name } : null, result, selectedLabel: i.selectedLabel, correctLabel: d?.correctLabel || null, isFlagged: i.isFlagged, timeMs: i.timeSpentMs, stemPreview: preview(d?.stem, 100) };
    }).filter((r) => (f === 'all' ? true : f === 'flagged' ? r.isFlagged : r.result === f));
    return { code: s.code, filter: f, total: items.length, items: rows };
  });

  const reviewItem = ({ caller, code, position }) => withCtx(deps, caller, async (ctx) => {
    const c = codeParam(code);
    const pos = intParam(position, { name: 'position' });
    const s = await loadSitting(q, ctx, c);
    if (!s.submittedAt) throw new DomainError('EXAM_NOT_SUBMITTED', 'The exam is not submitted yet', undefined, 409);
    const items = await loadItems(q, s.sessionId);
    const item = items.find((i) => i.position === pos);
    if (!item) throw new DomainError('SESSION_ITEM_NOT_FOUND', 'Item not found', undefined, 404);
    const dtoMap = await getQuestionDtosForPairs(items.map((i) => ({ itemId: i.itemId, questionId: i.questionId })));
    const dto = dtoMap.get(item.questionId);
    const session = { code: s.sessionCode, kind: 'mock_exam', mode: s.mode, status: 'completed' };
    const view = buildItemView({ session, item, dto, policy: { feedback: 'deferred', maxTries: 1, hints: false }, items, dtoMap });
    view.sessionCode = s.code;
    return { ...view, review: { result: !item.selectedLabel ? 'blank' : item.selectedLabel === dto.correctLabel ? 'correct' : 'wrong', selectedLabel: item.selectedLabel, correctLabel: dto.correctLabel, timeMs: item.timeSpentMs }, solution: solutionBlock(dto), hints: dto.hints.filter((h) => h.kind !== 'solution').map((h) => ({ stepNo: h.stepNo, kind: h.kind, body: h.body })) };
  });

  /** Cron: süresi dolmuş açık denemeleri teslim et. */
  const autoSubmitExpired = async () => {
    const { rows } = await q(
      `SELECT s.study_session_user_account_id AS uid, x.exam_sitting_code AS code FROM learning.exam_sitting x JOIN learning.study_session s ON s.study_session_id=x.exam_sitting_study_session_id
        WHERE x.exam_sitting_submitted_at IS NULL AND x.exam_sitting_paused_at IS NULL AND x.exam_sitting_deadline_at < now() - interval '10 seconds' LIMIT 50`);
    let changed = 0;
    for (const r of rows) {
      try {
        const ctx = await loadCtxForUser(deps, Number(r.uid));
        const out = await expireIfNeeded(ctx, Number(r.code));
        await flushAfter(ctx);
        if (out.timedOut) changed += 1;
      } catch (e) { console.error('[learning] auto-submit failed', r.code, e?.message); }
    }
    return { changed };
  };

  return Object.freeze({ overview, formDetail, start, getSitting, questions, putAnswer, pause, resume, submit, result, analysis, review, reviewItem, autoSubmitExpired });
};

registerTaskStarter('mock_exam', async (deps, ctx, task, catalog) => {
  const want = task.params?.formType === 'full' ? ['full', 'mini'] : ['mini', 'full'];
  const tier = await tierOf(ctx.userId);
  const { rows } = await deps.rawQuery(
    `SELECT i.item_code AS code, f.exam_form_form_type AS "formType", f.exam_form_title AS title, i.item_access_tier AS tier,
            (SELECT count(*) FROM learning.exam_sitting x WHERE x.exam_sitting_exam_form_item_id=i.item_id AND EXISTS (SELECT 1 FROM learning.study_session s WHERE s.study_session_id=x.exam_sitting_study_session_id AND s.study_session_user_account_id=$1)) AS taken
       FROM content.item i JOIN content.exam_form f ON f.exam_form_item_revision_id=i.item_published_revision_id
      WHERE i.item_kind='exam_form' AND i.item_status='published' AND f.exam_form_form_type = ANY($2) AND EXISTS (SELECT 1 FROM content.item_exam ie WHERE ie.item_exam_item_id=i.item_id AND ie.item_exam_exam_id = ANY($3))
      ORDER BY taken, array_position($2::varchar[], f.exam_form_form_type::varchar), i.item_code`, [ctx.userId, want, catalog.poolExamIds]);
  const pick = rows.find((r) => r.tier === 'free' || tier === 'premium') || rows[0];
  if (!pick) throw new DomainError('EXAM_FORM_UNAVAILABLE', 'There is no exam available yet', undefined, 404);
  return { exam: { formCode: Number(pick.code), formType: pick.formType, title: pick.title, locked: pick.tier === 'premium' && tier !== 'premium' } };
});
