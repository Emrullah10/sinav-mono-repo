import { DomainError, withTransaction, peekUsage, expandSkillIds } from 'app-shared';
import { withCtx } from './lib/ctx.js';
import { requireEnrollment, catalogOf } from './lib/enroll.js';
import { loadMasteryMap, loadChange7d, levelOf } from './lib/mastery.js';
import { countDueMistakes } from './lib/mistakes.js';
import { createPracticeSession, findOpenSessionForTask, PRACTICE_MODES, DIFFICULTIES, COUNT_OPTIONS } from './lib/practice.js';
import {
  getSessionView, getItemView, setSessionPaused, registerTaskStarter, tierOf, tiersFor, catalogForSession,
} from './lib/session-io.js';
import {
  submitAnswer, revealHint, revealSolution, setFlag, setEliminated, setMistakeType, completeSession, buildResult, isFinished,
} from './lib/session-engine.js';
import { loadSession } from './lib/attempts.js';
import { codeParam, intParam, round2, clientRefParam } from './lib/util.js';

const masteryRow = (m, change) => ({
  mastery: m ? Math.round(m.mastery * 10) / 10 : 0, evidence: m?.evidence || 0, confidence: m?.confidence || 0, level: levelOf(m?.mastery || 0, m?.evidence || 0),
  change7d: change === undefined ? null : change,
});

