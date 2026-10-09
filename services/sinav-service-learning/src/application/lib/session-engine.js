import {
  DomainError, withTransaction, consumeQuota, refundQuota, getQuestionDto, getQuestionDtosForPairs, getPublishedNoteDto, getTrackCatalog,
} from 'app-shared';
import { clamp, round1, preview, num } from './util.js';
import {
  loadSession, loadItems, loadItem, recordAttempt, findAttemptByClientRef, recomputeSessionCounters, touchSession,
} from './attempts.js';
import { updateMastery } from './mastery.js';
import { touchActivity } from './activity.js';
import { upsertMistake, applyMistakeReview, suggestMistakeType, findDueMistake } from './mistakes.js';
import { setTaskProgress, completeTaskForSession } from './plan-tasks.js';
import { maybeRefreshEstimate } from './estimate.js';
import { invalidateToday } from './cache.js';

// ── Politikalar: oturum türü/moduna göre davranış ───────────────────────────
// feedback: 'immediate' (öğrenme: her cevapta geri bildirim) | 'deferred' (sonda). maxTries: "Tekrar dene" merdiveni.
// masteryTiming: 'immediate' (cevapta) | 'deferred' (tamamlanınca toplu). skipFinal: "Bilmiyorum, geç" kesin sayılır.
const LEARNING = { feedback: 'immediate', maxTries: 2, hints: true, quota: 'questions_per_day', masteryTiming: 'immediate', recordMistakes: true, skipFinal: false };
const policies = new Map();
/** Yeni oturum türleri (L2) kendi politikasını kaydeder: registerSessionPolicy('error_review', (session) => ({ ...LEARNING_POLICY, quota: null })) */
export const registerSessionPolicy = (kind, fn) => policies.set(kind, fn);
export const LEARNING_POLICY = Object.freeze(LEARNING);
registerSessionPolicy('practice', (s) => (s.mode === 'learning' ? LEARNING : { ...LEARNING, feedback: 'deferred', maxTries: 1, hints: false }));
registerSessionPolicy('note_check', () => ({ ...LEARNING, quota: null }));
registerSessionPolicy('diagnostic', () => ({ feedback: 'deferred', maxTries: 1, hints: false, quota: null, masteryTiming: 'deferred', recordMistakes: false, skipFinal: true }));
registerSessionPolicy('error_review', () => ({ ...LEARNING, quota: null, maxTries: 1 }));
registerSessionPolicy('mock_exam', () => ({ feedback: 'deferred', maxTries: 1, hints: false, quota: null, masteryTiming: 'deferred', recordMistakes: false, skipFinal: false }));
export const policyFor = (session) => (policies.get(session.kind) || (() => LEARNING))(session);

const FINISHED = ['completed', 'expired', 'abandoned'];
export const isFinished = (s) => FINISHED.includes(s.status);

/** Oturum açık mı? Süreli oturumda süre dolduysa 'expired' yapar ve hata verir. */
export const assertOpen = async (tx, ctx, session) => {
  if (session.status === 'in_progress') {
    const dl = session.config?.deadlineAt;
    if (dl && new Date(dl) < ctx.now) {
      await tx.query("UPDATE learning.study_session SET study_session_status='expired', study_session_ended_at=$2 WHERE study_session_id=$1 AND study_session_status='in_progress'", [session.id, ctx.now]);
      throw new DomainError('SESSION_EXPIRED', 'Session time is over', { sessionCode: session.code }, 409);
    }
    return;
  }
  throw new DomainError('SESSION_NOT_IN_PROGRESS', 'Session is not in progress', { status: session.status }, 409);
};

const pubMistake = (m) => { const { id: _id, ...rest } = m.mistake; return { added: true, created: m.created, ...rest }; };

const PENDING_STATES = ['pending', 'seen', 'skipped'];
const nextPosition = (items, from) => {
  const open = items.filter((i) => PENDING_STATES.includes(i.status));
  return (open.find((i) => i.position > from) || open[0])?.position || null;
};

// ── Görünümler ──────────────────────────────────────────────────────────────
export const sessionProgress = (s) => ({ answered: s.answeredCount, total: s.plannedItemCount, correct: s.correctCount, wrong: s.wrongCount, blank: s.blankCount, hintsUsed: s.hintsUsed });

export const solutionBlock = (dto, noteLink = null) => ({
  correctLabel: dto.correctLabel, shortReason: dto.shortReason, explanation: dto.explanation,
  options: dto.options.map((o) => ({ label: o.label, text: o.text, isCorrect: o.isCorrect, rationale: o.rationale })), noteLink,
});

const revealedHints = (dto, n) => dto.hints.filter((h) => h.kind !== 'solution').slice(0, n).map((h) => ({ stepNo: h.stepNo, kind: h.kind, body: h.body, eliminatesLabels: h.eliminatesLabels }));

