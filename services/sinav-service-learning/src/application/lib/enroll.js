import { DomainError, getTrackCatalog, daysBetween, addDays } from 'app-shared';

export const DEFAULT_HORIZON_DAYS = 84; // sınav tarihi yokken 12 hafta

const SEL = `
  e.enrollment_id AS id, e.enrollment_code AS code, e.enrollment_track_id AS "trackId", e.enrollment_status AS status, e.enrollment_target_score::float8 AS "targetScore",
  e.enrollment_date_mode AS "dateMode", e.enrollment_exam_session_id AS "examSessionId", e.enrollment_custom_exam_date::text AS "customExamDate", e.enrollment_started_at AS "startedAt",
  e.enrollment_is_active AS "isActive",
  t.exam_track_key AS "trackKey",
  s.exam_session_code AS "sessionCode", s.exam_session_key AS "sessionKey", s.exam_session_name AS "sessionName", s.exam_session_exam_date::text AS "sessionDate", s.exam_session_status AS "sessionStatus",
  s.exam_session_is_estimated AS "sessionEstimated"`;
const FROM = `FROM learning.enrollment e JOIN content.exam_track t ON t.exam_track_id = e.enrollment_track_id LEFT JOIN content.exam_session s ON s.exam_session_id = e.enrollment_exam_session_id`;

export const loadActiveEnrollment = async (q, userId) => {
  const { rows } = await q(`SELECT ${SEL} ${FROM} WHERE e.enrollment_user_account_id=$1 AND e.enrollment_is_active`, [userId]);
  return rows[0] ? { ...rows[0], id: Number(rows[0].id), code: Number(rows[0].code), trackId: Number(rows[0].trackId) } : null;
};

export const loadEnrollmentByCode = async (q, userId, code) => {
  const { rows } = await q(`SELECT ${SEL} ${FROM} WHERE e.enrollment_user_account_id=$1 AND e.enrollment_code=$2`, [userId, code]);
  return rows[0] ? { ...rows[0], id: Number(rows[0].id), code: Number(rows[0].code), trackId: Number(rows[0].trackId) } : null;
};

/** Etkin kayıt zorunlu. */
export const requireEnrollment = async (q, userId) => {
  const e = await loadActiveEnrollment(q, userId);
  if (!e) throw new DomainError('ENROLLMENT_REQUIRED', 'Select an exam first', undefined, 409);
  return e;
};

export const examDateOf = (enr) => (enr.dateMode === 'session' ? enr.sessionDate : enr.dateMode === 'custom' ? enr.customExamDate : null);
export const daysToExam = (enr, today) => { const d = examDateOf(enr); return d ? daysBetween(today, d) : null; };

export const catalogOf = async (enr) => {
  const c = await getTrackCatalog({ trackId: enr.trackId });
  if (!c) throw new DomainError('TRACK_NOT_FOUND', 'Exam track not found', undefined, 404);
  if (!c.blueprint) throw new DomainError('BLUEPRINT_UNAVAILABLE', 'Exam blueprint is not available', undefined, 503);
  return c;
};

/** İstemciye giden kayıt gövdesi (hedef için gereken doğru dahil değil; çağıran ekler). */
export const enrollmentView = (enr, catalog, today, goalReasons = []) => ({
  code: enr.code,
  status: enr.status,
  track: { code: catalog.track.code, key: catalog.track.key, name: catalog.track.name, contentLanguage: catalog.track.contentLanguage, status: catalog.track.status, notice: catalog.track.notice, deliveryMode: catalog.track.deliveryMode },
  exam: { key: catalog.exam.key, name: catalog.exam.name, shortName: catalog.exam.shortName },
  targetScore: enr.targetScore,
  scoreMax: catalog.blueprint.scoreMax,
  questionCount: catalog.blueprint.questionCount,
  dateMode: enr.dateMode,
  examSession: enr.dateMode === 'session' ? { code: Number(enr.sessionCode), key: enr.sessionKey, name: enr.sessionName, examDate: enr.sessionDate, status: enr.sessionStatus, isEstimated: enr.sessionEstimated } : null,
  customExamDate: enr.customExamDate,
  examDate: examDateOf(enr),
  daysToExam: daysToExam(enr, today),
  goalReasons,
  startedAt: new Date(enr.startedAt).toISOString(),
});

export const loadGoalReasons = async (q, enrollmentId) => {
  const { rows } = await q(
    `SELECT g.goal_reason_key AS key, g.goal_reason_label AS label FROM learning.enrollment_reason r JOIN content.goal_reason g ON g.goal_reason_id = r.enrollment_reason_goal_reason_id
      WHERE r.enrollment_reason_enrollment_id=$1 ORDER BY g.goal_reason_sort_order`, [enrollmentId]);
  return rows;
};

export const loadAvailability = async (q, userId) => {
  const { rows } = await q('SELECT weekly_availability_weekday AS weekday, weekly_availability_minutes AS minutes FROM learning.weekly_availability WHERE weekly_availability_user_account_id=$1 ORDER BY weekly_availability_weekday', [userId]);
  return rows;
};

export const horizonEnd = (enr, from) => {
  const d = examDateOf(enr);
  const cap = addDays(from, DEFAULT_HORIZON_DAYS - 1);
  if (!d) return cap;
  return d < cap ? (d < from ? from : d) : cap;
};

export const diagnosticStatusOf = async (q, userId, enrollmentId) => {
  const { rows: s } = await q(
    `SELECT study_session_code AS code, study_session_status AS status FROM learning.study_session WHERE study_session_user_account_id=$1 AND study_session_kind='diagnostic' AND study_session_enrollment_id=$2
      ORDER BY study_session_id DESC LIMIT 1`, [userId, enrollmentId]);
  const { rows: l } = await q('SELECT learner_setting_diagnostic_skipped_at AS "skippedAt", learner_setting_onboarding_completed_at AS "onboardedAt" FROM learning.learner_setting WHERE learner_setting_user_account_id=$1', [userId]);
  const sess = s[0];
  let status = 'not_started';
  if (sess?.status === 'completed') status = 'completed';
  else if (sess && ['in_progress', 'paused'].includes(sess.status)) status = sess.status;
  else if (l[0]?.skippedAt) status = 'skipped';
  return { status, sessionCode: sess ? Number(sess.code) : null, skippedAt: l[0]?.skippedAt || null, onboardedAt: l[0]?.onboardedAt || null };
};
