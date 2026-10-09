import { DomainError, withTransaction, peekUsage, addDays, registerUsageSeed } from 'app-shared';
import { withCtx } from './lib/ctx.js';
import { requireEnrollment, catalogOf, loadActiveEnrollment } from './lib/enroll.js';
import { loadMasteryMap, loadChange7d, levelOf } from './lib/mastery.js';
import { latestEstimate, estimateView } from './lib/estimate.js';
import { effectiveStreak, touchActivity, STREAK_COLS } from './lib/activity.js';
import { completeTodayTaskOfKind } from './lib/plan-tasks.js';
import { intParam } from './lib/util.js';
import { rawQuery } from 'app-shared';

// Kota tohumu: bugün (dönem) kota tüketen cevaplanmış maddeler — Redis sayacı kaybolursa Postgres'ten kurulur.
registerUsageSeed('questions_per_day', async ({ userId, from, to }) => {
  const { rows } = await rawQuery(
    `SELECT count(*)::int AS n FROM learning.study_session_item i JOIN learning.study_session s ON s.study_session_id=i.study_session_item_study_session_id
      WHERE s.study_session_user_account_id=$1 AND i.study_session_item_metadata->>'quota'='true' AND COALESCE(i.study_session_item_answered_at, i.study_session_item_first_seen_at) >= $2 AND COALESCE(i.study_session_item_answered_at, i.study_session_item_first_seen_at) < $3`,
    [userId, from, to]);
  return rows[0].n;
});

const FEATURES = ['questions_per_day', 'flashcard_reviews_per_day', 'translation_evals_per_day', 'tutor_messages_per_day', 'mini_exams_per_month', 'full_exams_per_month'];

export default (deps) => {
  const q = deps.rawQuery;

  const overview = ({ caller, range }) => withCtx(deps, caller, async (ctx) => {
    const days = [7, 30, 90].includes(Number(range)) ? Number(range) : 30;
    const enr = await requireEnrollment(q, ctx.userId);
    const catalog = await catalogOf(enr);
    const est = await latestEstimate(q, ctx.userId, enr.id);
    const { rows: hist } = await q(
      `SELECT score_estimate_score_low::float8 AS low, score_estimate_score_high::float8 AS high, score_estimate_score_point::float8 AS point, score_estimate_source AS source, score_estimate_computed_at AS at
         FROM learning.score_estimate WHERE score_estimate_user_account_id=$1 AND score_estimate_enrollment_id=$2 AND score_estimate_computed_at >= $3 ORDER BY score_estimate_computed_at`,
      [ctx.userId, enr.id, new Date(ctx.now.getTime() - days * 86400000)]);
    const from = addDays(ctx.today, -(days - 1));
    const { rows: act } = await q(
      `SELECT activity_day_activity_date::text AS date, activity_day_active_seconds AS seconds, activity_day_questions_answered AS answered, activity_day_correct_answers AS correct,
              activity_day_cards_reviewed AS cards, activity_day_goal_met AS "goalMet"
         FROM learning.activity_day WHERE activity_day_user_account_id=$1 AND activity_day_activity_date BETWEEN $2 AND $3 ORDER BY activity_day_activity_date`, [ctx.userId, from, ctx.today]);
    const tm = await loadMasteryMap(q, ctx.userId, 'type');
    const ch = await loadChange7d(q, ctx.userId, 'type', ctx.today, tm);
    const { rows: st } = await q(`SELECT ${STREAK_COLS} FROM learning.streak WHERE streak_user_account_id=$1`, [ctx.userId]);
    const totals = act.reduce((s, r) => ({ seconds: s.seconds + r.seconds, answered: s.answered + r.answered, correct: s.correct + r.correct, cards: s.cards + r.cards, activeDays: s.activeDays + (r.answered || r.cards || r.seconds >= 180 ? 1 : 0) }), { seconds: 0, answered: 0, correct: 0, cards: 0, activeDays: 0 });
    return {
      rangeDays: days, estimate: estimateView(est, catalog, enr.targetScore), target: enr.targetScore,
      estimateHistory: hist.map((h) => ({ low: h.low, high: h.high, point: h.point, source: h.source, at: new Date(h.at).toISOString() })),
      totals: { activeMinutes: Math.round(totals.seconds / 60), questionsAnswered: totals.answered, accuracy: totals.answered ? Math.round((totals.correct / totals.answered) * 1000) / 10 : null, cardsReviewed: totals.cards, activeDays: totals.activeDays },
      days: act.map((r) => ({ date: r.date, activeMinutes: Math.round(r.seconds / 60), questionsAnswered: r.answered, correctAnswers: r.correct, cardsReviewed: r.cards, goalMet: r.goalMet })),
      types: catalog.sections.map((s) => {
        const t = catalog.questionTypes.find((x) => x.id === s.questionTypeId);
        const m = tm.get(t.id);
        return { key: t.key, name: t.name, shortName: t.shortName, iconKey: t.iconKey, mastery: m ? Math.round(m.mastery * 10) / 10 : 0, evidence: m?.evidence || 0, level: levelOf(m?.mastery || 0, m?.evidence || 0), change7d: ch.get(t.id) ?? null };
      }),
      streak: effectiveStreak(st[0], ctx.today),
    };
  });

  const usageToday = ({ caller }) => withCtx(deps, caller, async (ctx) => {
    const list = {};
    for (const f of FEATURES) {
      const u = await peekUsage({ userId: ctx.userId, feature: f, tz: ctx.tz, now: ctx.now });
      list[f] = { enabled: u.enabled, limit: u.limit, period: u.period, used: u.used, remaining: u.remaining };
    }
    const { rows } = await q(
      `SELECT count(*)::int AS answered, count(*) FILTER (WHERE attempt_is_correct)::int AS correct FROM learning.attempt WHERE attempt_user_account_id=$1 AND attempt_try_no=1 AND attempt_answered_at >= $2`,
      [ctx.userId, new Date(`${ctx.today}T00:00:00Z`)]);
    return { date: ctx.today, features: list, today: { answered: rows[0].answered, correct: rows[0].correct } };
  });

  /** Servisler arası: tutor çeviri değerlendirmesi vb. etkinlik bildirir. */
  const internalActivity = ({ userId, userAccountId, kind, seconds, minutes }) => {
    const uid = intParam(userId ?? userAccountId, { min: 1, name: 'userId' });
    const secs = seconds !== undefined ? Number(seconds) : Number(minutes || 0) * 60;
    return withCtx(deps, { callerUserId: uid }, async (ctx) => {
      if (!['translation', 'tutor'].includes(kind)) throw new DomainError('VALIDATION_ERROR', 'kind must be translation|tutor', { field: 'kind' }, 400);
      return withTransaction(async (tx) => {
        const act = await touchActivity(tx, ctx, { activeSeconds: Math.min(1800, Math.max(0, Math.round(secs || 0))), questionsAnswered: 0 });
        const done = kind === 'translation' ? await completeTodayTaskOfKind(tx, ctx, 'translation') : false;
        return { streakCurrent: act.streak.current, planTaskCompleted: !!done };
      });
    });
  };

  void loadActiveEnrollment;
  return Object.freeze({ overview, usageToday, internalActivity });
};