export const itemState = (item, dto, policy, finished) => {
  const showResult = finished || (policy.feedback === 'immediate' && item.status === 'answered');
  return {
    status: item.status, selectedLabel: item.selectedLabel, isFlagged: item.isFlagged, eliminatedLabels: item.eliminatedLabels, tries: item.tries, maxTries: policy.maxTries,
    hintsRevealed: item.hintsRevealed, hintsTotal: dto.hints.filter((h) => h.kind !== 'solution').length, hintSteps: revealedHints(dto, item.hintsRevealed), solutionViewed: item.solutionViewed,
    timeSpentMs: item.timeSpentMs, isCorrect: showResult ? item.isCorrect : null,
    canRetry: policy.maxTries > 1 && item.status !== 'answered' && item.tries >= 1 && item.tries < policy.maxTries,
  };
};

export const buildItemView = ({ session, item, dto, policy, items, dtoMap }) => {
  const finished = isFinished(session);
  const showSolution = finished || (policy.feedback === 'immediate' && item.status === 'answered' && item.solutionViewed);
  const showFeedback = finished || (policy.feedback === 'immediate' && (item.status === 'answered' || item.tries >= 1));
  let passage = null;
  if (dto.passage) {
    const siblings = items.filter((i) => dtoMap.get(i.questionId)?.passage?.itemId === dto.passage.itemId).map((i) => i.position);
    const { itemId: _pid, ...pub } = dto.passage;
    passage = { ...pub, questionPositions: siblings };
  }
  const base = {
    sessionCode: session.code, position: item.position, total: items.length, kind: session.kind, mode: session.mode, sessionStatus: session.status,
    question: {
      itemCode: dto.itemCode, questionType: { key: dto.questionType.key, name: dto.questionType.name, format: dto.questionType.format }, readingQuestionKind: dto.readingQuestionKind,
      stem: dto.stem, stemFormat: dto.stemFormat, blankNo: dto.blankNo, groupPosition: dto.groupPosition, estimatedSeconds: dto.estimatedSeconds,
      options: (item.optionOrder?.length ? item.optionOrder.map((l) => dto.options.find((o) => o.label === l)).filter(Boolean) : dto.options).map((o) => ({ label: o.label, text: o.text })),
    },
    passage, state: itemState(item, dto, policy, finished),
  };
  base.feedback = showFeedback
    ? {
      isCorrect: item.isCorrect, correctLabel: item.status === 'answered' || finished ? dto.correctLabel : null,
      shortReason: item.status === 'answered' || finished ? dto.shortReason : null,
      withHint: !!item.isCorrect && item.hintsRevealed > 0,
    }
    : null;
  base.solution = showSolution ? solutionBlock(dto) : null;
  return base;
};

export const sessionView = ({ session, items, policy, dtoMap = null, bookmarks = null }) => {
  const finished = isFinished(session);
  const cfg = session.config || {};
  const firstOpen = items.find((i) => PENDING_STATES.includes(i.status));
  return {
    code: session.code, kind: session.kind, mode: session.mode, status: session.status,
    startedAt: new Date(session.startedAt).toISOString(), endedAt: session.endedAt ? new Date(session.endedAt).toISOString() : null,
    plannedItemCount: session.plannedItemCount, progress: sessionProgress(session), activeSeconds: session.activeSeconds,
    feedbackMode: policy.feedback, maxTries: policy.maxTries, hintsEnabled: policy.hints,
    config: { questionTypeKeys: cfg.questionTypeKeys || [], skillKeys: cfg.skillKeys || [], difficulty: cfg.difficulty || null, timeLimitSeconds: cfg.timeLimitSeconds || null, deadlineAt: cfg.deadlineAt || null, noteItemCode: cfg.noteItemCode || null },
    currentPosition: firstOpen?.position || (items.length ? items[items.length - 1].position : null),
    items: items.map((i) => ({
      position: i.position, status: i.status, isFlagged: i.isFlagged, hasSelection: !!i.selectedLabel,
      isCorrect: finished || (policy.feedback === 'immediate' && i.status === 'answered') ? i.isCorrect : null,
      typeKey: dtoMap?.get(i.questionId)?.questionType.key || null, passageItemCode: dtoMap?.get(i.questionId)?.passage?.itemCode || null,
      bookmarked: bookmarks ? bookmarks.has(i.itemId) : undefined,
    })),
  };
};

// ── Cevap ───────────────────────────────────────────────────────────────────
const noteLinkFor = async (q, dto, catalog) => {
  try {
    const t = catalog?.questionTypes.find((x) => x.id === dto.questionType.id);
    let note = t?.strategyNoteItemId ? await getPublishedNoteDto({ itemId: t.strategyNoteItemId }) : null;
    if (!note) {
      const prim = dto.skills.find((s) => s.isPrimary) || dto.skills[0];
      if (prim) {
        const { rows } = await q(
          `SELECT i.item_id AS id FROM content.item_skill s JOIN content.item i ON i.item_id = s.item_skill_item_id
            WHERE s.item_skill_skill_id=$1 AND i.item_kind='note' AND i.item_status='published' ORDER BY s.item_skill_is_primary DESC LIMIT 1`, [prim.id]);
        if (rows[0]) note = await getPublishedNoteDto({ itemId: Number(rows[0].id) });
      }
    }
    return note ? { itemCode: note.itemCode, title: note.title, summary: note.summary } : null;
  } catch { return null; }
};

