// FSRS-4.5 (aralıklı tekrar). Saf modül: kart durumu + puan + zaman → yeni durum.
// Açık kaynak FSRS-4.5 varsayılan ağırlıkları; hedef hatırlama 0.90.
export const FSRS_VERSION = 'fsrs-4.5';
const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const DECAY = -0.5;
const FACTOR = 19 / 81;
const REQUEST_RETENTION = 0.9;
const MAX_INTERVAL = 365;
const DAY = 86400_000;
export const RATINGS = ['again', 'hard', 'good', 'easy'];
export const LEARN_AGAIN_MINUTES = 10;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round4 = (n) => Math.round(n * 10000) / 10000;
const ratingNo = (r) => RATINGS.indexOf(r) + 1;

export const retrievability = (elapsedDays, stability) => (stability > 0 ? (1 + (FACTOR * Math.max(0, elapsedDays)) / stability) ** DECAY : 0);
const initStability = (r) => Math.max(0.1, W[r - 1]);
const initDifficulty = (r) => clamp(W[4] - (r - 3) * W[5], 1, 10);
const nextDifficulty = (d, r) => {
  const next = d - W[6] * (r - 3);
  return clamp(W[7] * initDifficulty(3) + (1 - W[7]) * next, 1, 10);
};
const recallStability = (d, s, rv, r) => {
  const hardPenalty = r === 2 ? W[15] : 1;
  const easyBonus = r === 4 ? W[16] : 1;
  return s * (1 + Math.exp(W[8]) * (11 - d) * s ** -W[9] * (Math.exp((1 - rv) * W[10]) - 1) * hardPenalty * easyBonus);
};
const forgetStability = (d, s, rv) => W[11] * d ** -W[12] * ((s + 1) ** W[13] - 1) * Math.exp((1 - rv) * W[14]);
const intervalFor = (stability) => clamp(Math.round((stability / FACTOR) * (REQUEST_RETENTION ** (1 / DECAY) - 1)), 1, MAX_INTERVAL);

/**
 * @param {{state,stability,difficulty,lastReviewAt,reps,lapses}} card  state: new|learning|review|relearning
 * @param {'again'|'hard'|'good'|'easy'} rating
 * @param {Date} now
 * @returns yeni kart alanları { state, stability, difficulty, dueAt, elapsedDays, scheduledDays, reps, lapses, lastReviewAt }
 */
export const schedule = (card, rating, now) => {
  const r = ratingNo(rating);
  if (!r) throw new Error('invalid rating');
  const last = card.lastReviewAt ? new Date(card.lastReviewAt) : null;
  const elapsed = last ? Math.max(0, (now - last) / DAY) : 0;
  let { stability, difficulty } = card;
  let state;
  let dueAt;
  let scheduled;
  let lapses = card.lapses || 0;

  if (card.state === 'new' || !stability) {
    stability = initStability(r);
    difficulty = initDifficulty(r);
    if (r === 1) { state = 'learning'; scheduled = 0; dueAt = new Date(now.getTime() + LEARN_AGAIN_MINUTES * 60_000); }
    else {
      state = 'review';
      const hard = intervalFor(initStability(2));
      const good = Math.max(intervalFor(initStability(3)), hard + 1);
      const easy = Math.max(intervalFor(initStability(4)), good + 1);
      scheduled = r === 2 ? hard : r === 3 ? good : easy;
      dueAt = new Date(now.getTime() + scheduled * DAY);
    }
  } else {
    const rv = retrievability(elapsed, stability);
    if (r === 1) {
      lapses += 1;
      stability = Math.min(forgetStability(difficulty, stability, rv), stability);
      difficulty = nextDifficulty(difficulty, r);
      state = 'relearning'; scheduled = 0;
      dueAt = new Date(now.getTime() + LEARN_AGAIN_MINUTES * 60_000);
    } else {
      const sHard = recallStability(difficulty, stability, rv, 2);
      const sGood = recallStability(difficulty, stability, rv, 3);
      const sEasy = recallStability(difficulty, stability, rv, 4);
      const hard = intervalFor(sHard);
      const good = Math.max(intervalFor(sGood), hard + 1);
      const easy = Math.max(intervalFor(sEasy), good + 1);
      difficulty = nextDifficulty(difficulty, r);
      stability = r === 2 ? sHard : r === 3 ? sGood : sEasy;
      scheduled = r === 2 ? hard : r === 3 ? good : easy;
      state = 'review';
      dueAt = new Date(now.getTime() + scheduled * DAY);
    }
  }
  return {
    state, stability: round4(stability), difficulty: round4(difficulty), dueAt, elapsedDays: Math.round(elapsed), scheduledDays: scheduled,
    reps: (card.reps || 0) + 1, lapses, lastReviewAt: now,
  };
};

/** Arayüz için dört düğmenin önizlemesi ("10 dk · 1 gün · 3 gün · 8 gün"). */
export const previewIntervals = (card, now) => Object.fromEntries(RATINGS.map((r) => {
  const n = schedule(card, r, now);
  return [r, n.scheduledDays > 0 ? { days: n.scheduledDays } : { minutes: LEARN_AGAIN_MINUTES }];
}));
