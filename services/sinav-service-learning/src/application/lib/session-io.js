import { DomainError, getQuestionDtosForPairs, getTrackCatalog, getEntitlements, consumeQuota } from 'app-shared';
import { loadSession, loadItems, loadItem } from './attempts.js';
import { policyFor, sessionView, buildItemView, isFinished } from './session-engine.js';

/** Görev başlatıcı kayıt defteri: plan görevi türü → (deps, ctx, task, catalog) => yanıt. L2 modülleri kendi türünü kaydeder. */
const starters = new Map();
export const registerTaskStarter = (kind, fn) => starters.set(kind, fn);
export const taskStarterFor = (kind) => starters.get(kind) || null;

export const tierOf = async (userId) => (await getEntitlements(userId)).tier;
export const tiersFor = (tier) => (tier === 'premium' ? ['free', 'premium'] : ['free']);

export const loadBookmarkedItemIds = async (q, userId, itemIds) => {
  if (!itemIds.length) return new Set();
  const { rows } = await q('SELECT bookmark_item_id AS id FROM learning.bookmark WHERE bookmark_user_account_id=$1 AND bookmark_item_id = ANY($2)', [userId, itemIds]);
  return new Set(rows.map((r) => Number(r.id)));
};

/** Oturum özeti (madde listesi dahil; soru metni yok). */
export const getSessionView = async (deps, ctx, code) => {
  const q = deps.rawQuery;
  const session = await loadSession(q, ctx, code);
  const items = await loadItems(q, session.id);
  const policy = policyFor(session);
  const dtoMap = await getQuestionDtosForPairs(items.map((i) => ({ itemId: i.itemId, questionId: i.questionId })));
  const bookmarks = await loadBookmarkedItemIds(q, ctx.userId, items.map((i) => i.itemId));
  return { session, items, policy, dtoMap, view: sessionView({ session, items, policy, dtoMap, bookmarks }) };
};

/** Tek soru görünümü. Açık oturumda ilk görüşte `first_seen_at` işaretlenir. */
export const getItemView = async (deps, ctx, code, position, { markSeen = true } = {}) => {
  const q = deps.rawQuery;
  const session = await loadSession(q, ctx, code);
  const items = await loadItems(q, session.id);
  const item = items.find((i) => i.position === position) || (await loadItem(q, session.id, position));
  const policy = policyFor(session);
  const dtoMap = await getQuestionDtosForPairs(items.map((i) => ({ itemId: i.itemId, questionId: i.questionId })));
  const dto = dtoMap.get(item.questionId);
  if (!dto) throw new DomainError('QUESTION_UNAVAILABLE', 'Question is unavailable', undefined, 503);
  if (markSeen && session.status === 'in_progress' && item.status === 'pending') {
    await q("UPDATE learning.study_session_item SET study_session_item_status='seen', study_session_item_first_seen_at=COALESCE(study_session_item_first_seen_at,$2) WHERE study_session_item_id=$1 AND study_session_item_status='pending'", [item.id, ctx.now]);
    item.status = 'seen';
  }
  const bookmarks = await loadBookmarkedItemIds(q, ctx.userId, [item.itemId]);
  const view = buildItemView({ session, item, dto, policy, items, dtoMap });
  view.question.bookmarked = bookmarks.has(item.itemId);
  return { session, items, view, finished: isFinished(session) };
};

/** Oturumu duraklat / sürdür (süreli oturumlarda son tarih kaydırılır). */
export const setSessionPaused = async (deps, ctx, code, paused) => {
  const session = await loadSession(deps.rawQuery, ctx, code);
  if (paused) {
    if (session.status === 'paused') return { code: session.code, status: 'paused' };
    if (session.status !== 'in_progress') throw new DomainError('SESSION_NOT_IN_PROGRESS', 'Session is not in progress', { status: session.status }, 409);
    await deps.rawQuery("UPDATE learning.study_session SET study_session_status='paused', study_session_last_activity_at=$2, study_session_metadata = study_session_metadata || $3::jsonb WHERE study_session_id=$1 AND study_session_status='in_progress'",
      [session.id, ctx.now, JSON.stringify({ pausedAt: ctx.now.toISOString() })]);
    return { code: session.code, status: 'paused' };
  }
  if (session.status === 'in_progress') return { code: session.code, status: 'in_progress' };
  if (session.status !== 'paused') throw new DomainError('SESSION_NOT_IN_PROGRESS', 'Session cannot be resumed', { status: session.status }, 409);
  const cfg = session.config || {};
  let patch = {};
  if (cfg.deadlineAt) {
    const meta = (await deps.rawQuery('SELECT study_session_metadata AS m FROM learning.study_session WHERE study_session_id=$1', [session.id])).rows[0]?.m || {};
    const pausedMs = meta.pausedAt ? Math.max(0, ctx.now - new Date(meta.pausedAt)) : 0;
    patch = { ...cfg, deadlineAt: new Date(new Date(cfg.deadlineAt).getTime() + pausedMs).toISOString() };
  }
  await deps.rawQuery("UPDATE learning.study_session SET study_session_status='in_progress', study_session_last_activity_at=$2, study_session_config=$3::jsonb WHERE study_session_id=$1 AND study_session_status='paused'",
    [session.id, ctx.now, JSON.stringify(Object.keys(patch).length ? patch : cfg)]);
  return { code: session.code, status: 'in_progress' };
};

export const catalogForSession = async (q, session) => {
  if (!session.enrollmentId) return null;
  const { rows } = await q('SELECT enrollment_track_id AS "trackId" FROM learning.enrollment WHERE enrollment_id=$1', [session.enrollmentId]);
  return rows[0] ? getTrackCatalog({ trackId: Number(rows[0].trackId) }) : null;
};

export { consumeQuota };
