import { addDays, daysBetween, isoWeekday } from 'app-shared';
import { writeDayGoal, writeStreakCache, invalidateToday } from './cache.js';

export const MAX_FREEZES = 3;
export const MILESTONES = [7, 30, 100];

const ACT_COLS = `activity_day_id AS id, activity_day_activity_date::text AS date, activity_day_active_seconds AS "activeSeconds", activity_day_questions_answered AS "questionsAnswered",
  activity_day_correct_answers AS "correctAnswers", activity_day_cards_reviewed AS "cardsReviewed", activity_day_new_cards AS "newCards", activity_day_notes_read AS "notesRead",
  activity_day_goal_minutes AS "goalMinutes", activity_day_goal_met AS "goalMet", activity_day_freeze_used AS "freezeUsed"`;
export const STREAK_COLS = `streak_id AS id, streak_current_length AS current, streak_longest_length AS longest, streak_current_started_on::text AS "startedOn",
  streak_last_active_date::text AS "lastActiveDate", streak_last_freeze_granted_on::text AS "lastFreezeGrantedOn", streak_freezes_available AS freezes,
  streak_last_milestone_celebrated AS "lastMilestone"`;

export const goalMinutesFor = async (q, ctx, date) => {
  const { rows } = await q('SELECT weekly_availability_minutes AS m FROM learning.weekly_availability WHERE weekly_availability_user_account_id=$1 AND weekly_availability_weekday=$2', [ctx.userId, isoWeekday(date)]);
  return rows[0] ? rows[0].m : null;
};

export const ensureStreakRow = async (q, ctx) => {
  await q(
    `INSERT INTO learning.streak (streak_tenant_code, streak_organization_id, streak_user_account_id) VALUES ($1,$2,$3) ON CONFLICT (streak_user_account_id) DO NOTHING`, [ctx.tenantCode, ctx.orgId, ctx.userId]);
  const { rows } = await q(`SELECT ${STREAK_COLS} FROM learning.streak WHERE streak_user_account_id=$1 FOR UPDATE`, [ctx.userId]);
  return rows[0];
};

/** Okuma tarafı: streak satırından, o günün gerçeğine göre "görünen" seri. Yazmaz. */
export const effectiveStreak = (s, today) => {
  const base = { current: s?.current || 0, longest: s?.longest || 0, lastActiveDate: s?.lastActiveDate || null, freezes: s?.freezes || 0, startedOn: s?.startedOn || null };
  if (!s?.lastActiveDate || !base.current) return { ...base, current: 0, activeToday: false, atRisk: false };
  const gap = daysBetween(s.lastActiveDate, today) - 1; // son aktif günden sonraki, bugünden önceki kaçırılan gün sayısı
  const activeToday = s.lastActiveDate === today;
  if (gap <= 0) return { ...base, activeToday, atRisk: !activeToday };
  if ((s.freezes || 0) >= gap) return { ...base, activeToday: false, atRisk: true, willUseFreezes: gap };
  return { ...base, current: 0, activeToday: false, atRisk: false, broken: true };
};

/**
 * Kaçırılan günleri kapat (HOME-01 açılışı): dondurma hakkı yetiyorsa otomatik kullanılır ve
 * `freeze_used` günleri işlenir; yetmiyorsa seri sıfırlanır. Idempotent (koşullu).
 * @returns {{ gap:number, freezeUsed:number, broken:boolean, previousLength:number }}
 */
