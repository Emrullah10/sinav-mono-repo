import { DomainError, withTransaction, peekUsage, expandSkillIds } from 'app-shared';
import { loadPublishedQuestions, toUnits, selectUnits, flattenUnits, insertSessionItems, targetDifficultyFor } from './questions.js';
import { loadMasteryMap } from './mastery.js';
import { tierOf, tiersFor } from './session-io.js';
import { clamp } from './util.js';

export const PRACTICE_MODES = ['learning', 'quick', 'timed', 'standard', 'relaxed'];
export const DIFFICULTIES = ['adaptive', 'easy', 'medium', 'hard'];
export const COUNT_OPTIONS = [5, 10, 15, 20, 30];
const DIFF_TARGET = { easy: 2, medium: 3, hard: 4.5 };

/** Mevcut açık oturum (aynı plan görevinden) varsa onu döndürür. */
export const findOpenSessionForTask = async (q, userId, taskId) => {
  const { rows } = await q(
    "SELECT study_session_code AS code, study_session_status AS status, study_session_kind AS kind FROM learning.study_session WHERE study_session_user_account_id=$1 AND study_session_source_plan_task_id=$2 AND study_session_status IN ('in_progress','paused') ORDER BY study_session_id DESC LIMIT 1", [userId, taskId]);
  return rows[0] ? { code: Number(rows[0].code), status: rows[0].status, kind: rows[0].kind } : null;
};

/**
 * Alıştırma oturumu kur. Havuz: iz içerik havuzu × erişim katmanı × tür/beceri filtresi.
 * @returns {{ code:number, count:number, cappedByQuota:boolean }}
 */
export const createPracticeSession = async (deps, ctx, a) => {
  const { enr, catalog } = a;
  const mode = a.mode || 'learning';
  if (!PRACTICE_MODES.includes(mode)) throw new DomainError('PRACTICE_INVALID', `mode must be one of ${PRACTICE_MODES.join(', ')}`, { field: 'mode' }, 400);
  const difficulty = a.difficulty || 'adaptive';
  if (!DIFFICULTIES.includes(difficulty)) throw new DomainError('PRACTICE_INVALID', `difficulty must be one of ${DIFFICULTIES.join(', ')}`, { field: 'difficulty' }, 400);
  let count = Math.round(Number(a.count ?? 10));
  if (!Number.isFinite(count) || count < 3 || count > 40) throw new DomainError('PRACTICE_INVALID', 'count must be between 3 and 40', { field: 'count' }, 400);

  const types = [];
  for (const k of a.questionTypeKeys || []) {
    const t = catalog.questionTypes.find((x) => x.key === k);
    if (!t) throw new DomainError('PRACTICE_INVALID', `Unknown question type: ${k}`, { field: 'questionTypeKeys', value: k }, 400);
    types.push(t);
  }
  let skillIds = [];
  const skillKeys = a.skillKeys || [];
  if (skillKeys.length) {
    const ids = [];
    for (const k of skillKeys) {
      const s = catalog.skills.find((x) => x.key === k);
      if (!s) throw new DomainError('PRACTICE_INVALID', `Unknown skill: ${k}`, { field: 'skillKeys', value: k }, 400);
      ids.push(s.id);
    }
    skillIds = expandSkillIds(catalog, ids);
  }
  const usage = await peekUsage({ userId: ctx.userId, feature: 'questions_per_day', tz: ctx.tz, now: ctx.now });
  if (usage.remaining !== null && usage.remaining !== undefined && usage.remaining <= 0) {
    throw new DomainError('QUOTA_EXCEEDED', 'Daily question limit reached', { feature: 'questions_per_day', limit: usage.limit, period: 'day' }, 402);
  }
  let cappedByQuota = false;
  if (usage.remaining !== null && usage.remaining !== undefined && count > usage.remaining) { count = Math.max(3, usage.remaining); cappedByQuota = true; }

  const tier = await tierOf(ctx.userId);
  const rows = await loadPublishedQuestions(deps.rawQuery, ctx.userId, {
    examIds: catalog.poolExamIds, typeIds: types.length ? types.map((t) => t.id) : undefined, skillIds: skillIds.length ? skillIds : undefined,
    tiers: tiersFor(tier), language: catalog.track.contentLanguage, itemIds: a.itemIds,
  });
  if (!rows.length) throw new DomainError('PRACTICE_NO_QUESTIONS', 'There are no questions for this selection yet', undefined, 404);
  const typeWeights = types.length ? null : new Map(catalog.sections.map((s) => [s.questionTypeId, s.questionCount]));
  let target = DIFF_TARGET[difficulty] || null;
  if (difficulty === 'adaptive') {
    const mm = await loadMasteryMap(deps.rawQuery, ctx.userId, 'type', types.length ? types.map((t) => t.id) : null);
    const vals = [...mm.values()].filter((v) => v.evidence >= 3).map((v) => v.mastery);
    target = vals.length ? targetDifficultyFor(vals.reduce((s, x) => s + x, 0) / vals.length) : 2.5;
  }
  const picked = flattenUnits(selectUnits(toUnits(rows), { count, typeWeights, targetDifficulty: target }));
  if (!picked.length) throw new DomainError('PRACTICE_NO_QUESTIONS', 'There are no questions for this selection yet', undefined, 404);

  const cfg = {
    questionTypeKeys: types.map((t) => t.key), skillKeys, difficulty, requestedCount: count, noteItemCode: a.noteItemCode || null,
  };
  if (mode === 'timed') {
    const perQ = types.length === 1 ? (catalog.sections.find((s) => s.questionTypeId === types[0].id)?.targetSecondsPerQuestion || types[0].defaultTargetSeconds || 75) : 75;
    cfg.timeLimitSeconds = Math.round(picked.length * perQ);
    cfg.deadlineAt = new Date(ctx.now.getTime() + cfg.timeLimitSeconds * 1000).toISOString();
  }
  const code = await withTransaction(async (tx) => {
    const { rows: r } = await tx.query(
      `INSERT INTO learning.study_session (study_session_tenant_code, study_session_organization_id, study_session_user_account_id, study_session_enrollment_id, study_session_kind, study_session_status,
          study_session_mode, study_session_source_plan_task_id, study_session_config, study_session_started_at, study_session_last_activity_at, study_session_planned_item_count)
       VALUES ($1,$2,$3,$4,$5,'in_progress',$6,$7,$8,$9,$9,$10) RETURNING study_session_id AS id, study_session_code AS code`,
      [ctx.tenantCode, ctx.orgId, ctx.userId, enr.id, a.kind || 'practice', mode, a.sourcePlanTaskId || null, JSON.stringify(cfg), ctx.now, picked.length]);
    await insertSessionItems(tx, ctx, Number(r[0].id), picked);
    return Number(r[0].code);
  });
  return { code, count: picked.length, cappedByQuota, mode, timeLimitSeconds: cfg.timeLimitSeconds || null };
};

export { clamp };
