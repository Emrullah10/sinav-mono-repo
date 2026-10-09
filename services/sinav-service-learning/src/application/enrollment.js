import { DomainError, withTransaction, getTrackCatalog, requiredCorrect, addDays } from 'app-shared';
import { withCtx } from './lib/ctx.js';
import {
  loadActiveEnrollment, loadEnrollmentByCode, requireEnrollment, enrollmentView, loadGoalReasons, loadAvailability, catalogOf, diagnosticStatusOf,
} from './lib/enroll.js';
import { ensureStreakRow } from './lib/activity.js';
import { defaultLevelEstimate, saveScoreEstimate } from './lib/estimate.js';
import { scoringOf } from './lib/estimate.js';
import { regeneratePlan } from './lib/plan-engine.js';
import { regenActive } from './lib/plan-io.js';
import { tierOf } from './lib/session-io.js';
import { codeParam } from './lib/util.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MODES = ['learning', 'quick', 'timed', 'standard', 'relaxed'];

const fullView = async (q, ctx, enr) => {
  const catalog = await catalogOf(enr);
  const reasons = await loadGoalReasons(q, enr.id);
  const view = enrollmentView(enr, catalog, ctx.today, reasons);
  const avail = await loadAvailability(q, ctx.userId);
  const diag = await diagnosticStatusOf(q, ctx.userId, enr.id);
  return {
    ...view,
    requiredCorrect: requiredCorrect(enr.targetScore, scoringOf(catalog), catalog.blueprint.questionCount),
    availability: avail,
    diagnostic: { status: diag.status, sessionCode: diag.sessionCode },
    onboardingCompletedAt: diag.onboardedAt ? new Date(diag.onboardedAt).toISOString() : null,
  };
};

const resolveSession = async (q, catalog, { examSessionKey, examSessionCode }, today) => {
  const byCode = examSessionCode !== undefined && examSessionCode !== null && examSessionCode !== '';
  const { rows } = await q(
    `SELECT exam_session_id AS id, exam_session_exam_date::text AS date FROM content.exam_session
      WHERE exam_session_exam_id=$1 AND ${byCode ? 'exam_session_code=$2' : 'exam_session_key=$2'}`, [catalog.exam.id, byCode ? codeParam(examSessionCode, 'examSessionCode') : String(examSessionKey)]);
  if (!rows[0]) throw new DomainError('ENROLLMENT_SESSION_NOT_FOUND', 'Exam session not found', { field: 'examSessionKey' }, 404);
  if (rows[0].date < today) throw new DomainError('ENROLLMENT_DATE_INVALID', 'This exam session has already been held', { field: 'examSessionKey' }, 400);
  return Number(rows[0].id);
};

const validateDate = (d, today) => {
  if (typeof d !== 'string' || !DATE_RE.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) throw new DomainError('ENROLLMENT_DATE_INVALID', 'customExamDate must be YYYY-MM-DD', { field: 'customExamDate' }, 400);
  if (d < today || d > addDays(today, 730)) throw new DomainError('ENROLLMENT_DATE_INVALID', 'Exam date must be within the next two years', { field: 'customExamDate' }, 400);
  return d;
};

const validateTarget = (v, catalog) => {
  const n = Number(v);
  const max = catalog.blueprint.scoreMax;
  if (!Number.isFinite(n) || n < 0 || n > max) throw new DomainError('ENROLLMENT_TARGET_INVALID', `targetScore must be between 0 and ${max}`, { field: 'targetScore', max }, 400);
  return Math.round(n * 100) / 100;
};

const setReasons = async (tx, ctx, catalog, enrollmentId, keys) => {
  const list = [...new Set((keys || []).map(String))];
  const ids = [];
  for (const k of list) {
    const g = catalog.goalReasons.find((x) => x.key === k);
    if (!g) throw new DomainError('ENROLLMENT_REASON_UNKNOWN', `Unknown goal reason: ${k}`, { field: 'goalReasonKeys', value: k }, 400);
    ids.push(g.id);
  }
  await tx.query('DELETE FROM learning.enrollment_reason WHERE enrollment_reason_enrollment_id=$1', [enrollmentId]);
  if (ids.length) {
    await tx.query(
      `INSERT INTO learning.enrollment_reason (enrollment_reason_tenant_code, enrollment_reason_organization_id, enrollment_reason_user_account_id, enrollment_reason_enrollment_id, enrollment_reason_goal_reason_id)
       SELECT $1,$2,$3,$4,x FROM unnest($5::bigint[]) AS t(x)`, [ctx.tenantCode, ctx.orgId, ctx.userId, enrollmentId, ids]);
  }
};

const ensureSetting = (tx, ctx) => tx.query(
  `INSERT INTO learning.learner_setting (learner_setting_tenant_code, learner_setting_organization_id, learner_setting_user_account_id) VALUES ($1,$2,$3)
   ON CONFLICT (learner_setting_user_account_id) DO NOTHING`, [ctx.tenantCode, ctx.orgId, ctx.userId]);