const sessionCatalog = async (q, session) => {
  if (!session.enrollmentId) return null;
  const { rows } = await q('SELECT enrollment_track_id AS "trackId" FROM learning.enrollment WHERE enrollment_id=$1', [session.enrollmentId]);
  return rows[0] ? getTrackCatalog({ trackId: Number(rows[0].trackId) }) : null;
};

const answerResponse = ({ session, item, dto, policy, items, mistake = null, quota = null, activity = null, extra = null, replayed = false }) => {
  const prog = sessionProgress(session);
  const status = item.status;
  const correctFirst = item.isCorrect === true;
  const retryCorrect = status === 'answered' && !correctFirst && item.selectedLabel === dto.correctLabel;
  const final = status === 'answered';
  let outcome;
  if (status === 'skipped') outcome = 'skipped';
  else if (policy.feedback !== 'immediate') outcome = 'recorded';
  else if (final) outcome = correctFirst ? 'correct' : retryCorrect ? 'correct_on_retry' : 'wrong_final';
  else outcome = 'wrong_retry';
  const immediate = policy.feedback === 'immediate';
  return {
    replayed,
    outcome,
    item: itemState(item, dto, policy, false),
    feedback: immediate && status !== 'skipped'
      ? {
        isCorrect: correctFirst || retryCorrect, correctOnFirstTry: correctFirst, canRetry: !final && policy.maxTries > 1 && item.tries < policy.maxTries, eliminatedLabels: item.eliminatedLabels,
        shortReason: final ? dto.shortReason : null, correctLabel: final ? dto.correctLabel : null, withHint: (correctFirst || retryCorrect) && item.hintsRevealed > 0,
        solutionAvailable: item.tries >= 1 || final, hintsRemaining: Math.max(0, dto.hints.filter((h) => h.kind !== 'solution').length - item.hintsRevealed),
      }
      : null,
    mistake, quota, activity, progress: prog, next: nextPosition(items, item.position), extra,
  };
};

/**
 * Cevabı işle (tüm oturum türleri için ortak). Kilit: madde satırı FOR UPDATE. İdempotent: clientRef.
 * @param {object} deps { rawQuery, nowFn }  @param {object} ctx loadCtx  @param {object} a { code, position, selectedLabel|null, timeMs, clientRef, hooks }
 * hooks.afterRecord(tx, ctx, { session, item, dto, correct, final, skip, attempt }) → extra (yanıtın `extra` alanı)
 */