export const settleMissedDays = async (tx, ctx) => {
  const s = await ensureStreakRow(tx.query.bind(tx), ctx);
  const res = { gap: 0, freezeUsed: 0, broken: false, previousLength: s.current };
  if (!s.lastActiveDate || !s.current) return res;
  const gap = daysBetween(s.lastActiveDate, ctx.today) - 1;
  if (gap <= 0) return res;
  res.gap = gap;
  if (s.freezes >= gap) {
    for (let i = 1; i <= gap; i += 1) {
      const d = addDays(s.lastActiveDate, i);
      await tx.query(
        `INSERT INTO learning.activity_day (activity_day_tenant_code, activity_day_organization_id, activity_day_user_account_id, activity_day_activity_date, activity_day_freeze_used)
         VALUES ($1,$2,$3,$4,true) ON CONFLICT (activity_day_user_account_id, activity_day_activity_date) DO UPDATE SET activity_day_freeze_used = true`, [ctx.tenantCode, ctx.orgId, ctx.userId, d]);
    }
    const last = addDays(ctx.today, -1);
    await tx.query('UPDATE learning.streak SET streak_freezes_available = streak_freezes_available - $2, streak_last_active_date = $3 WHERE streak_user_account_id=$1', [ctx.userId, gap, last]);
    res.freezeUsed = gap;
    ctx.after.push(() => writeStreakCache(ctx.userId, { current: s.current, longest: s.longest, lastActiveDate: last, freezes: s.freezes - gap }));
  } else {
    await tx.query('UPDATE learning.streak SET streak_current_length = 0, streak_current_started_on = NULL WHERE streak_user_account_id=$1', [ctx.userId]);
    res.broken = true;
    ctx.after.push(() => writeStreakCache(ctx.userId, { current: 0, longest: s.longest, lastActiveDate: s.lastActiveDate, freezes: s.freezes }));
  }
  ctx.after.push(() => invalidateToday(ctx.userId, ctx.today));
  return res;
};

/** Bugünü "atla": mümkünse bir dondurma hakkı kullanır (seri korunur). */
export const useFreezeForToday = async (tx, ctx) => {
  const s = await ensureStreakRow(tx.query.bind(tx), ctx);
  const canFreeze = s.freezes > 0 && s.current > 0;
  if (canFreeze) {
    await tx.query('UPDATE learning.streak SET streak_freezes_available = streak_freezes_available - 1, streak_last_active_date = $2 WHERE streak_user_account_id=$1', [ctx.userId, ctx.today]);
    await tx.query(
      `INSERT INTO learning.activity_day (activity_day_tenant_code, activity_day_organization_id, activity_day_user_account_id, activity_day_activity_date, activity_day_freeze_used)
       VALUES ($1,$2,$3,$4,true) ON CONFLICT (activity_day_user_account_id, activity_day_activity_date) DO UPDATE SET activity_day_freeze_used = true`, [ctx.tenantCode, ctx.orgId, ctx.userId, ctx.today]);
    ctx.after.push(() => writeStreakCache(ctx.userId, { current: s.current, longest: s.longest, lastActiveDate: ctx.today, freezes: s.freezes - 1 }));
  }
  return { freezeUsed: canFreeze, streakAtRisk: !canFreeze && s.current > 0, freezesLeft: Math.max(0, s.freezes - (canFreeze ? 1 : 0)) };
};

/**
 * Etkinlik yaz: activity_day (kullanıcının yerel günü) + seri. Redis 14/15/16 commit sonrası güncellenir.
 * @param {object} tx          transaction (tx.query)
 * @param {object} ctx         loadCtx çıktısı
 * @param {object} delta       { activeSeconds, questionsAnswered, correctAnswers, cardsReviewed, newCards, notesRead }
 * @returns {{ activityDay, streak, milestone:number|null, freezeGranted:boolean, goalJustMet:boolean }}
 */
