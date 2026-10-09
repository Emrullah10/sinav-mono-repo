import {
  DomainError, withTransaction, consumeQuota, refundQuota, peekUsage, registerUsageSeed, rawQuery, localParts,
} from 'app-shared';
import { withCtx } from './lib/ctx.js';
import { requireEnrollment } from './lib/enroll.js';
import { schedule, previewIntervals, RATINGS, FSRS_VERSION } from './lib/fsrs.js';
import { touchActivity } from './lib/activity.js';
import { completeTaskForSession, completeTask } from './lib/plan-tasks.js';
import { registerTaskStarter, tierOf } from './lib/session-io.js';
import { codeParam, clamp, intParam } from './lib/util.js';

registerUsageSeed('flashcard_reviews_per_day', async ({ userId, from, to }) => {
  const { rows } = await rawQuery('SELECT count(*)::int AS n FROM learning.card_review WHERE card_review_user_account_id=$1 AND card_review_undone_at IS NULL AND card_review_reviewed_at >= $2 AND card_review_reviewed_at < $3', [userId, from, to]);
  return rows[0].n;
});

const CARD_SEL = `c.card_id AS id, c.card_code AS code, c.card_vocab_item_id AS "itemId", c.card_source AS source, c.card_source_deck_id AS "deckId", c.card_state AS state, c.card_due_at AS "dueAt",
  c.card_stability::float8 AS stability, c.card_difficulty::float8 AS difficulty, c.card_elapsed_days AS "elapsedDays", c.card_scheduled_days AS "scheduledDays", c.card_reps AS reps,
  c.card_lapses AS lapses, c.card_last_review_at AS "lastReviewAt", c.card_suspended_at AS "suspendedAt"`;
const MAX_QUEUE = 50;
const normCard = (r) => r && ({ ...r, id: Number(r.id), code: Number(r.code), itemId: Number(r.itemId), deckId: r.deckId ? Number(r.deckId) : null });
const iso = (d) => (d ? new Date(d).toISOString() : null);
const startOfLocalDay = (now, tz) => { const p = localParts(now, tz); return new Date(now.getTime() - (p.hour * 3600 + p.minute * 60 + p.second) * 1000); };