export const submitAnswer = async (deps, ctx, a) => {
  let quotaTaken = null;
  try {
    return await withTransaction(async (tx) => {
      const q = tx.query.bind(tx);
      let session = await loadSession(q, ctx, a.code);
      const policy = policyFor(session);
      await assertOpen(tx, ctx, session);
      const item = await loadItem(q, session.id, a.position, { lock: true });
      const items = await loadItems(q, session.id);
      const dto = await getQuestionDto({ itemId: item.itemId, questionId: item.questionId });
      if (!dto) throw new DomainError('QUESTION_UNAVAILABLE', 'Question is unavailable', undefined, 503);
      const prior = await findAttemptByClientRef(q, ctx.userId, a.clientRef);
      if (prior) {
        if (prior.itemId !== item.id) throw new DomainError('CLIENT_REF_CONFLICT', 'clientRef already used', undefined, 409);
        return answerResponse({ session, item, dto, policy, items, replayed: true });
      }
      const skip = a.selectedLabel === null || a.selectedLabel === undefined || a.selectedLabel === '';
      if (!skip && !dto.options.some((o) => o.label === a.selectedLabel)) throw new DomainError('ANSWER_OPTION_INVALID', 'Unknown option', { field: 'selectedLabel' }, 400);
      if (item.status === 'answered') throw new DomainError('ITEM_ALREADY_ANSWERED', 'Item already answered', { position: item.position }, 409);
      const timeMs = clamp(Math.round(Number(a.timeMs) || 0), 0, 3_600_000);

      // Kota: ilk gerçek cevapta (madde başına bir kez)
      if (!skip && policy.quota && !item.meta?.quota) {
        const c = await consumeQuota({ userId: ctx.userId, feature: policy.quota, n: 1, tz: ctx.tz, now: ctx.now });
        quotaTaken = { feature: policy.quota };
        quotaTaken.info = { feature: policy.quota, used: c.used, limit: c.limit, remaining: c.limit === null || c.limit === undefined ? null : Math.max(0, c.limit - c.used) };
      }

      let attempt = null;
      let mistake = null;
      let activity = null;
      let newItem = { ...item };
      const sets = { eliminated: item.eliminatedLabels, solutionViewed: item.solutionViewed };
      let final = false;
      let correct = false;
      let tryNo = 1;
      let metaPatch = {};

      if (skip) {
        if (item.status === 'skipped' && !policy.skipFinal) { // zaten atlanmış: yalnız süre
          await q('UPDATE learning.study_session_item SET study_session_item_time_spent_ms = study_session_item_time_spent_ms + $2 WHERE study_session_item_id=$1', [item.id, timeMs]);
          newItem = { ...item, timeSpentMs: item.timeSpentMs + timeMs };
        } else {
          final = !!policy.skipFinal;
          const mast = policy.masteryTiming === 'immediate' && final ? await updateMastery(tx, ctx, { questionTypeId: dto.questionType.id, skills: dto.skills, difficulty: dto.difficulty, correct: false, hinted: false }) : null;
          attempt = await recordAttempt(tx, ctx, { session, item, dto, selectedLabel: null, tryNo: 1, timeMs, hintsRevealed: item.hintsRevealed, clientRef: a.clientRef, countsForMastery: policy.skipFinal || false, metadata: mast ? { skillDeltas: mast.skillDeltas, typeDelta: mast.typeDelta } : {} });
          newItem = { ...item, status: final ? 'answered' : 'skipped', selectedLabel: null, isCorrect: final ? false : null, timeSpentMs: item.timeSpentMs + timeMs };
          if (final && policy.recordMistakes && attempt.id) {
            const m = await upsertMistake(tx, ctx, { itemId: item.itemId, questionTypeId: dto.questionType.id, attemptId: attempt.id, suggestedType: suggestMistakeType({ dto, timeMs, selectedBlank: true }) });
            mistake = pubMistake(m);
          }
        }
      } else {
        tryNo = item.tries + 1;
        if (tryNo > policy.maxTries) throw new DomainError('ITEM_ALREADY_ANSWERED', 'No tries left', { position: item.position }, 409);
        correct = dto.correctLabel === a.selectedLabel;
        final = correct || tryNo >= policy.maxTries;
        const first = tryNo === 1;
        let mast = null;
        if (first && policy.masteryTiming === 'immediate') {
          mast = await updateMastery(tx, ctx, { questionTypeId: dto.questionType.id, skills: dto.skills, difficulty: dto.difficulty, correct, hinted: item.hintsRevealed > 0 || item.solutionViewed });
        }
        attempt = await recordAttempt(tx, ctx, {
          session, item, dto, selectedLabel: a.selectedLabel, tryNo, timeMs, hintsRevealed: item.hintsRevealed, clientRef: a.clientRef, correct,
          countsForMastery: first, metadata: mast ? { skillDeltas: mast.skillDeltas, typeDelta: mast.typeDelta } : {},
        });
        if (attempt.duplicate) throw new DomainError('CLIENT_REF_CONFLICT', 'clientRef already used', undefined, 409);
        const eliminated = !correct && !final ? [...new Set([...item.eliminatedLabels, a.selectedLabel])] : item.eliminatedLabels;
        sets.eliminated = eliminated;
        if (!correct && final && policy.maxTries > 1) sets.solutionViewed = true; // ikinci yanlıştan sonra çözüm açılır
        newItem = {
          ...item, status: final ? 'answered' : 'seen', selectedLabel: a.selectedLabel, tries: tryNo, eliminatedLabels: eliminated, solutionViewed: sets.solutionViewed,
          isCorrect: final ? first && correct : null, timeSpentMs: item.timeSpentMs + timeMs,
        };
        if (first && !correct && policy.recordMistakes) {
          const m = await upsertMistake(tx, ctx, { itemId: item.itemId, questionTypeId: dto.questionType.id, attemptId: attempt.id, suggestedType: suggestMistakeType({ dto, timeMs, selectedBlank: false }) });
          mistake = pubMistake(m);
        } else if (first && correct && policy.recordMistakes) {
          const due = await findDueMistake(q, ctx.userId, item.itemId, ctx.now);
          if (due) await applyMistakeReview(tx, ctx, { mistakeId: due, correct: true });
        }
        metaPatch = { quota: item.meta?.quota || !!policy.quota };
      }

      if (newItem !== item && (attempt || !skip)) {
        await q(
          `UPDATE learning.study_session_item SET study_session_item_status=$2, study_session_item_selected_label=$3, study_session_item_is_correct=$4, study_session_item_eliminated_labels=$5,
                  study_session_item_tries=$6, study_session_item_solution_viewed=$7, study_session_item_time_spent_ms=$8, study_session_item_first_seen_at=COALESCE(study_session_item_first_seen_at,$9),
                  study_session_item_answered_at=CASE WHEN $10 THEN $9 ELSE study_session_item_answered_at END, study_session_item_metadata = study_session_item_metadata || $11::jsonb
            WHERE study_session_item_id=$1`,
          [item.id, newItem.status, newItem.selectedLabel, newItem.isCorrect, newItem.eliminatedLabels, newItem.tries, newItem.solutionViewed, newItem.timeSpentMs, ctx.now, final, JSON.stringify(metaPatch)]);
      }
      const counters = await recomputeSessionCounters(tx, session.id);
      session = { ...session, ...counters };
      await touchSession(tx, session.id, ctx.now);
      if (final) {
        const act = await touchActivity(tx, ctx, { questionsAnswered: 1, correctAnswers: newItem.isCorrect ? 1 : 0 });
        activity = { goalJustMet: act.goalJustMet, milestone: act.milestone, streakCurrent: act.streak.current, freezeGranted: act.freezeGranted };
        if (session.sourcePlanTaskId && session.plannedItemCount) await setTaskProgress(tx, ctx, session.sourcePlanTaskId, (counters.answeredCount / session.plannedItemCount) * 100);
      }
      let extra = null;
      if (a.hooks?.afterRecord) extra = await a.hooks.afterRecord(tx, ctx, { session, item: newItem, dto, correct, final, skip, attempt, items });
      const itemsNow = items.map((i) => (i.id === item.id ? newItem : i));
      return answerResponse({ session, item: newItem, dto, policy, items: itemsNow, mistake, quota: quotaTaken?.info || null, activity, extra });
    }).then(async (res) => { await (async () => {})(); return res; });
  } catch (e) {
    if (quotaTaken) await refundQuota({ userId: ctx.userId, feature: quotaTaken.feature, n: 1, tz: ctx.tz, now: ctx.now }).catch(() => {});
    throw e;
  }
};

