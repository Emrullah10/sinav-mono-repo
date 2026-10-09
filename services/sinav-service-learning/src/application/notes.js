import { DomainError, withTransaction, getPublishedNoteDto, getTrackCatalog } from 'app-shared';
import { withCtx } from './lib/ctx.js';
import { requireEnrollment, catalogOf } from './lib/enroll.js';
import { touchActivity } from './lib/activity.js';
import { completeTodayTaskOfKind } from './lib/plan-tasks.js';
import { boostSkills } from './lib/mastery.js';
import { insertSessionItems } from './lib/questions.js';
import { tierOf, getSessionView, loadBookmarkedItemIds } from './lib/session-io.js';
import { codeParam } from './lib/util.js';

export default (deps) => {
  const q = deps.rawQuery;

  const loadNote = async (itemCode, tier) => {
    const dto = await getPublishedNoteDto({ itemCode: codeParam(itemCode, 'itemCode') });
    if (!dto) throw new DomainError('NOTE_NOT_FOUND', 'Note not found', undefined, 404);
    if (dto.accessTier === 'premium' && tier !== 'premium') throw new DomainError('NOTE_LOCKED', 'This note is part of Premium', { itemCode: dto.itemCode }, 402);
    return dto;
  };

  const progressOf = async (userId, itemId) => {
    const { rows } = await q('SELECT note_progress_status AS status, note_progress_read_count AS "readCount", note_progress_best_check_score AS best, note_progress_first_read_at AS first, note_progress_last_read_at AS last, note_progress_understood_at AS understood FROM learning.note_progress WHERE note_progress_user_account_id=$1 AND note_progress_note_item_id=$2', [userId, itemId]);
    const r = rows[0];
    return r ? { status: r.status, readCount: r.readCount, bestCheckScore: r.best, firstReadAt: new Date(r.first).toISOString(), lastReadAt: new Date(r.last).toISOString(), understoodAt: r.understood ? new Date(r.understood).toISOString() : null } : null;
  };

  /** İlerleme + etkinlik + plan görevi (hap not görevi). */
  const markRead = ({ caller, itemCode, understood }) => withCtx(deps, caller, async (ctx) => {
    const tier = await tierOf(ctx.userId);
    const dto = await loadNote(itemCode, tier);
    const out = await withTransaction(async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO learning.note_progress (note_progress_tenant_code, note_progress_organization_id, note_progress_user_account_id, note_progress_note_item_id, note_progress_status,
            note_progress_first_read_at, note_progress_last_read_at, note_progress_understood_at)
         VALUES ($1,$2,$3,$4,$5,$6,$6,$7)
         ON CONFLICT (note_progress_user_account_id, note_progress_note_item_id) DO UPDATE SET
            note_progress_read_count = learning.note_progress.note_progress_read_count + 1, note_progress_last_read_at=$6,
            note_progress_status = CASE WHEN $5='understood' OR learning.note_progress.note_progress_status='understood' THEN 'understood' ELSE 'read' END,
            note_progress_understood_at = COALESCE(learning.note_progress.note_progress_understood_at, $7)
         RETURNING (xmax = 0) AS inserted`,
        [ctx.tenantCode, ctx.orgId, ctx.userId, dto.itemId, understood ? 'understood' : 'read', ctx.now, understood ? ctx.now : null]);
      const first = rows[0].inserted;
      const act = await touchActivity(tx, ctx, { notesRead: first ? 1 : 0 });
      const task = await completeTodayTaskOfKind(tx, ctx, 'note', { targetItemId: dto.itemId });
      return { first, goalJustMet: act.goalJustMet, milestone: act.milestone, planTaskCompleted: !!task };
    });
    return { itemCode: dto.itemCode, progress: await progressOf(ctx.userId, dto.itemId), firstRead: out.first, planTaskCompleted: out.planTaskCompleted, activity: { goalJustMet: out.goalJustMet, milestone: out.milestone } };
  });

  /** Kontrol soruları: not'a bağlı sorulardan note_check oturumu. */
  const startCheck = ({ caller, itemCode }) => withCtx(deps, caller, async (ctx) => {
    const tier = await tierOf(ctx.userId);
    const dto = await loadNote(itemCode, tier);
    if (!dto.checks.length) throw new DomainError('NOTE_NO_CHECKS', 'This note has no check questions', undefined, 404);
    const enr = await requireEnrollment(q, ctx.userId);
    const { rows: qs } = await q(
      `SELECT i.item_id AS "itemId", qn.question_id AS "questionId" FROM content.item i JOIN content.question qn ON qn.question_item_revision_id=i.item_published_revision_id
        WHERE i.item_id = ANY($1) AND i.item_status='published'`, [dto.checks.map((c) => c.itemId)]);
    const byItem = new Map(qs.map((r) => [Number(r.itemId), Number(r.questionId)]));
    const picks = dto.checks.filter((c) => byItem.has(c.itemId)).map((c) => ({ itemId: c.itemId, questionId: byItem.get(c.itemId) }));
    if (!picks.length) throw new DomainError('NOTE_NO_CHECKS', 'This note has no published check questions', undefined, 404);
    const code = await withTransaction(async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO learning.study_session (study_session_tenant_code, study_session_organization_id, study_session_user_account_id, study_session_enrollment_id, study_session_kind, study_session_status,
            study_session_mode, study_session_config, study_session_started_at, study_session_last_activity_at, study_session_planned_item_count)
         VALUES ($1,$2,$3,$4,'note_check','in_progress','learning',$5,$6,$6,$7) RETURNING study_session_id AS id, study_session_code AS code`,
        [ctx.tenantCode, ctx.orgId, ctx.userId, enr.id, JSON.stringify({ noteItemCode: dto.itemCode, noteItemId: dto.itemId, skillIds: dto.skills.map((s) => s.id) }), ctx.now, picks.length]);
      await insertSessionItems(tx, ctx, Number(rows[0].id), picks);
      return Number(rows[0].code);
    });
    return { code, session: (await getSessionView(deps, ctx, code)).view };
  });

  /** completeSession kancası: kontrol bitince not ilerlemesi ve ustalık bonusu. */
  const sessionHooks = () => ({
    afterComplete: async (tx, ctx, { session }) => {
      const cfg = session.config || {};
      if (!cfg.noteItemId) return null;
      const total = session.plannedItemCount || 0;
      const correct = session.correctCount || 0;
      const perfect = total > 0 && correct === total;
      await tx.query(
        `INSERT INTO learning.note_progress (note_progress_tenant_code, note_progress_organization_id, note_progress_user_account_id, note_progress_note_item_id, note_progress_status,
            note_progress_first_read_at, note_progress_last_read_at, note_progress_best_check_score, note_progress_last_check_session_id, note_progress_understood_at)
         VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9)
         ON CONFLICT (note_progress_user_account_id, note_progress_note_item_id) DO UPDATE SET
            note_progress_best_check_score = GREATEST(COALESCE(learning.note_progress.note_progress_best_check_score,0), $7), note_progress_last_check_session_id=$8,
            note_progress_status = CASE WHEN $5='understood' OR learning.note_progress.note_progress_status='understood' THEN 'understood' ELSE learning.note_progress.note_progress_status END,
            note_progress_understood_at = COALESCE(learning.note_progress.note_progress_understood_at, $9)`,
        [ctx.tenantCode, ctx.orgId, ctx.userId, cfg.noteItemId, perfect ? 'understood' : 'read', ctx.now, correct, session.id, perfect ? ctx.now : null]);
      if (perfect) await boostSkills(tx, ctx, cfg.skillIds || [], 2);
      return { noteItemCode: cfg.noteItemCode, correct, total, understood: perfect };
    },
  });

  // ── Yer imleri ──
  const bookmarkView = (r) => ({ code: Number(r.code), kind: r.kind, itemCode: r.itemCode ? Number(r.itemCode) : null, itemKind: r.itemKind || null, title: r.title || null, note: r.note, createdAt: new Date(r.createdAt).toISOString() });

  const addBookmark = ({ caller, itemCode, note }) => withCtx(deps, caller, async (ctx) => {
    const c = codeParam(itemCode, 'itemCode');
    const { rows: it } = await q("SELECT item_id AS id, item_kind AS kind FROM content.item WHERE item_code=$1 AND item_status='published'", [c]);
    if (!it[0]) throw new DomainError('BOOKMARK_ITEM_NOT_FOUND', 'Content not found', undefined, 404);
    const text = note === undefined || note === null ? null : String(note).slice(0, 300);
    const { rows } = await q(
      `INSERT INTO learning.bookmark (bookmark_tenant_code, bookmark_organization_id, bookmark_user_account_id, bookmark_kind, bookmark_item_id, bookmark_note)
       VALUES ($1,$2,$3,'content_item',$4,$5)
       ON CONFLICT ON CONSTRAINT uq_bookmark_user_account_id_item_id_tutor_message_code DO UPDATE SET bookmark_note = COALESCE(EXCLUDED.bookmark_note, learning.bookmark.bookmark_note)
       RETURNING bookmark_code AS code, bookmark_kind AS kind, bookmark_note AS note, bookmark_created_at AS "createdAt"`, [ctx.tenantCode, ctx.orgId, ctx.userId, it[0].id, text]);
    return bookmarkView({ ...rows[0], itemCode: c, itemKind: it[0].kind });
  });

  const removeBookmark = ({ caller, code }) => withCtx(deps, caller, async (ctx) => {
    const r = await q('DELETE FROM learning.bookmark WHERE bookmark_code=$1 AND bookmark_user_account_id=$2 RETURNING bookmark_code AS code', [codeParam(code), ctx.userId]);
    if (!r.rows[0]) throw new DomainError('BOOKMARK_NOT_FOUND', 'Bookmark not found', undefined, 404);
    return { removed: true };
  });

  const listBookmarks = ({ caller, query }) => withCtx(deps, caller, async (ctx) => {
    const page = Math.max(1, Number(query?.page) || 1);
    const size = Math.min(50, Math.max(1, Number(query?.pageSize) || 20));
    const { rows } = await q(
      `SELECT b.bookmark_code AS code, b.bookmark_kind AS kind, b.bookmark_note AS note, b.bookmark_created_at AS "createdAt", i.item_code AS "itemCode", i.item_kind AS "itemKind", i.item_title AS title, count(*) OVER()::int AS total
         FROM learning.bookmark b LEFT JOIN content.item i ON i.item_id=b.bookmark_item_id WHERE b.bookmark_user_account_id=$1 AND b.bookmark_kind='content_item'
        ORDER BY b.bookmark_created_at DESC LIMIT $2 OFFSET $3`, [ctx.userId, size, (page - 1) * size]);
    return { items: rows.map(bookmarkView), page, pageSize: size, total: rows[0]?.total || 0 };
  });

  void getTrackCatalog; void catalogOf; void loadBookmarkedItemIds;
  return Object.freeze({ markRead, startCheck, sessionHooks, addBookmark, removeBookmark, listBookmarks });
};