export default (deps) => {
  const q = deps.rawQuery;

  const loadWords = async (itemIds) => {
    if (!itemIds.length) return new Map();
    const { rows } = await q(
      `SELECT i.item_id AS "itemId", i.item_code AS "itemCode", v.vocab_entry_headword AS headword, v.vocab_entry_part_of_speech AS pos, v.vocab_entry_pronunciation_ipa AS ipa,
              v.vocab_entry_meanings AS meanings, v.vocab_entry_examples AS examples, v.vocab_entry_collocations AS collocations, v.vocab_entry_synonyms AS synonyms
         FROM content.item i JOIN content.vocab_entry v ON v.vocab_entry_item_revision_id=i.item_published_revision_id WHERE i.item_id = ANY($1) AND i.item_status='published'`, [itemIds]);
    return new Map(rows.map((r) => [Number(r.itemId), { itemCode: Number(r.itemCode), headword: r.headword, partOfSpeech: r.pos, pronunciationIpa: r.ipa, meanings: r.meanings || [], examples: r.examples || [], collocations: r.collocations || [], synonyms: r.synonyms || [] }]));
  };

  const cardBefore = (c) => ({ state: c.state, dueAt: iso(c.dueAt), stability: c.stability, difficulty: c.difficulty, elapsedDays: c.elapsedDays, scheduledDays: c.scheduledDays, reps: c.reps, lapses: c.lapses, lastReviewAt: iso(c.lastReviewAt) });

  const cardView = (c, word, now) => ({
    code: c.code, state: c.state, isNew: c.state === 'new', reps: c.reps, lapses: c.lapses, dueAt: iso(c.dueAt), source: c.source,
    word: word || null,
    intervals: previewIntervals({ state: c.state, stability: c.stability, difficulty: c.difficulty, lastReviewAt: c.lastReviewAt, reps: c.reps, lapses: c.lapses }, now),
  });

  const loadCardByCode = async (qq, userId, code, lock = false) => {
    const { rows } = await qq(`SELECT ${CARD_SEL} FROM learning.card c WHERE c.card_code=$1 AND c.card_user_account_id=$2 ${lock ? 'FOR UPDATE' : ''}`, [code, userId]);
    if (!rows[0]) throw new DomainError('CARD_NOT_FOUND', 'Card not found', undefined, 404);
    return normCard(rows[0]);
  };

  const loadVocabSession = async (qq, ctx, code, { lock = false } = {}) => {
    const { rows } = await qq(
      `SELECT study_session_id AS id, study_session_code AS code, study_session_status AS status, study_session_config AS config, study_session_planned_item_count AS total,
              study_session_answered_count AS answered, study_session_correct_count AS correct, study_session_started_at AS "startedAt", study_session_ended_at AS "endedAt",
              study_session_source_plan_task_id AS "taskId", study_session_active_seconds AS "activeSeconds"
         FROM learning.study_session WHERE study_session_code=$1 AND study_session_user_account_id=$2 AND study_session_kind='vocab_review' ${lock ? 'FOR UPDATE' : ''}`, [code, ctx.userId]);
    if (!rows[0]) throw new DomainError('SESSION_NOT_FOUND', 'Session not found', undefined, 404);
    return { ...rows[0], id: Number(rows[0].id), code: Number(rows[0].code), taskId: rows[0].taskId ? Number(rows[0].taskId) : null };
  };

  const sessionProgress = (s, queueLen) => ({ total: s.total, reviewed: s.answered, remaining: queueLen, correct: s.correct });

  // ── Genel bakış ──
  const introducedToday = async (ctx) => {
    const { rows } = await q(
      `SELECT c.card_source_deck_id AS "deckId", count(DISTINCT r.card_review_card_id)::int AS n FROM learning.card_review r JOIN learning.card c ON c.card_id=r.card_review_card_id
        WHERE r.card_review_user_account_id=$1 AND r.card_review_state_before='new' AND r.card_review_undone_at IS NULL AND r.card_review_reviewed_at >= $2 GROUP BY 1`, [ctx.userId, startOfLocalDay(ctx.now, ctx.tz)]);
    return new Map(rows.map((r) => [r.deckId ? Number(r.deckId) : 0, r.n]));
  };

  const overview = ({ caller }) => withCtx(deps, caller, async (ctx) => {
    const tier = await tierOf(ctx.userId);
    const { rows: decks } = await q(
      `SELECT d.deck_id AS id, d.deck_code AS code, d.deck_key AS key, d.deck_name AS name, d.deck_description AS description, d.deck_access_tier AS tier, d.deck_default_new_per_day AS "defaultNewPerDay",
              (SELECT count(*)::int FROM content.deck_entry e JOIN content.item i ON i.item_id=e.deck_entry_vocab_item_id AND i.item_status='published' WHERE e.deck_entry_deck_id=d.deck_id) AS total,
              s.deck_subscription_is_active AS "isActive", s.deck_subscription_new_per_day AS "newPerDay",
              (SELECT count(*)::int FROM learning.card c WHERE c.card_user_account_id=$1 AND c.card_source_deck_id=d.deck_id) AS started,
              (SELECT count(*)::int FROM learning.card c WHERE c.card_user_account_id=$1 AND c.card_source_deck_id=d.deck_id AND c.card_state IN ('review') AND c.card_scheduled_days >= 21) AS mature,
              (SELECT count(*)::int FROM learning.card c WHERE c.card_user_account_id=$1 AND c.card_source_deck_id=d.deck_id AND c.card_state <> 'new' AND c.card_suspended_at IS NULL AND c.card_due_at <= $2) AS due
         FROM content.deck d LEFT JOIN learning.deck_subscription s ON s.deck_subscription_deck_id=d.deck_id AND s.deck_subscription_user_account_id=$1
        WHERE d.deck_status='published' ORDER BY d.deck_sort_order, d.deck_id`, [ctx.userId, ctx.now]);
    const intro = await introducedToday(ctx);
    const { rows: tot } = await q(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE card_state <> 'new' AND card_suspended_at IS NULL AND card_due_at <= $2)::int AS due, count(*) FILTER (WHERE card_state='new')::int AS fresh
         FROM learning.card WHERE card_user_account_id=$1`, [ctx.userId, ctx.now]);
    const usage = await peekUsage({ userId: ctx.userId, feature: 'flashcard_reviews_per_day', tz: ctx.tz, now: ctx.now });
    const list = decks.map((d) => {
      const active = !!d.isActive;
      const npd = d.newPerDay ?? d.defaultNewPerDay;
      return {
        key: d.key, code: Number(d.code), name: d.name, description: d.description, accessTier: d.tier, locked: d.tier === 'premium' && tier !== 'premium',
        totalWords: d.total, started: d.started, mature: d.mature, due: d.due, subscribed: active, newPerDay: npd,
        newAvailableToday: active ? Math.max(0, Math.min(npd - (intro.get(Number(d.id)) || 0), d.total - d.started)) : 0,
      };
    });
    return {
      decks: list, totals: { cards: tot[0].total, due: tot[0].due, newCards: tot[0].fresh, newAvailableToday: list.reduce((s, d) => s + d.newAvailableToday, 0) },
      usage: { used: usage.used, limit: usage.limit, remaining: usage.remaining }, algorithm: FSRS_VERSION,
    };
  });

  const subscribe = ({ caller, key, newPerDay, isActive }) => withCtx(deps, caller, async (ctx) => {
    const { rows } = await q("SELECT deck_id AS id, deck_access_tier AS tier, deck_default_new_per_day AS d FROM content.deck WHERE deck_key=$1 AND deck_status='published'", [String(key)]);
    if (!rows[0]) throw new DomainError('DECK_NOT_FOUND', 'Deck not found', undefined, 404);
    const active = isActive !== false;
    if (active && rows[0].tier === 'premium' && (await tierOf(ctx.userId)) !== 'premium') throw new DomainError('DECK_LOCKED', 'This deck is part of Premium', { deckKey: key }, 402);
    const n = newPerDay === undefined ? rows[0].d : intParam(newPerDay, { min: 0, max: 100, name: 'newPerDay' });
    await q(
      `INSERT INTO learning.deck_subscription (deck_subscription_tenant_code, deck_subscription_organization_id, deck_subscription_user_account_id, deck_subscription_deck_id, deck_subscription_new_per_day, deck_subscription_is_active)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (deck_subscription_user_account_id, deck_subscription_deck_id) DO UPDATE SET deck_subscription_new_per_day=EXCLUDED.deck_subscription_new_per_day, deck_subscription_is_active=EXCLUDED.deck_subscription_is_active`,
      [ctx.tenantCode, ctx.orgId, ctx.userId, rows[0].id, n, active]);
    return { deckKey: key, subscribed: active, newPerDay: n };
  });

  // ── Oturum ──
  const buildQueue = async (tx, ctx, { deckKey, limit }) => {
    const L = clamp(Number(limit) || 20, 5, MAX_QUEUE);
    const { rows: due } = await tx.query(
      `SELECT c.card_id AS id, c.card_code AS code, c.card_state AS state FROM learning.card c
        WHERE c.card_user_account_id=$1 AND c.card_suspended_at IS NULL AND c.card_state <> 'suspended' AND c.card_due_at <= $2 AND c.card_state <> 'new'
          AND ($4::varchar IS NULL OR c.card_source_deck_id = (SELECT deck_id FROM content.deck WHERE deck_key=$4))
        ORDER BY c.card_due_at LIMIT $3`, [ctx.userId, ctx.now, L, deckKey || null]);
    const queue = due.map((r) => Number(r.code));
    let room = L - queue.length;
    let created = 0;
    if (room > 0) {
      // Daha önce eklenmiş ama hiç çalışılmamış yeni kartlar
      const { rows: fresh } = await tx.query(
        `SELECT c.card_code AS code FROM learning.card c WHERE c.card_user_account_id=$1 AND c.card_state='new' AND c.card_suspended_at IS NULL
            AND ($3::varchar IS NULL OR c.card_source_deck_id = (SELECT deck_id FROM content.deck WHERE deck_key=$3)) ORDER BY c.card_id LIMIT $2`, [ctx.userId, room, deckKey || null]);
      for (const r of fresh) queue.push(Number(r.code));
      room -= fresh.length;
    }
    if (room > 0) {
      const tier = await tierOf(ctx.userId);
      const intro = await introducedToday(ctx);
      const { rows: subs } = await tx.query(
        `SELECT d.deck_id AS id, d.deck_key AS key, s.deck_subscription_new_per_day AS npd FROM learning.deck_subscription s JOIN content.deck d ON d.deck_id=s.deck_subscription_deck_id
          WHERE s.deck_subscription_user_account_id=$1 AND s.deck_subscription_is_active AND d.deck_status='published' AND ($2::varchar IS NULL OR d.deck_key=$2)
            AND (d.deck_access_tier='free' OR $3::varchar='premium') ORDER BY d.deck_sort_order`, [ctx.userId, deckKey || null, tier]);
      for (const sub of subs) {
        const allow = Math.min(room, Math.max(0, sub.npd - (intro.get(Number(sub.id)) || 0)));
        if (allow <= 0) continue;
        const { rows: ins } = await tx.query(
          `INSERT INTO learning.card (card_tenant_code, card_organization_id, card_user_account_id, card_vocab_item_id, card_source, card_source_deck_id, card_state, card_due_at)
           SELECT $1,$2,$3,e.deck_entry_vocab_item_id,'deck',$4,'new',$5 FROM content.deck_entry e JOIN content.item i ON i.item_id=e.deck_entry_vocab_item_id AND i.item_status='published'
            WHERE e.deck_entry_deck_id=$4 AND NOT EXISTS (SELECT 1 FROM learning.card x WHERE x.card_user_account_id=$3 AND x.card_vocab_item_id=e.deck_entry_vocab_item_id)
            ORDER BY e.deck_entry_position LIMIT $6 ON CONFLICT (card_user_account_id, card_vocab_item_id) DO NOTHING RETURNING card_code AS code`,
          [ctx.tenantCode, ctx.orgId, ctx.userId, sub.id, ctx.now, allow]);
        for (const r of ins) queue.push(Number(r.code));
        room -= ins.length; created += ins.length;
      }
    }
    return { queue, created };
  };

  const startSession = async (ctx, { deckKey, limit, taskId = null }) => {
    const { rows: open } = await q("SELECT study_session_code AS code FROM learning.study_session WHERE study_session_user_account_id=$1 AND study_session_kind='vocab_review' AND study_session_status='in_progress' ORDER BY study_session_id DESC LIMIT 1", [ctx.userId]);
    if (open[0]) return { code: Number(open[0].code), resumed: true, empty: false };
    const enr = await requireEnrollment(q, ctx.userId);
    return withTransaction(async (tx) => {
      const { queue, created } = await buildQueue(tx, ctx, { deckKey, limit });
      if (!queue.length) return { code: null, resumed: false, empty: true, created: 0 };
      const { rows } = await tx.query(
        `INSERT INTO learning.study_session (study_session_tenant_code, study_session_organization_id, study_session_user_account_id, study_session_enrollment_id, study_session_kind, study_session_status,
            study_session_mode, study_session_source_plan_task_id, study_session_config, study_session_started_at, study_session_last_activity_at, study_session_planned_item_count)
         VALUES ($1,$2,$3,$4,'vocab_review','in_progress','learning',$5,$6,$7,$7,$8) RETURNING study_session_code AS code`,
        [ctx.tenantCode, ctx.orgId, ctx.userId, enr.id, taskId, JSON.stringify({ queue, deckKey: deckKey || null, algorithm: FSRS_VERSION }), ctx.now, queue.length]);
      return { code: Number(rows[0].code), resumed: false, empty: false, created };
    });
  };

  const sessionBody = async (ctx, s) => {
    const cfg = s.config || {};
    const queue = cfg.queue || [];
    return { code: s.code, kind: 'vocab_review', status: s.status, startedAt: iso(s.startedAt), endedAt: iso(s.endedAt), progress: sessionProgress(s, queue.length) };
  };

  const start = ({ caller, deckKey, limit }) => withCtx(deps, caller, async (ctx) => {
    const r = await startSession(ctx, { deckKey, limit });
    if (r.empty) return { empty: true, session: null, resumed: false };
    const s = await loadVocabSession(q, ctx, r.code);
    return { empty: false, resumed: r.resumed, newCards: r.created || 0, session: await sessionBody(ctx, s) };
  });

  const next = ({ caller, code }) => withCtx(deps, caller, async (ctx) => {
    const s = await loadVocabSession(q, ctx, codeParam(code));
    const queue = s.config?.queue || [];
    const body = await sessionBody(ctx, s);
    if (s.status !== 'in_progress' || !queue.length) return { done: true, card: null, session: body };
    const c = await loadCardByCode(q, ctx.userId, queue[0]);
    const words = await loadWords([c.itemId]);
    return { done: false, card: cardView(c, words.get(c.itemId), ctx.now), session: body };
  });

  const review = ({ caller, cardCode, rating, durationMs, sessionCode, clientRef }) => withCtx(deps, caller, async (ctx) => {
    if (!RATINGS.includes(rating)) throw new DomainError('VALIDATION_ERROR', `rating must be one of ${RATINGS.join(', ')}`, { field: 'rating' }, 400);
    const c0 = codeParam(cardCode, 'cardCode');
    let quotaTaken = false;
    try {
      return await withTransaction(async (tx) => {
        const qq = tx.query.bind(tx);
        const card = await loadCardByCode(qq, ctx.userId, c0, true);
        if (card.suspendedAt) throw new DomainError('CARD_SUSPENDED', 'This card is suspended', undefined, 409);
        const sess = sessionCode ? await loadVocabSession(qq, ctx, codeParam(sessionCode, 'sessionCode'), { lock: true }) : null;
        if (sess && sess.status !== 'in_progress') throw new DomainError('SESSION_NOT_IN_PROGRESS', 'Session is not in progress', { status: sess.status }, 409);
        if (clientRef) {
          const { rows: dup } = await qq("SELECT 1 FROM learning.card_review WHERE card_review_user_account_id=$1 AND card_review_metadata->>'clientRef'=$2", [ctx.userId, String(clientRef)]);
          if (dup[0]) return { replayed: true, card: { code: card.code, state: card.state, dueAt: iso(card.dueAt) }, session: sess ? await sessionBody(ctx, sess) : null };
        }
        const c = await consumeQuota({ userId: ctx.userId, feature: 'flashcard_reviews_per_day', n: 1, tz: ctx.tz, now: ctx.now });
        quotaTaken = true;
        const dur = clamp(Math.round(Number(durationMs) || 0), 0, 600_000);
        const upd = schedule({ state: card.state, stability: card.stability, difficulty: card.difficulty, lastReviewAt: card.lastReviewAt, reps: card.reps, lapses: card.lapses }, rating, ctx.now);
        await qq(
          `INSERT INTO learning.card_review (card_review_tenant_code, card_review_organization_id, card_review_card_id, card_review_user_account_id, card_review_study_session_id, card_review_rating,
              card_review_state_before, card_review_reviewed_at, card_review_duration_ms, card_review_elapsed_days, card_review_scheduled_days, card_review_card_before, card_review_metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [ctx.tenantCode, ctx.orgId, card.id, ctx.userId, sess?.id || null, rating, card.state, ctx.now, dur, upd.elapsedDays, upd.scheduledDays, JSON.stringify(cardBefore(card)), JSON.stringify(clientRef ? { clientRef: String(clientRef) } : {})]);
        await qq(
          `UPDATE learning.card SET card_state=$2, card_due_at=$3, card_stability=$4, card_difficulty=$5, card_elapsed_days=$6, card_scheduled_days=$7, card_reps=$8, card_lapses=$9, card_last_review_at=$10 WHERE card_id=$1`,
          [card.id, upd.state, upd.dueAt, upd.stability, upd.difficulty, upd.elapsedDays, upd.scheduledDays, upd.reps, upd.lapses, ctx.now]);
        const act = await touchActivity(tx, ctx, { cardsReviewed: 1, newCards: card.state === 'new' ? 1 : 0, activeSeconds: Math.round(dur / 1000) });
        let sessionOut = null;
        if (sess) {
          const queue = [...(sess.config?.queue || [])];
          const idx = queue.indexOf(card.code);
          if (idx >= 0) queue.splice(idx, 1);
          if (rating === 'again') queue.splice(Math.min(3, queue.length), 0, card.code);
          const good = rating !== 'again';
          await qq(
            `UPDATE learning.study_session SET study_session_config = study_session_config || $2::jsonb, study_session_answered_count=study_session_answered_count+$3, study_session_correct_count=study_session_correct_count+$4,
                    study_session_wrong_count=study_session_wrong_count+$5, study_session_last_activity_at=$6,
                    study_session_planned_item_count = GREATEST(study_session_planned_item_count, study_session_answered_count+$3+$7)
              WHERE study_session_id=$1`, [sess.id, JSON.stringify({ queue }), 1, good ? 1 : 0, good ? 0 : 1, ctx.now, queue.length]);
          const s2 = await loadVocabSession(qq, ctx, sess.code);
          sessionOut = await sessionBody(ctx, s2);
        }
        const nextCard = sessionOut && sessionOut.progress.remaining ? (await loadCardByCode(qq, ctx.userId, (await loadVocabSession(qq, ctx, sess.code)).config.queue[0])) : null;
        const words = nextCard ? await loadWords([nextCard.itemId]) : new Map();
        return {
          replayed: false, card: { code: card.code, state: upd.state, dueAt: iso(upd.dueAt), scheduledDays: upd.scheduledDays, stability: upd.stability, difficulty: upd.difficulty, reps: upd.reps, lapses: upd.lapses },
          quota: { feature: 'flashcard_reviews_per_day', used: c.used, limit: c.limit, remaining: c.limit === null || c.limit === undefined ? null : Math.max(0, c.limit - c.used) },
          activity: { goalJustMet: act.goalJustMet, streakCurrent: act.streak.current }, session: sessionOut,
          next: nextCard ? cardView(nextCard, words.get(nextCard.itemId), ctx.now) : null,
        };
      });
    } catch (e) {
      if (quotaTaken) await refundQuota({ userId: ctx.userId, feature: 'flashcard_reviews_per_day', n: 1, tz: ctx.tz, now: ctx.now }).catch(() => {});
      throw e;
    }
  });

  const undo = ({ caller, code }) => withCtx(deps, caller, async (ctx) => {
    const c = codeParam(code);
    const out = await withTransaction(async (tx) => {
      const qq = tx.query.bind(tx);
      const sess = await loadVocabSession(qq, ctx, c, { lock: true });
      if (sess.status !== 'in_progress') throw new DomainError('SESSION_NOT_IN_PROGRESS', 'Session is not in progress', { status: sess.status }, 409);
      const { rows } = await qq(
        `SELECT card_review_id AS id, card_review_card_id AS "cardId", card_review_card_before AS before, card_review_rating AS rating, card_review_state_before AS "stateBefore"
           FROM learning.card_review WHERE card_review_study_session_id=$1 AND card_review_undone_at IS NULL ORDER BY card_review_reviewed_at DESC, card_review_id DESC LIMIT 1`, [sess.id]);
      if (!rows[0]) throw new DomainError('NOTHING_TO_UNDO', 'There is nothing to undo', undefined, 409);
      const b = rows[0].before;
      await qq(
        `UPDATE learning.card SET card_state=$2, card_due_at=$3, card_stability=$4, card_difficulty=$5, card_elapsed_days=$6, card_scheduled_days=$7, card_reps=$8, card_lapses=$9, card_last_review_at=$10 WHERE card_id=$1`,
        [rows[0].cardId, b.state, b.dueAt, b.stability, b.difficulty, b.elapsedDays, b.scheduledDays, b.reps, b.lapses, b.lastReviewAt]);
      await qq('UPDATE learning.card_review SET card_review_undone_at=$2 WHERE card_review_id=$1', [rows[0].id, ctx.now]);
      const { rows: cc } = await qq('SELECT card_code AS code FROM learning.card WHERE card_id=$1', [rows[0].cardId]);
      const cardCode = Number(cc[0].code);
      const queue = [...(sess.config?.queue || [])];
      if (rows[0].rating === 'again') { const i = queue.indexOf(cardCode); if (i >= 0) queue.splice(i, 1); }
      const j = queue.indexOf(cardCode);
      if (j >= 0) queue.splice(j, 1);
      queue.unshift(cardCode);
      const good = rows[0].rating !== 'again';
      await qq(
        `UPDATE learning.study_session SET study_session_config = study_session_config || $2::jsonb, study_session_answered_count=GREATEST(0,study_session_answered_count-1),
                study_session_correct_count=GREATEST(0,study_session_correct_count-$3), study_session_wrong_count=GREATEST(0,study_session_wrong_count-$4) WHERE study_session_id=$1`,
        [sess.id, JSON.stringify({ queue }), good ? 1 : 0, good ? 0 : 1]);
      await qq(
        `UPDATE learning.activity_day SET activity_day_cards_reviewed=GREATEST(0,activity_day_cards_reviewed-1), activity_day_new_cards=GREATEST(0,activity_day_new_cards-$3)
          WHERE activity_day_user_account_id=$1 AND activity_day_activity_date=$2`, [ctx.userId, ctx.today, rows[0].stateBefore === 'new' ? 1 : 0]);
      return { cardCode, sess: await loadVocabSession(qq, ctx, c) };
    });
    await refundQuota({ userId: ctx.userId, feature: 'flashcard_reviews_per_day', n: 1, tz: ctx.tz, now: ctx.now }).catch(() => {});
    const card = await loadCardByCode(q, ctx.userId, out.cardCode);
    const words = await loadWords([card.itemId]);
    return { undone: true, card: cardView(card, words.get(card.itemId), ctx.now), session: await sessionBody(ctx, out.sess) };
  });

  const complete = ({ caller, code }) => withCtx(deps, caller, async (ctx) => {
    const c = codeParam(code);
    return withTransaction(async (tx) => {
      const qq = tx.query.bind(tx);
      const s = await loadVocabSession(qq, ctx, c, { lock: true });
      const { rows: st } = await qq(
        `SELECT count(*)::int AS n, count(*) FILTER (WHERE card_review_rating='again')::int AS again, count(*) FILTER (WHERE card_review_rating='hard')::int AS hard, count(*) FILTER (WHERE card_review_rating='good')::int AS good,
                count(*) FILTER (WHERE card_review_rating='easy')::int AS easy, count(*) FILTER (WHERE card_review_state_before='new')::int AS fresh, COALESCE(sum(card_review_duration_ms),0)::int AS ms
           FROM learning.card_review WHERE card_review_study_session_id=$1 AND card_review_undone_at IS NULL`, [s.id]);
      const { rows: nx } = await qq("SELECT min(card_due_at) AS next FROM learning.card WHERE card_user_account_id=$1 AND card_state <> 'new' AND card_suspended_at IS NULL", [ctx.userId]);
      const { rows: dueNow } = await qq("SELECT count(*)::int AS n FROM learning.card WHERE card_user_account_id=$1 AND card_state <> 'new' AND card_suspended_at IS NULL AND card_due_at <= $2", [ctx.userId, ctx.now]);
      let already = true;
      if (s.status === 'in_progress') {
        already = false;
        await qq(
          "UPDATE learning.study_session SET study_session_status='completed', study_session_ended_at=$2, study_session_last_activity_at=$2, study_session_active_seconds=$3 WHERE study_session_id=$1",
          [s.id, ctx.now, Math.round(st[0].ms / 1000)]);
        if (s.taskId) await completeTaskForSession(tx, ctx, { sourcePlanTaskId: s.taskId });
      }
      const r = st[0];
      return {
        already, session: { code: s.code, status: 'completed' },
        summary: {
          reviewed: r.n, newLearned: r.fresh, ratings: { again: r.again, hard: r.hard, good: r.good, easy: r.easy }, accuracy: r.n ? Math.round(((r.n - r.again) / r.n) * 1000) / 10 : null,
          seconds: Math.round(r.ms / 1000), dueNow: dueNow[0].n, nextDueAt: iso(nx[0].next),
        },
      };
    });
  });

  // ── Sözlükten kart ──
  const byItem = ({ caller, itemCode }) => withCtx(deps, caller, async (ctx) => {
    const { rows } = await q(`SELECT ${CARD_SEL} FROM learning.card c JOIN content.item i ON i.item_id=c.card_vocab_item_id WHERE c.card_user_account_id=$1 AND i.item_code=$2`, [ctx.userId, codeParam(itemCode, 'itemCode')]);
    if (!rows[0]) return { card: null };
    const c = normCard(rows[0]);
    return { card: { code: c.code, state: c.state, dueAt: iso(c.dueAt), reps: c.reps, lapses: c.lapses, source: c.source } };
  });

  const addCard = ({ caller, itemCode }) => withCtx(deps, caller, async (ctx) => {
    const { rows: it } = await q("SELECT item_id AS id FROM content.item WHERE item_code=$1 AND item_kind='vocab_entry' AND item_status='published'", [codeParam(itemCode, 'itemCode')]);
    if (!it[0]) throw new DomainError('VOCAB_NOT_FOUND', 'Word not found', undefined, 404);
    const { rows } = await q(
      `INSERT INTO learning.card (card_tenant_code, card_organization_id, card_user_account_id, card_vocab_item_id, card_source, card_state, card_due_at) VALUES ($1,$2,$3,$4,'dictionary','new',$5)
       ON CONFLICT (card_user_account_id, card_vocab_item_id) DO NOTHING RETURNING card_code AS code`, [ctx.tenantCode, ctx.orgId, ctx.userId, it[0].id, ctx.now]);
    if (rows[0]) return { created: true, card: { code: Number(rows[0].code), state: 'new', dueAt: iso(ctx.now), source: 'dictionary' } };
    const { rows: ex } = await q('SELECT card_code AS code, card_state AS state, card_due_at AS "dueAt", card_source AS source FROM learning.card WHERE card_user_account_id=$1 AND card_vocab_item_id=$2', [ctx.userId, it[0].id]);
    return { created: false, card: { code: Number(ex[0].code), state: ex[0].state, dueAt: iso(ex[0].dueAt), source: ex[0].source } };
  });

  void completeTask;
  return Object.freeze({ overview, subscribe, start, next, review, undo, complete, byItem, addCard, startSession });
};

registerTaskStarter('vocab_review', async (deps, ctx, task) => {
  const r = await deps.uc.vocab.startSession(ctx, { limit: task.params?.limit || 20, taskId: task.id });
  if (r.empty) {
    await withTransaction(async (tx) => completeTask(tx, ctx, task.id));
    return { empty: true, session: null };
  }
  return { empty: false, session: { code: r.code, kind: 'vocab_review', resumed: r.resumed } };
});