// ── İpucu merdiveni ve çözüm ────────────────────────────────────────────────
const wrongLabelsOf = (dto, labels) => labels.filter((l) => l !== dto.correctLabel);

export const revealHint = async (deps, ctx, { code, position }) =>
  withTransaction(async (tx) => {
    const q = tx.query.bind(tx);
    const session = await loadSession(q, ctx, code);
    const policy = policyFor(session);
    await assertOpen(tx, ctx, session);
    if (!policy.hints) throw new DomainError('HINTS_NOT_AVAILABLE', 'Hints are not available in this mode', undefined, 409);
    const item = await loadItem(q, session.id, position, { lock: true });
    if (item.status === 'answered') throw new DomainError('ITEM_ALREADY_ANSWERED', 'Item already answered', undefined, 409);
    const dto = await getQuestionDto({ itemId: item.itemId, questionId: item.questionId });
    const steps = [...dto.hints].sort((x, y) => x.stepNo - y.stepNo);
    const nonSolution = steps.filter((h) => h.kind !== 'solution');
    if (!steps.length) throw new DomainError('HINT_NONE_LEFT', 'No hints for this question', undefined, 409);
    const nextIdx = item.hintsRevealed;
    if (nextIdx >= nonSolution.length) {
      // Merdivenin son basamağı: çözüm
      const sol = await revealSolutionTx(tx, ctx, { session, policy, item, dto });
      return { step: { stepNo: steps.length, kind: 'solution', body: dto.hints.find((h) => h.kind === 'solution')?.body || null, eliminatesLabels: [] }, revealed: item.hintsRevealed, total: nonSolution.length, hasMore: false, solution: sol.solution, eliminatedLabels: item.eliminatedLabels, item: sol.item, progress: sol.progress };
    }
    const step = nonSolution[nextIdx];
    const eliminated = step.kind === 'eliminate' ? [...new Set([...item.eliminatedLabels, ...wrongLabelsOf(dto, step.eliminatesLabels)])] : item.eliminatedLabels;
    await q(
      `UPDATE learning.study_session_item SET study_session_item_hints_revealed = study_session_item_hints_revealed + 1, study_session_item_eliminated_labels=$2,
              study_session_item_first_seen_at=COALESCE(study_session_item_first_seen_at,$3), study_session_item_status = CASE WHEN study_session_item_status='pending' THEN 'seen' ELSE study_session_item_status END
        WHERE study_session_item_id=$1`, [item.id, eliminated, ctx.now]);
    const counters = await recomputeSessionCounters(tx, session.id);
    await touchSession(tx, session.id, ctx.now);
    ctx.after.push(() => invalidateToday(ctx.userId, ctx.today));
    const updated = { ...item, hintsRevealed: item.hintsRevealed + 1, eliminatedLabels: eliminated, status: item.status === 'pending' ? 'seen' : item.status };
    return {
      step: { stepNo: step.stepNo, kind: step.kind, body: step.body, eliminatesLabels: step.eliminatesLabels }, revealed: updated.hintsRevealed, total: nonSolution.length,
      hasMore: true, solution: null, eliminatedLabels: eliminated, item: itemState(updated, dto, policy, false), progress: sessionProgress({ ...session, ...counters }),
    };
  });