export default (deps) => {
  const q = deps.rawQuery;

  const noteProgressMap = async (userId, itemIds) => {
    if (!itemIds.length) return new Map();
    const { rows } = await q('SELECT note_progress_note_item_id AS id, note_progress_status AS status, note_progress_best_check_score AS best FROM learning.note_progress WHERE note_progress_user_account_id=$1 AND note_progress_note_item_id = ANY($2)', [userId, itemIds]);
    return new Map(rows.map((r) => [Number(r.id), { status: r.status, bestCheckScore: r.best }]));
  };

  const overview = ({ caller }) => withCtx(deps, caller, async (ctx) => {
    const enr = await requireEnrollment(q, ctx.userId);
    const catalog = await catalogOf(enr);
    const tm = await loadMasteryMap(q, ctx.userId, 'type');
    const ch = await loadChange7d(q, ctx.userId, 'type', ctx.today, tm);
    const types = catalog.sections.map((s) => {
      const t = catalog.questionTypes.find((x) => x.id === s.questionTypeId);
      return {
        key: t.key, name: t.name, shortName: t.shortName, iconKey: t.iconKey, format: t.format, questionCountInExam: s.questionCount,
        ...masteryRow(tm.get(t.id), ch.get(t.id)),
      };
    });
    const { rows: m } = await q("SELECT count(*) FILTER (WHERE mistake_status='open')::int AS open FROM learning.mistake WHERE mistake_user_account_id=$1", [ctx.userId]);
    const { rows: c } = await q("SELECT count(*) FILTER (WHERE card_due_at <= $2 AND card_suspended_at IS NULL)::int AS due, count(*)::int AS total FROM learning.card WHERE card_user_account_id=$1", [ctx.userId, ctx.now]);
    const weakest = [...types].filter((t) => t.evidence >= 3).sort((a, b) => a.mastery - b.mastery)[0] || null;
    return {
      types, vocab: { dueCards: c[0].due, totalCards: c[0].total }, mistakes: { open: m[0].open, due: await countDueMistakes(q, ctx.userId, ctx.now) },
      recommendedTypeKey: weakest?.key || null,
    };
  });

  const questionType = ({ caller, key }) => withCtx(deps, caller, async (ctx) => {
    const enr = await requireEnrollment(q, ctx.userId);
    const catalog = await catalogOf(enr);
    const t = catalog.questionTypes.find((x) => x.key === key);
    if (!t) throw new DomainError('QUESTION_TYPE_NOT_FOUND', 'Question type not found', undefined, 404);
    const sec = catalog.sections.find((s) => s.questionTypeId === t.id);
    const tm = await loadMasteryMap(q, ctx.userId, 'type', [t.id]);
    const tch = await loadChange7d(q, ctx.userId, 'type', ctx.today, tm);
    const skillIds = catalog.questionTypeSkills.filter((x) => x.questionTypeId === t.id).map((x) => x.skillId);
    const sm = await loadMasteryMap(q, ctx.userId, 'skill', skillIds.length ? skillIds : [0]);
    const sch = await loadChange7d(q, ctx.userId, 'skill', ctx.today, sm);
    const skills = skillIds.map((id) => catalog.skills.find((s) => s.id === id)).filter(Boolean)
      .map((s) => ({ key: s.key, name: s.name, ...masteryRow(sm.get(s.id), sch.get(s.id)) }));
    const { rows: mi } = await q("SELECT count(*) FILTER (WHERE mistake_status='open')::int AS open FROM learning.mistake WHERE mistake_user_account_id=$1 AND mistake_question_type_id=$2", [ctx.userId, t.id]);
    let strategyNote = null;
    if (t.strategyNoteItemId) {
      const { rows } = await q("SELECT i.item_code AS code, n.note_title AS title, n.note_summary AS summary, n.note_reading_seconds AS seconds, i.item_access_tier AS tier FROM content.item i JOIN content.note n ON n.note_item_revision_id=i.item_published_revision_id WHERE i.item_id=$1 AND i.item_status='published'", [t.strategyNoteItemId]);
      if (rows[0]) {
        const np = await noteProgressMap(ctx.userId, [t.strategyNoteItemId]);
        strategyNote = { itemCode: Number(rows[0].code), title: rows[0].title, summary: rows[0].summary, readingSeconds: rows[0].seconds, accessTier: rows[0].tier, progress: np.get(t.strategyNoteItemId)?.status || null };
      }
    }
    const tiers = tiersFor(await tierOf(ctx.userId));
    const { rows: avail } = await q(
      `SELECT count(*)::int AS n FROM content.item i JOIN content.question qn ON qn.question_item_revision_id=i.item_published_revision_id
        WHERE i.item_kind='question' AND i.item_status='published' AND qn.question_question_type_id=$1 AND i.item_access_tier = ANY($2) AND i.item_language=$3`, [t.id, tiers, catalog.track.contentLanguage]);
    return {
      type: { key: t.key, name: t.name, shortName: t.shortName, iconKey: t.iconKey, format: t.format, description: t.description, questionCountInExam: sec?.questionCount || 0, targetSecondsPerQuestion: sec?.targetSecondsPerQuestion || t.defaultTargetSeconds },
      ...masteryRow(tm.get(t.id), tch.get(t.id)), skills, openMistakes: mi[0].open, strategyNote, availableQuestions: avail[0].n,
    };
  });

  const skill = ({ caller, key }) => withCtx(deps, caller, async (ctx) => {
    const enr = await requireEnrollment(q, ctx.userId);
    const catalog = await catalogOf(enr);
    const s = catalog.skills.find((x) => x.key === key);
    if (!s) throw new DomainError('SKILL_NOT_FOUND', 'Skill not found', undefined, 404);
    const ids = expandSkillIds(catalog, [s.id]);
    const sm = await loadMasteryMap(q, ctx.userId, 'skill', ids);
    const sch = await loadChange7d(q, ctx.userId, 'skill', ctx.today, sm);
    const tiers = tiersFor(await tierOf(ctx.userId));
    const { rows: notes } = await q(
      `SELECT DISTINCT i.item_id AS id, i.item_code AS code, n.note_title AS title, n.note_summary AS summary, n.note_reading_seconds AS seconds, n.note_note_kind AS kind, i.item_access_tier AS tier
         FROM content.item_skill sk JOIN content.item i ON i.item_id=sk.item_skill_item_id JOIN content.note n ON n.note_item_revision_id=i.item_published_revision_id
        WHERE sk.item_skill_skill_id = ANY($1) AND i.item_kind='note' AND i.item_status='published' ORDER BY n.note_title`, [ids]);
    const np = await noteProgressMap(ctx.userId, notes.map((n) => Number(n.id)));
    const { rows: qc } = await q(
      `SELECT count(DISTINCT i.item_id)::int AS n FROM content.item_skill sk JOIN content.item i ON i.item_id=sk.item_skill_item_id
        WHERE sk.item_skill_skill_id = ANY($1) AND i.item_kind='question' AND i.item_status='published' AND i.item_access_tier = ANY($2)`, [ids, tiers]);
    const parent = s.parentId ? catalog.skills.find((x) => x.id === s.parentId) : null;
    const children = catalog.skills.filter((x) => x.parentId === s.id).map((c) => ({ key: c.key, name: c.name, ...masteryRow(sm.get(c.id), sch.get(c.id)) }));
    const typeKeys = catalog.questionTypeSkills.filter((x) => ids.includes(x.skillId)).map((x) => catalog.questionTypes.find((t) => t.id === x.questionTypeId)?.key).filter(Boolean);
    return {
      skill: { key: s.key, name: s.name, path: s.path, description: s.description, parent: parent ? { key: parent.key, name: parent.name } : null },
      ...masteryRow(sm.get(s.id), sch.get(s.id)), children, questionTypeKeys: [...new Set(typeKeys)], availableQuestions: qc[0].n,
      notes: notes.map((n) => ({ itemCode: Number(n.code), title: n.title, summary: n.summary, readingSeconds: n.seconds, kind: n.kind, accessTier: n.tier, locked: n.tier === 'premium' && !tiers.includes('premium'), progress: np.get(Number(n.id))?.status || null, bestCheckScore: np.get(Number(n.id))?.bestCheckScore ?? null })),
    };
  });

  const practiceOptions = ({ caller }) => withCtx(deps, caller, async (ctx) => {
    const enr = await requireEnrollment(q, ctx.userId);
    const catalog = await catalogOf(enr);
    const usage = await peekUsage({ userId: ctx.userId, feature: 'questions_per_day', tz: ctx.tz, now: ctx.now });
    const tm = await loadMasteryMap(q, ctx.userId, 'type');
    const topSkills = catalog.skills.filter((s) => s.depth >= 1);
    return {
      types: catalog.sections.map((sec) => { const t = catalog.questionTypes.find((x) => x.id === sec.questionTypeId); return { key: t.key, name: t.name, iconKey: t.iconKey, ...masteryRow(tm.get(t.id)) }; }),
      skills: topSkills.map((s) => ({ key: s.key, name: s.name, path: s.path, depth: s.depth })),
      counts: COUNT_OPTIONS, modes: PRACTICE_MODES, difficulties: DIFFICULTIES, defaults: { count: 10, mode: 'learning', difficulty: 'adaptive' },
      usage: { used: usage.used, limit: usage.limit, remaining: usage.remaining },
    };
  });

  const create = ({ caller, questionTypeKeys, skillKeys, count, mode, difficulty, noteItemCode }) => withCtx(deps, caller, async (ctx) => {
    const enr = await requireEnrollment(q, ctx.userId);
    const catalog = await catalogOf(enr);
    const out = await createPracticeSession(deps, ctx, { enr, catalog, questionTypeKeys, skillKeys, count, mode, difficulty, noteItemCode });
    const s = await getSessionView(deps, ctx, out.code);
    return { ...out, session: s.view };
  });

  // ── Oturum uçları (practice / note_check / diagnostic / error_review / mock_exam ortak) ──
  const getSession = ({ caller, code }) => withCtx(deps, caller, async (ctx) => (await getSessionView(deps, ctx, codeParam(code))).view);

  const getItem = ({ caller, code, position }) => withCtx(deps, caller, async (ctx) => {
    const { view } = await getItemView(deps, ctx, codeParam(code), intParam(position, { name: 'position' }));
    return view;
  });

  const answer = ({ caller, code, position, selectedLabel, timeMs, clientRef }) => withCtx(deps, caller, async (ctx) => {
    const c = codeParam(code);
    const res = await submitAnswer(deps, ctx, { code: c, position: intParam(position, { name: 'position' }), selectedLabel: selectedLabel ?? null, timeMs, clientRef: clientRefParam(clientRef) });
    return res;
  });

  const flag = ({ caller, code, position, flagged }) => withCtx(deps, caller, (ctx) => setFlag(deps, ctx, { code: codeParam(code), position: intParam(position, { name: 'position' }), flagged: flagged !== false }));
  const eliminate = ({ caller, code, position, labels }) => withCtx(deps, caller, (ctx) => setEliminated(deps, ctx, { code: codeParam(code), position: intParam(position, { name: 'position' }), labels: Array.isArray(labels) ? labels : [] }));
  const hint = ({ caller, code, position }) => withCtx(deps, caller, (ctx) => revealHint(deps, ctx, { code: codeParam(code), position: intParam(position, { name: 'position' }) }));
  const solution = ({ caller, code, position }) => withCtx(deps, caller, (ctx) => revealSolution(deps, ctx, { code: codeParam(code), position: intParam(position, { name: 'position' }) }));
  const mistakeType = ({ caller, code, position, mistakeType: mt }) => withCtx(deps, caller, (ctx) => setMistakeType(deps, ctx, { code: codeParam(code), position: intParam(position, { name: 'position' }), mistakeType: mt }));
  const pause = ({ caller, code }) => withCtx(deps, caller, (ctx) => setSessionPaused(deps, ctx, codeParam(code), true));
  const resume = ({ caller, code }) => withCtx(deps, caller, (ctx) => setSessionPaused(deps, ctx, codeParam(code), false));

  const complete = ({ caller, code }) => withCtx(deps, caller, async (ctx) => {
    const c = codeParam(code);
    const hooks = deps.uc.notes?.sessionHooks ? deps.uc.notes.sessionHooks() : {};
    const s = await loadSession(q, ctx, c);
    if (s.kind === 'vocab_review' || s.kind === 'mock_exam') throw new DomainError('SESSION_KIND_UNSUPPORTED', 'Use the dedicated endpoint for this session type', { kind: s.kind }, 409);
    const done = await completeSession(deps, ctx, { code: c, hooks: s.kind === 'note_check' ? hooks : {} });
    const result = await buildResult(deps, ctx, { code: c });
    return { already: done.already, result, extra: done.extra || null };
  });

  const result = ({ caller, code }) => withCtx(deps, caller, (ctx) => buildResult(deps, ctx, { code: codeParam(code) }));

  const current = ({ caller }) => withCtx(deps, caller, async (ctx) => {
    const { rows } = await q("SELECT study_session_code AS code, study_session_kind AS kind, study_session_status AS status, study_session_started_at AS \"startedAt\" FROM learning.study_session WHERE study_session_user_account_id=$1 AND study_session_status IN ('in_progress','paused') ORDER BY study_session_last_activity_at DESC NULLS LAST LIMIT 5", [ctx.userId]);
    return { sessions: rows.map((r) => ({ code: Number(r.code), kind: r.kind, status: r.status, startedAt: new Date(r.startedAt).toISOString() })) };
  });

  void isFinished; void catalogForSession; void withTransaction; void round2;
  return Object.freeze({ overview, questionType, skill, practiceOptions, create, getSession, getItem, answer, flag, eliminate, hint, solution, mistakeType, pause, resume, complete, result, current });
};