export const touchActivity = async (tx, ctx, delta = {}) => {
  const d = { activeSeconds: 0, questionsAnswered: 0, correctAnswers: 0, cardsReviewed: 0, newCards: 0, notesRead: 0, ...delta };
  const date = ctx.today;
  const q = tx.query.bind(tx);
  const goalMinutes = await goalMinutesFor(q, ctx, date);
  const { rows: before } = await q('SELECT activity_day_goal_met AS "goalMet" FROM learning.activity_day WHERE activity_day_user_account_id=$1 AND activity_day_activity_date=$2', [ctx.userId, date]);
  await q(
    `INSERT INTO learning.activity_day (activity_day_tenant_code, activity_day_organization_id, activity_day_user_account_id, activity_day_activity_date,
        activity_day_active_seconds, activity_day_questions_answered, activity_day_correct_answers, activity_day_cards_reviewed, activity_day_new_cards, activity_day_notes_read, activity_day_goal_minutes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (activity_day_user_account_id, activity_day_activity_date) DO UPDATE SET
        activity_day_active_seconds = learning.activity_day.activity_day_active_seconds + EXCLUDED.activity_day_active_seconds,
        activity_day_questions_answered = learning.activity_day.activity_day_questions_answered + EXCLUDED.activity_day_questions_answered,
        activity_day_correct_answers = learning.activity_day.activity_day_correct_answers + EXCLUDED.activity_day_correct_answers,
        activity_day_cards_reviewed = learning.activity_day.activity_day_cards_reviewed + EXCLUDED.activity_day_cards_reviewed,
        activity_day_new_cards = learning.activity_day.activity_day_new_cards + EXCLUDED.activity_day_new_cards,
        activity_day_notes_read = learning.activity_day.activity_day_notes_read + EXCLUDED.activity_day_notes_read,
        activity_day_goal_minutes = COALESCE(learning.activity_day.activity_day_goal_minutes, EXCLUDED.activity_day_goal_minutes)`,
    [ctx.tenantCode, ctx.orgId, ctx.userId, date, d.activeSeconds, d.questionsAnswered, d.correctAnswers, d.cardsReviewed, d.newCards, d.notesRead, goalMinutes]);
  await q(
    `UPDATE learning.activity_day SET activity_day_goal_met = true
      WHERE activity_day_user_account_id=$1 AND activity_day_activity_date=$2 AND NOT activity_day_goal_met
        AND activity_day_goal_minutes IS NOT NULL AND activity_day_goal_minutes > 0 AND activity_day_active_seconds >= activity_day_goal_minutes * 60`, [ctx.userId, date]);
  const { rows } = await q(`SELECT ${ACT_COLS} FROM learning.activity_day WHERE activity_day_user_account_id=$1 AND activity_day_activity_date=$2`, [ctx.userId, date]);
  const day = rows[0];
  const goalJustMet = !!day.goalMet && !before[0]?.goalMet;

  // ── Seri ──
  const eligible = day.questionsAnswered > 0 || day.cardsReviewed > 0 || day.notesRead > 0 || day.activeSeconds >= 180;
  const s = await ensureStreakRow(q, ctx);
  let { current, longest, lastActiveDate, freezes, startedOn, lastFreezeGrantedOn, lastMilestone } = s;
  let milestone = null;
  let freezeGranted = false;
  if (eligible && lastActiveDate !== date) {
    const gap = lastActiveDate ? daysBetween(lastActiveDate, date) - 1 : 0;
    if (!lastActiveDate || !current) {
      current = 1; startedOn = date;
    } else if (gap <= 0) {
      current += 1;
    } else if (freezes >= gap) { // /today açılmadan gelen kaçırılmış günler: dondurma otomatik
      for (let i = 1; i <= gap; i += 1) {
        await q(
          `INSERT INTO learning.activity_day (activity_day_tenant_code, activity_day_organization_id, activity_day_user_account_id, activity_day_activity_date, activity_day_freeze_used)
           VALUES ($1,$2,$3,$4,true) ON CONFLICT (activity_day_user_account_id, activity_day_activity_date) DO UPDATE SET activity_day_freeze_used = true`, [ctx.tenantCode, ctx.orgId, ctx.userId, addDays(lastActiveDate, i)]);
      }
      freezes -= gap; current += 1;
    } else {
      current = 1; startedOn = date;
    }
    lastActiveDate = date;
    longest = Math.max(longest, current);
    if (current > 0 && current % 7 === 0 && freezes < MAX_FREEZES) { freezes += 1; lastFreezeGrantedOn = date; freezeGranted = true; }
    const hit = [...MILESTONES].reverse().find((m) => current >= m && lastMilestone < m);
    if (hit) { milestone = hit; lastMilestone = hit; }
    await q(
      `UPDATE learning.streak SET streak_current_length=$2, streak_longest_length=$3, streak_current_started_on=$4, streak_last_active_date=$5,
              streak_freezes_available=$6, streak_last_freeze_granted_on=$7, streak_last_milestone_celebrated=$8 WHERE streak_user_account_id=$1`,
      [ctx.userId, current, longest, startedOn, lastActiveDate, freezes, lastFreezeGrantedOn, lastMilestone]);
  }
  const streak = { current, longest, lastActiveDate, freezes, startedOn, activeToday: lastActiveDate === date };
  ctx.after.push(async () => {
    await writeDayGoal(ctx.userId, date, day);
    await writeStreakCache(ctx.userId, streak);
    await invalidateToday(ctx.userId, date);
  });
  return { activityDay: day, streak, milestone, freezeGranted, goalJustMet };
};