/** Çözümü aç: henüz bitmemiş maddeyi yanlış (çözümle) olarak kapatır. */
const revealSolutionTx = async (tx, ctx, { session, policy, item, dto }) => {
  const q = tx.query.bind(tx);
  let quotaInfo = null;
  let cur = item;
  if (item.status !== 'answered') {
    if (policy.quota && !item.meta?.quota) {
      const c = await consumeQuota({ userId: ctx.userId, feature: policy.quota, n: 1, tz: ctx.tz, now: ctx.now });
      quotaInfo = { feature: policy.quota, used: c.used, limit: c.limit };
    }
    let mistake = null;
    if (item.tries === 0) {
      const mast = policy.masteryTiming === 'immediate' ? await updateMastery(tx, ctx, { questionTypeId: dto.questionType.id, skills: dto.skills, difficulty: dto.difficulty, correct: false, hinted: true }) : null;
      const att = await recordAttempt(tx, ctx, { session, item, dto, selectedLabel: null, tryNo: 1, timeMs: 0, hintsRevealed: item.hintsRevealed, clientRef: null, countsForMastery: true, metadata: { viaSolution: true, ...(mast ? { skillDeltas: mast.skillDeltas, typeDelta: mast.typeDelta } : {}) } });
      if (policy.recordMistakes) mistake = await upsertMistake(tx, ctx, { itemId: item.itemId, questionTypeId: dto.questionType.id, attemptId: att.id, suggestedType: 'knowledge_gap' });
    }
    await q(
      `UPDATE learning.study_session_item SET study_session_item_status='answered', study_session_item_is_correct=false, study_session_item_solution_viewed=true, study_session_item_answered_at=$2,
              study_session_item_first_seen_at=COALESCE(study_session_item_first_seen_at,$2), study_session_item_metadata = study_session_item_metadata || $3::jsonb WHERE study_session_item_id=$1`,
      [item.id, ctx.now, JSON.stringify({ quota: item.meta?.quota || !!policy.quota })]);
    cur = { ...item, status: 'answered', isCorrect: false, solutionViewed: true };
    const act = await touchActivity(tx, ctx, { questionsAnswered: 1, correctAnswers: 0 });
    void act;
    if (mistake) cur.mistake = pubMistake(mistake);
  } else if (!item.solutionViewed) {
    await q('UPDATE learning.study_session_item SET study_session_item_solution_viewed=true WHERE study_session_item_id=$1', [item.id]);
    cur = { ...item, solutionViewed: true };
  }
  const counters = await recomputeSessionCounters(tx, session.id);
  await touchSession(tx, session.id, ctx.now);
  const sess = { ...session, ...counters };
  if (session.sourcePlanTaskId && counters.plannedItemCount) await setTaskProgress(tx, ctx, session.sourcePlanTaskId, (counters.answeredCount / counters.plannedItemCount) * 100);
  const catalog = await sessionCatalog(q, session);
  const noteLink = await noteLinkFor(q, dto, catalog);
  return { solution: solutionBlock(dto, noteLink), item: itemState(cur, dto, policy, false), progress: sessionProgress(sess), mistake: cur.mistake || null, quota: quotaInfo };
};

export const revealSolution = async (deps, ctx, { code, position }) => {
  let quotaTaken = null;
  try {
    return await withTransaction(async (tx) => {
      const q = tx.query.bind(tx);
      const session = await loadSession(q, ctx, code);
      const policy = policyFor(session);
      const finished = isFinished(session);
      if (!finished) {
        await assertOpen(tx, ctx, session);
        if (policy.feedback !== 'immediate') throw new DomainError('SOLUTION_NOT_AVAILABLE', 'Solution is shown after the session in this mode', undefined, 409);
      }
      const item = await loadItem(q, session.id, position, { lock: true });
      const dto = await getQuestionDto({ itemId: item.itemId, questionId: item.questionId });
      const nonSolution = dto.hints.filter((h) => h.kind !== 'solution');
      const allowed = finished || item.status === 'answered' || item.tries >= 1 || item.hintsRevealed >= nonSolution.length;
      if (!allowed) throw new DomainError('SOLUTION_NOT_AVAILABLE', 'Answer or use the hints first', undefined, 409);
      if (finished) {
        const catalog = await sessionCatalog(q, session);
        return { solution: solutionBlock(dto, await noteLinkFor(q, dto, catalog)), item: itemState(item, dto, policy, true), progress: sessionProgress(session), mistake: null, quota: null };
      }
      if (item.status !== 'answered' && policy.quota && !item.meta?.quota) quotaTaken = { feature: policy.quota };
      return await revealSolutionTx(tx, ctx, { session, policy, item, dto });
    });
  } catch (e) {
    if (quotaTaken) await refundQuota({ userId: ctx.userId, feature: quotaTaken.feature, n: 1, tz: ctx.tz, now: ctx.now }).catch(() => {});
    throw e;
  }
};

// ── Basit durum güncellemeleri ──────────────────────────────────────────────
export const setFlag = async (deps, ctx, { code, position, flagged }) => {
  const session = await loadSession(deps.rawQuery, ctx, code);
  if (isFinished(session)) throw new DomainError('SESSION_NOT_IN_PROGRESS', 'Session is finished', undefined, 409);
  const r = await deps.rawQuery(
    'UPDATE learning.study_session_item SET study_session_item_is_flagged=$3 WHERE study_session_item_study_session_id=$1 AND study_session_item_position=$2 RETURNING study_session_item_is_flagged AS flagged', [session.id, position, !!flagged]);
  if (!r.rows[0]) throw new DomainError('SESSION_ITEM_NOT_FOUND', 'Item not found', undefined, 404);
  return { position, isFlagged: r.rows[0].flagged };
};