export default (deps) => {
  const q = deps.rawQuery;

  const create = ({ caller, trackKey, targetScore, dateMode, examSessionKey, examSessionCode, customExamDate, goalReasonKeys }) => withCtx(deps, caller, async (ctx) => {
    if (!trackKey) throw new DomainError('VALIDATION_ERROR', 'trackKey is required', { field: 'trackKey' }, 400);
    const catalog = await getTrackCatalog({ trackKey: String(trackKey) });
    if (!catalog) throw new DomainError('TRACK_NOT_FOUND', 'Exam track not found', { field: 'trackKey' }, 404);
    if (!catalog.blueprint) throw new DomainError('BLUEPRINT_UNAVAILABLE', 'Exam blueprint is not available', undefined, 503);
    const preset = catalog.goalPresets.find((g) => g.isDefault) || catalog.goalPresets[0];
    const target = validateTarget(targetScore ?? preset?.targetScore ?? catalog.blueprint.scoreMax * 0.7, catalog);
    const mode = dateMode || (examSessionKey || examSessionCode ? 'session' : customExamDate ? 'custom' : 'unknown');
    if (!['session', 'custom', 'unknown'].includes(mode)) throw new DomainError('ENROLLMENT_DATE_INVALID', 'dateMode must be session|custom|unknown', { field: 'dateMode' }, 400);
    const sessionId = mode === 'session' ? await resolveSession(q, catalog, { examSessionKey, examSessionCode }, ctx.today) : null;
    const custom = mode === 'custom' ? validateDate(customExamDate, ctx.today) : null;
    const tier = await tierOf(ctx.userId);
    const code = await withTransaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(7002, $1::int)', [ctx.userId]);
      await tx.query("UPDATE learning.enrollment SET enrollment_is_active=false, enrollment_status='archived' WHERE enrollment_user_account_id=$1 AND enrollment_is_active", [ctx.userId]);
      const { rows } = await tx.query(
        `INSERT INTO learning.enrollment (enrollment_tenant_code, enrollment_organization_id, enrollment_user_account_id, enrollment_track_id, enrollment_status, enrollment_is_active,
            enrollment_target_score, enrollment_date_mode, enrollment_exam_session_id, enrollment_custom_exam_date, enrollment_started_at)
         VALUES ($1,$2,$3,$4,'active',true,$5,$6,$7,$8,$9) RETURNING enrollment_id AS id, enrollment_code AS code`,
        [ctx.tenantCode, ctx.orgId, ctx.userId, catalog.track.id, target, mode, sessionId, custom, ctx.now]);
      const id = Number(rows[0].id);
      await setReasons(tx, ctx, catalog, id, goalReasonKeys);
      await ensureSetting(tx, ctx);
      await ensureStreakRow(tx.query.bind(tx), ctx);
      const enr = await loadActiveEnrollment(tx.query.bind(tx), ctx.userId);
      const est = defaultLevelEstimate(catalog);
      await saveScoreEstimate(tx, ctx, { enrollmentId: id, source: 'default_level', est });
      await regeneratePlan(tx, ctx, { enrollment: enr, catalog, reason: 'initial', tier });
      return Number(rows[0].code);
    });
    const enr = await loadEnrollmentByCode(q, ctx.userId, code);
    return { enrollment: await fullView(q, ctx, enr) };
  });

  const getActive = ({ caller }) => withCtx(deps, caller, async (ctx) => {
    const enr = await loadActiveEnrollment(q, ctx.userId);
    return { enrollment: enr ? await fullView(q, ctx, enr) : null };
  });

  const patch = ({ caller, code, targetScore, dateMode, examSessionKey, examSessionCode, customExamDate, goalReasonKeys }) => withCtx(deps, caller, async (ctx) => {
    const c = codeParam(code);
    const enr = await loadEnrollmentByCode(q, ctx.userId, c);
    if (!enr) throw new DomainError('ENROLLMENT_NOT_FOUND', 'Enrollment not found', undefined, 404);
    if (!enr.isActive) throw new DomainError('ENROLLMENT_NOT_ACTIVE', 'Enrollment is not active', undefined, 409);
    const catalog = await catalogOf(enr);
    const sets = [];
    const params = [enr.id];
    const add = (col, v) => { params.push(v); sets.push(`${col}=$${params.length}`); };
    let reason = null;
    if (targetScore !== undefined) { add('enrollment_target_score', validateTarget(targetScore, catalog)); reason = 'target_change'; }
    if (dateMode !== undefined || examSessionKey !== undefined || examSessionCode !== undefined || customExamDate !== undefined) {
      const mode = dateMode || (examSessionKey !== undefined || examSessionCode !== undefined ? 'session' : customExamDate !== undefined ? 'custom' : enr.dateMode);
      if (!['session', 'custom', 'unknown'].includes(mode)) throw new DomainError('ENROLLMENT_DATE_INVALID', 'dateMode must be session|custom|unknown', { field: 'dateMode' }, 400);
      add('enrollment_date_mode', mode);
      add('enrollment_exam_session_id', mode === 'session' ? await resolveSession(q, catalog, { examSessionKey, examSessionCode }, ctx.today) : null);
      add('enrollment_custom_exam_date', mode === 'custom' ? validateDate(customExamDate, ctx.today) : null);
      reason = 'exam_date_change';
    }
    if (!sets.length && goalReasonKeys === undefined) throw new DomainError('ENROLLMENT_UPDATE_EMPTY', 'Nothing to update', undefined, 400);
    await withTransaction(async (tx) => {
      if (sets.length) await tx.query(`UPDATE learning.enrollment SET ${sets.join(', ')} WHERE enrollment_id=$1`, params);
      if (goalReasonKeys !== undefined) await setReasons(tx, ctx, catalog, enr.id, goalReasonKeys);
      if (reason) await regenActive(tx, ctx, reason);
    });
    return { enrollment: await fullView(q, ctx, await loadEnrollmentByCode(q, ctx.userId, c)) };
  });

  const getAvailability = ({ caller }) => withCtx(deps, caller, async (ctx) => ({ days: await loadAvailability(q, ctx.userId) }));

  const putAvailability = ({ caller, days }) => withCtx(deps, caller, async (ctx) => {
    if (!Array.isArray(days) || !days.length) throw new DomainError('AVAILABILITY_INVALID', 'days must be a non-empty array', { field: 'days' }, 400);
    const seen = new Set();
    for (const d of days) {
      const wd = Number(d?.weekday);
      const mn = Number(d?.minutes);
      if (!Number.isInteger(wd) || wd < 1 || wd > 7) throw new DomainError('AVAILABILITY_INVALID', 'weekday must be 1..7', { field: 'weekday' }, 400);
      if (!Number.isInteger(mn) || mn < 0 || mn > 240) throw new DomainError('AVAILABILITY_INVALID', 'minutes must be 0..240', { field: 'minutes' }, 400);
      if (seen.has(wd)) throw new DomainError('AVAILABILITY_INVALID', 'Duplicate weekday', { field: 'weekday' }, 400);
      seen.add(wd);
    }
    await withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO learning.weekly_availability (weekly_availability_tenant_code, weekly_availability_organization_id, weekly_availability_user_account_id, weekly_availability_weekday, weekly_availability_minutes)
         SELECT $1,$2,$3,w,m FROM unnest($4::int[], $5::int[]) AS t(w,m)
         ON CONFLICT (weekly_availability_user_account_id, weekly_availability_weekday) DO UPDATE SET weekly_availability_minutes = EXCLUDED.weekly_availability_minutes`,
        [ctx.tenantCode, ctx.orgId, ctx.userId, days.map((d) => Number(d.weekday)), days.map((d) => Number(d.minutes))]);
      await regenActive(tx, ctx, 'availability_change');
    });
    return { days: await loadAvailability(q, ctx.userId) };
  });

  const settingView = (r) => ({
    defaultMockMode: r?.mode || 'standard', extraTimePercent: r?.extra ?? 0,
    diagnosticSkippedAt: r?.skipped ? new Date(r.skipped).toISOString() : null, onboardingCompletedAt: r?.done ? new Date(r.done).toISOString() : null,
  });
  const readSetting = async (userId) => {
    const { rows } = await q('SELECT learner_setting_default_mock_mode AS mode, learner_setting_extra_time_percent AS extra, learner_setting_diagnostic_skipped_at AS skipped, learner_setting_onboarding_completed_at AS done FROM learning.learner_setting WHERE learner_setting_user_account_id=$1', [userId]);
    return settingView(rows[0]);
  };

  const getSettings = ({ caller }) => withCtx(deps, caller, async (ctx) => readSetting(ctx.userId));

  const patchSettings = ({ caller, defaultMockMode, extraTimePercent }) => withCtx(deps, caller, async (ctx) => {
    if (defaultMockMode !== undefined && !MODES.includes(defaultMockMode)) throw new DomainError('VALIDATION_ERROR', `defaultMockMode must be one of ${MODES.join(', ')}`, { field: 'defaultMockMode' }, 400);
    if (extraTimePercent !== undefined && ![0, 25, 50].includes(Number(extraTimePercent))) throw new DomainError('VALIDATION_ERROR', 'extraTimePercent must be 0, 25 or 50', { field: 'extraTimePercent' }, 400);
    if (defaultMockMode === undefined && extraTimePercent === undefined) throw new DomainError('VALIDATION_ERROR', 'Nothing to update', undefined, 400);
    await withTransaction(async (tx) => {
      await ensureSetting(tx, ctx);
      await tx.query(
        `UPDATE learning.learner_setting SET learner_setting_default_mock_mode=COALESCE($2, learner_setting_default_mock_mode), learner_setting_extra_time_percent=COALESCE($3, learner_setting_extra_time_percent)
          WHERE learner_setting_user_account_id=$1`, [ctx.userId, defaultMockMode ?? null, extraTimePercent === undefined ? null : Number(extraTimePercent)]);
    });
    return readSetting(ctx.userId);
  });

  const requireActive = ({ caller }) => withCtx(deps, caller, (ctx) => requireEnrollment(q, ctx.userId));

  return Object.freeze({ create, getActive, patch, getAvailability, putAvailability, getSettings, patchSettings, requireActive });
};
