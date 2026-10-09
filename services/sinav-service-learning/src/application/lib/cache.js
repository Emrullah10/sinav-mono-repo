import datasources from 'app-datasource';
import { secondsUntilLocalMidnight } from 'app-shared';

// Redis 14 (today), 15 (daygoal), 16 (streak). Hepsi write-through / read-through ve best-effort.
const r = () => datasources.coreAppRedis?.client;
const safe = async (fn) => { try { return await fn(); } catch { return null; } };

export const todayKey = (uid, date) => `learning:today:${uid}:${date}`;
export const readToday = (uid, date) => safe(async () => { const v = await r()?.get(todayKey(uid, date)); return v ? JSON.parse(v) : null; });
export const writeToday = (uid, date, body, now, tz) =>
  safe(() => r()?.set(todayKey(uid, date), JSON.stringify(body), 'EX', Math.min(86400, secondsUntilLocalMidnight(now, tz))));
export const invalidateToday = (uid, ...dates) => safe(() => (dates.length ? r()?.del(...dates.map((d) => todayKey(uid, d))) : null));

export const dayGoalKey = (uid, date) => `learning:daygoal:${uid}:${date}`;
export const readDayGoal = (uid, date) => safe(async () => {
  const h = await r()?.hgetall(dayGoalKey(uid, date));
  if (!h || !Object.keys(h).length) return null;
  return { activeSeconds: Number(h.activeSeconds || 0), answered: Number(h.answered || 0), correct: Number(h.correct || 0), cards: Number(h.cards || 0), goalMinutes: h.goalMinutes === '' || h.goalMinutes === undefined ? null : Number(h.goalMinutes) };
});
/** activity_day satırından (commit sonrası güncel) hash'i kurar; anahtar varsa HINCRBY ile ilerletmek yerine satırı esas alır. */
export const writeDayGoal = (uid, date, row) => safe(async () => {
  const cl = r();
  if (!cl) return;
  const k = dayGoalKey(uid, date);
  await cl.hset(k, { activeSeconds: row.activeSeconds, answered: row.questionsAnswered, correct: row.correctAnswers, cards: row.cardsReviewed, goalMinutes: row.goalMinutes ?? '' });
  await cl.expire(k, 48 * 3600);
});

export const streakKey = (uid) => `learning:streak:${uid}`;
export const readStreakCache = (uid) => safe(async () => {
  const h = await r()?.hgetall(streakKey(uid));
  if (!h || !Object.keys(h).length) return null;
  return { current: Number(h.current), longest: Number(h.longest), lastActiveDate: h.lastActiveDate || null, freezes: Number(h.freezes) };
});
export const writeStreakCache = (uid, s) => safe(async () => {
  const cl = r();
  if (!cl) return;
  await cl.hset(streakKey(uid), { current: s.current, longest: s.longest, lastActiveDate: s.lastActiveDate || '', freezes: s.freezes });
  await cl.expire(streakKey(uid), 7 * 86400);
});