export const setEliminated = async (deps, ctx, { code, position, labels }) => {
  const session = await loadSession(deps.rawQuery, ctx, code);
  if (isFinished(session)) throw new DomainError('SESSION_NOT_IN_PROGRESS', 'Session is finished', undefined, 409);
  const item = await loadItem(deps.rawQuery, session.id, position);
  const dto = await getQuestionDto({ itemId: item.itemId, questionId: item.questionId });
  const valid = [...new Set((labels || []).filter((l) => dto.options.some((o) => o.label === l)))];
  // Elenen şıkta seçili olan yok; doğru şık istemci tarafı elemesinde de kaydedilebilir (öğrencinin işareti), sunucu serbest bırakır.
  const merged = [...new Set([...valid, ...(item.hintsRevealed ? item.eliminatedLabels.filter((l) => dto.hints.some((h) => h.eliminatesLabels?.includes(l))) : [])])];
  await deps.rawQuery('UPDATE learning.study_session_item SET study_session_item_eliminated_labels=$3 WHERE study_session_item_study_session_id=$1 AND study_session_item_position=$2 AND study_session_item_status <> \'answered\'', [session.id, position, merged]);
  return { position, eliminatedLabels: merged };
};

export const MISTAKE_TYPES = ['knowledge_gap', 'attention', 'time', 'trap', 'vocabulary'];
export const setMistakeType = async (deps, ctx, { code, position, mistakeType }) => {
  if (!MISTAKE_TYPES.includes(mistakeType)) throw new DomainError('MISTAKE_TYPE_INVALID', 'Unknown mistake type', { allowed: MISTAKE_TYPES }, 400);
  const session = await loadSession(deps.rawQuery, ctx, code);
  const item = await loadItem(deps.rawQuery, session.id, position);
  const r = await deps.rawQuery('UPDATE learning.mistake SET mistake_mistake_type=$3 WHERE mistake_user_account_id=$1 AND mistake_item_id=$2 RETURNING mistake_code AS code', [ctx.userId, item.itemId, mistakeType]);
  if (!r.rows[0]) throw new DomainError('MISTAKE_NOT_FOUND', 'This question is not in your mistake notebook', undefined, 404);
  ctx.after.push(() => invalidateToday(ctx.userId, ctx.today));
  return { mistakeCode: Number(r.rows[0].code), mistakeType };
};

// ── Tamamla + sonuç ─────────────────────────────────────────────────────────
/**
 * Oturumu tamamla (idempotent). hooks.afterComplete(tx, ctx, { session, items }) → ek alan (ör. not kontrolü).
 * Genel etkiler: sayaçlar (bekleyenler boş), plan görevi, puan tahmini (practice), bugün önbelleği.
 */
export const completeSession = async (deps, ctx, { code, hooks = {} }) => {
  const done = await withTransaction(async (tx) => {
    const q = tx.query.bind(tx);
    const session = await loadSession(q, ctx, code, { lock: true });
    if (session.status === 'completed') return { already: true, session };
    if (!['in_progress', 'expired', 'paused'].includes(session.status)) throw new DomainError('SESSION_NOT_IN_PROGRESS', 'Session cannot be completed', { status: session.status }, 409);
    const counters = await recomputeSessionCounters(tx, session.id, { finalize: true });
    const items = await loadItems(q, session.id);
    const timeSec = Math.round(items.reduce((s, i) => s + i.timeSpentMs, 0) / 1000);
    const total = counters.plannedItemCount || 0;
    const score = session.kind === 'diagnostic' ? null : total ? Math.round((counters.correctCount / total) * 10000) / 100 : 0;
    await q(
      `UPDATE learning.study_session SET study_session_status='completed', study_session_ended_at=$2, study_session_last_activity_at=$2,
              study_session_active_seconds=GREATEST(study_session_active_seconds,$3), study_session_score=COALESCE($4, study_session_score)
        WHERE study_session_id=$1 AND study_session_status IN ('in_progress','expired','paused')`, [session.id, ctx.now, timeSec, score]);
    const full = { ...session, ...counters, status: 'completed', endedAt: ctx.now };
    let extra = null;
    if (full.sourcePlanTaskId) await completeTaskForSession(tx, ctx, full);
    if (session.kind === 'practice' && session.enrollmentId) {
      const catalog = await sessionCatalog(q, session);
      await maybeRefreshEstimate(tx, ctx, { enrollmentId: session.enrollmentId, catalog, sessionId: session.id, answered: counters.answeredCount });
    }
    if (hooks.afterComplete) extra = await hooks.afterComplete(tx, ctx, { session: full, items });
    ctx.after.push(() => invalidateToday(ctx.userId, ctx.today));
    return { already: false, session: full, extra };
  });
  return done;
};