// Plan görevi başlatıcıları (practice, diagnostic, note)
registerTaskStarter('practice', async (deps, ctx, task, catalog, enr) => {
  const open = await findOpenSessionForTask(deps.rawQuery, ctx.userId, task.id);
  if (open) return { session: { code: open.code, kind: open.kind, resumed: true } };
  const p = task.params || {};
  const out = await createPracticeSession(deps, ctx, { enr, catalog, questionTypeKeys: p.questionTypeKeys, skillKeys: p.skillKeys, count: p.count, mode: p.mode || 'learning', difficulty: p.difficulty === 'adaptive' ? 'adaptive' : p.difficulty, sourcePlanTaskId: task.id });
  return { session: { code: out.code, kind: 'practice', resumed: false, count: out.count, cappedByQuota: out.cappedByQuota } };
});
registerTaskStarter('diagnostic', async (deps, ctx) => {
  const r = await deps.uc.diagnostic.start({ caller: { callerUserId: ctx.userId } });
  return { session: { code: r.session.code, kind: 'diagnostic', resumed: r.resumed } };
});
registerTaskStarter('note', async (deps, ctx, task) => ({ note: { itemCode: task.params?.itemCode || null, title: task.params?.title || null } }));
registerTaskStarter('translation', async (deps, ctx, task) => ({ translation: { direction: task.params?.direction || 'en-tr', service: 'tutor' } }));