/** Sonuç gövdesi (STUDY-12): doğruluk, süre, ipucu, ustalık değişimleri, hata listesi. */
export const buildResult = async (deps, ctx, { code }) => {
  const q = deps.rawQuery;
  const session = await loadSession(q, ctx, code);
  if (!['completed', 'expired'].includes(session.status)) throw new DomainError('SESSION_NOT_FINISHED', 'Session is still in progress', { status: session.status }, 409);
  const items = await loadItems(q, session.id);
  const dtoMap = await getQuestionDtosForPairs(items.map((i) => ({ itemId: i.itemId, questionId: i.questionId })));
  const { rows: att } = await q(
    `SELECT attempt_study_session_item_id AS "itemId", attempt_metadata AS meta FROM learning.attempt WHERE attempt_study_session_id=$1 AND attempt_counts_for_mastery AND attempt_try_no=1 ORDER BY attempt_answered_at, attempt_id`, [session.id]);
  const agg = (pick, keyOf) => {
    const m = new Map();
    for (const a of att) for (const d of pick(a.meta) || []) {
      const k = keyOf(d);
      const cur = m.get(k);
      if (!cur) m.set(k, { id: k, before: d.before, after: d.after, delta: d.after - d.before });
      else { cur.after = d.after; cur.delta = cur.after - cur.before; }
    }
    return m;
  };
  const skillAgg = agg((m) => m?.skillDeltas, (d) => d.skillId);
  const typeAgg = agg((m) => (m?.typeDelta ? [m.typeDelta] : []), (d) => d.questionTypeId);
  const names = skillAgg.size ? (await q('SELECT skill_id AS id, skill_key AS key, skill_name AS name FROM content.skill WHERE skill_id = ANY($1)', [[...skillAgg.keys()]])).rows : [];
  const tnames = typeAgg.size ? (await q('SELECT question_type_id AS id, question_type_key AS key, question_type_name AS name FROM content.question_type WHERE question_type_id = ANY($1)', [[...typeAgg.keys()]])).rows : [];
  const mistakeRows = (await q('SELECT mistake_item_id AS "itemId", mistake_code AS code, mistake_mistake_type AS "mistakeType", mistake_next_review_at AS "nextReviewAt", mistake_interval_days::float8 AS "intervalDays" FROM learning.mistake WHERE mistake_user_account_id=$1 AND mistake_item_id = ANY($2)', [ctx.userId, items.map((i) => i.itemId)])).rows;
  const mById = new Map(mistakeRows.map((m) => [Number(m.itemId), m]));
  const total = session.plannedItemCount;
  const timeMs = items.reduce((s, i) => s + i.timeSpentMs, 0);
  const rows = items.map((i) => {
    const d = dtoMap.get(i.questionId);
    const m = mById.get(i.itemId);
    return {
      position: i.position, itemCode: d?.itemCode || null, status: i.status, isCorrect: i.status === 'answered' ? !!i.isCorrect : null, selectedLabel: i.selectedLabel, correctLabel: d?.correctLabel || null,
      timeMs: i.timeSpentMs, hintsRevealed: i.hintsRevealed, solutionViewed: i.solutionViewed, isFlagged: i.isFlagged, tries: i.tries,
      typeKey: d?.questionType.key || null, typeName: d?.questionType.name || null, stemPreview: preview(d?.stem, 120),
      mistake: m && i.isCorrect !== true ? { code: Number(m.code), mistakeType: m.mistakeType, nextReviewAt: m.nextReviewAt ? new Date(m.nextReviewAt).toISOString() : null, intervalDays: m.intervalDays } : null,
    };
  });
  const pickNames = (list, id) => list.find((n) => Number(n.id) === Number(id)) || {};
  return {
    session: { code: session.code, kind: session.kind, mode: session.mode, status: session.status, startedAt: new Date(session.startedAt).toISOString(), endedAt: session.endedAt ? new Date(session.endedAt).toISOString() : null },
    totals: { total, correct: session.correctCount, wrong: session.wrongCount, blank: session.blankCount, accuracy: total ? round1((session.correctCount / total) * 100) : 0 },
    time: { totalSeconds: Math.round(timeMs / 1000), avgSecondsPerQuestion: total ? Math.round(timeMs / 1000 / total) : 0, activeSeconds: session.activeSeconds },
    hints: { used: session.hintsUsed, itemsWithHints: items.filter((i) => i.hintsRevealed > 0).length, solutionsViewed: items.filter((i) => i.solutionViewed).length },
    skillChanges: [...skillAgg.values()].map((v) => ({ skillKey: pickNames(names, v.id).key || null, name: pickNames(names, v.id).name || null, before: v.before, after: v.after, delta: Math.round(v.delta * 100) / 100 })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    typeChanges: [...typeAgg.values()].map((v) => ({ typeKey: pickNames(tnames, v.id).key || null, name: pickNames(tnames, v.id).name || null, before: v.before, after: v.after, delta: Math.round(v.delta * 100) / 100 })),
    items: rows,
    mistakes: rows.filter((r) => r.isCorrect !== true && r.status !== 'pending' || r.status === 'answered' && r.isCorrect === false),
    nextActions: {
      retryMistakes: session.wrongCount > 0, similar: { questionTypeKeys: session.config?.questionTypeKeys || [], skillKeys: session.config?.skillKeys || [], count: 10 },
      noteItemCode: session.config?.noteItemCode || null,
    },
    planTaskCode: null,
  };
};

export { num };
