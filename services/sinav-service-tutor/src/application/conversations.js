import { DomainError, peekUsage, getEntitlements } from 'app-shared';
import {
  MODES, CONTEXT_KINDS, REPORT_REASONS, requireCode, clip, tenantOf, userIdOf, orgIdOf, getPlatformOrgId, getUserTimezone,
} from '../shared/helpers.js';

const convNotFound = () => new DomainError('TUTOR_CONVERSATION_NOT_FOUND', 'Conversation not found');
const msgNotFound = () => new DomainError('TUTOR_MESSAGE_NOT_FOUND', 'Message not found');

export const CONV_SELECT = `
  c.conversation_id AS id, c.conversation_code AS code, c.conversation_title AS title, c.conversation_title_is_auto AS "titleIsAuto",
  c.conversation_mode AS mode, c.conversation_context_kind AS "contextKind", c.conversation_context_ref AS "contextRef",
  c.conversation_pinned_at AS "pinnedAt", c.conversation_last_message_at AS "lastMessageAt", c.conversation_message_count AS "messageCount",
  c.conversation_created_at AS "createdAt"`;

export const conversationDto = (r) => ({
  code: String(r.code),
  title: r.title,
  titleIsAuto: r.titleIsAuto,
  mode: r.mode,
  contextKind: r.contextKind,
  context: r.contextKind === 'none' ? null : {
    kind: r.contextKind, label: r.contextRef?.label || null,
    sessionCode: r.contextRef?.sessionCode || null, position: r.contextRef?.position ?? null, itemCode: r.contextRef?.itemCode || null,
  },
  pinned: !!r.pinnedAt,
  messageCount: r.messageCount,
  lastMessageAt: r.lastMessageAt,
  createdAt: r.createdAt,
  ...(r.lastMessagePreview !== undefined ? { lastMessagePreview: r.lastMessagePreview } : {}),
});

export const messageDto = (r) => ({
  code: String(r.code),
  role: r.role,
  status: r.status,
  content: r.content,
  blocks: r.blocks || [],
  sources: r.sources || [],
  preset: r.preset || null,
  needsExpertReview: !!r.needsExpertReview,
  errorCode: r.errorCode || null,
  feedback: r.isHelpful === null || r.isHelpful === undefined ? null : r.isHelpful,
  createdAt: r.createdAt,
  finishedAt: r.finishedAt || null,
});

export const makeConversations = ({ rawQuery, nowFn, context, llm }) => {
  const usageDto = (u) => ({ enabled: u.enabled, limit: u.limit, used: u.used, remaining: u.remaining, period: u.period, periodKey: u.periodKey });

  const getTutorUsage = async (caller) => {
    const userId = userIdOf(caller);
    const tz = await getUserTimezone(rawQuery, userId);
    return peekUsage({ userId, feature: 'tutor_messages_per_day', tz, now: nowFn() });
  };

  const ownConversation = async (caller, code) => {
    const c = requireCode(code, 'TUTOR_CONVERSATION_NOT_FOUND');
    const row = (await rawQuery(`SELECT ${CONV_SELECT} FROM tutor.conversation c WHERE c.conversation_code=$1 AND c.conversation_user_account_id=$2`, [c, userIdOf(caller)])).rows[0];
    if (!row) throw convNotFound();
    return row;
  };

  const overview = async ({ caller, limit = 30 }) => {
    const userId = userIdOf(caller);
    const lim = Math.min(100, Math.max(1, Number(limit) || 30));
    const { rows } = await rawQuery(
      `SELECT ${CONV_SELECT},
              (SELECT left(m.message_content, 120) FROM tutor.message m WHERE m.message_conversation_id = c.conversation_id AND m.message_content <> '' ORDER BY m.message_id DESC LIMIT 1) AS "lastMessagePreview"
         FROM tutor.conversation c WHERE c.conversation_user_account_id=$1
        ORDER BY (c.conversation_pinned_at IS NOT NULL) DESC, c.conversation_last_message_at DESC NULLS LAST, c.conversation_id DESC LIMIT $2`, [userId, lim]);
    const starters = (await rawQuery(
      `SELECT sp.starter_prompt_code AS code, sp.starter_prompt_mode AS mode, sp.starter_prompt_text AS text
         FROM tutor.starter_prompt sp
        WHERE sp.starter_prompt_is_active
          AND (sp.starter_prompt_exam_id IS NULL OR sp.starter_prompt_exam_id IN (
                SELECT t.exam_track_exam_id FROM learning.enrollment en JOIN content.exam_track t ON t.exam_track_id = en.enrollment_track_id
                 WHERE en.enrollment_user_account_id=$1 AND en.enrollment_is_active))
        ORDER BY sp.starter_prompt_sort_order, sp.starter_prompt_id LIMIT 12`, [userId])).rows.map((r) => ({ code: String(r.code), mode: r.mode, text: r.text }));
    const usage = await getTutorUsage(caller);
    const ent = await getEntitlements(userId);
    return { conversations: rows.map(conversationDto), starters, usage: usageDto(usage), tier: ent.tier, llmAvailable: llm.configured };
  };

  const usage = async ({ caller }) => {
    const userId = userIdOf(caller);
    const tz = await getUserTimezone(rawQuery, userId);
    const [t, e, ent] = await Promise.all([
      peekUsage({ userId, feature: 'tutor_messages_per_day', tz, now: nowFn() }),
      peekUsage({ userId, feature: 'translation_evals_per_day', tz, now: nowFn() }),
      getEntitlements(userId),
    ]);
    return { tier: ent.tier, tutorMessages: usageDto(t), translationEvals: usageDto(e) };
  };

  const create = async ({ caller, mode = 'free', context: ctx = {}, title }) => {
    if (!MODES.includes(mode)) throw new DomainError('TUTOR_MODE_INVALID', 'Unknown mode');
    if (!CONTEXT_KINDS.includes(ctx?.kind || 'none')) throw new DomainError('TUTOR_CONTEXT_INVALID', 'Unknown context kind');
    const resolved = await context.resolveForCreate(caller, ctx || {});
    const t = title ? clip(String(title).trim(), 120) : null;
    const { rows } = await rawQuery(
      `INSERT INTO tutor.conversation (conversation_tenant_code, conversation_organization_id, conversation_user_account_id, conversation_title, conversation_title_is_auto,
                                       conversation_mode, conversation_context_kind, conversation_context_item_id, conversation_context_ref, conversation_created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$3) RETURNING conversation_code AS code`,
      [tenantOf(caller), orgIdOf(caller), userIdOf(caller), t || (resolved.ref.label ? clip(resolved.ref.label, 120) : null), !t, mode, resolved.kind, resolved.itemId, JSON.stringify(resolved.ref)]);
    return conversationDto(await ownConversation(caller, rows[0].code));
  };

  const get = async ({ caller, code }) => {
    const conv = await ownConversation(caller, code);
    const { rows } = await rawQuery(
      `SELECT * FROM (
         SELECT m.message_code AS code, m.message_role AS role, m.message_status AS status, m.message_content AS content, m.message_blocks AS blocks, m.message_sources AS sources,
                m.message_preset AS preset, m.message_needs_expert_review AS "needsExpertReview", m.message_error_code AS "errorCode", m.message_created_at AS "createdAt",
                m.message_finished_at AS "finishedAt", m.message_id AS id,
                (SELECT f.message_feedback_is_helpful FROM tutor.message_feedback f WHERE f.message_feedback_message_id = m.message_id AND f.message_feedback_user_account_id = m.message_user_account_id) AS "isHelpful"
           FROM tutor.message m WHERE m.message_conversation_id=$1 AND m.message_role <> 'system' ORDER BY m.message_id DESC LIMIT 200) x ORDER BY id`, [conv.id]);
    const usageNow = await getTutorUsage(caller);
    return { conversation: conversationDto(conv), messages: rows.map(messageDto), usage: usageDto(usageNow) };
  };

  const update = async ({ caller, code, title, pinned }) => {
    const conv = await ownConversation(caller, code);
    const sets = []; const params = [conv.id, userIdOf(caller)];
    if (title !== undefined) {
      const t = clip(String(title ?? '').trim(), 120);
      if (!t) throw new DomainError('TUTOR_TITLE_INVALID', 'Title required');
      params.push(t); sets.push(`conversation_title=$${params.length}`, 'conversation_title_is_auto=false');
    }
    if (pinned !== undefined) sets.push(pinned ? 'conversation_pinned_at=now()' : 'conversation_pinned_at=NULL');
    if (!sets.length) throw new DomainError('TUTOR_UPDATE_EMPTY', 'Nothing to update');
    await rawQuery(`UPDATE tutor.conversation SET ${sets.join(', ')}, conversation_updated_by=$2, conversation_updated_at=now() WHERE conversation_id=$1`, params);
    return conversationDto(await ownConversation(caller, code));
  };

  const remove = async ({ caller, code }) => {
    const conv = await ownConversation(caller, code);
    await rawQuery(`DELETE FROM tutor.conversation WHERE conversation_id=$1`, [conv.id]);
    return { deleted: 1 };
  };

  const removeAll = async ({ caller }) => {
    const r = await rawQuery(`DELETE FROM tutor.conversation WHERE conversation_user_account_id=$1`, [userIdOf(caller)]);
    return { deleted: r.rowCount ?? 0 };
  };

  const ownAssistantMessage = async (caller, code) => {
    const c = requireCode(code, 'TUTOR_MESSAGE_NOT_FOUND');
    const row = (await rawQuery(
      `SELECT m.message_id AS id, m.message_code AS code, m.message_role AS role, m.message_status AS status, m.message_content AS content, m.message_blocks AS blocks,
              m.message_sources AS sources, m.message_conversation_id AS "conversationId", m.message_user_account_id AS "userId"
         FROM tutor.message m WHERE m.message_code=$1 AND m.message_user_account_id=$2`, [c, userIdOf(caller)])).rows[0];
    if (!row) throw msgNotFound();
    return row;
  };

  const feedback = async ({ caller, code, isHelpful }) => {
    if (typeof isHelpful !== 'boolean') throw new DomainError('TUTOR_FEEDBACK_INVALID', 'isHelpful boolean required');
    const m = await ownAssistantMessage(caller, code);
    if (m.role !== 'assistant') throw new DomainError('TUTOR_FEEDBACK_INVALID', 'Only assistant messages can be rated');
    await rawQuery(
      `INSERT INTO tutor.message_feedback (message_feedback_tenant_code, message_feedback_organization_id, message_feedback_message_id, message_feedback_user_account_id, message_feedback_is_helpful, message_feedback_created_by)
       VALUES ($1,$2,$3,$4,$5,$4)
       ON CONFLICT (message_feedback_message_id, message_feedback_user_account_id) DO UPDATE SET message_feedback_is_helpful=EXCLUDED.message_feedback_is_helpful, message_feedback_updated_at=now()`,
      [tenantOf(caller), orgIdOf(caller), m.id, userIdOf(caller), isHelpful]);
    return { isHelpful };
  };

  const report = async ({ caller, code, reason, note }) => {
    if (!REPORT_REASONS.includes(reason)) throw new DomainError('TUTOR_REPORT_REASON_INVALID', 'Unknown reason');
    const m = await ownAssistantMessage(caller, code);
    if (m.role !== 'assistant') throw new DomainError('TUTOR_REPORT_REASON_INVALID', 'Only assistant messages can be reported');
    const dup = await rawQuery(`SELECT 1 FROM tutor.message_report WHERE message_report_message_id=$1 AND message_report_reporter_user_account_id=$2 AND message_report_status IN ('open','in_review')`, [m.id, userIdOf(caller)]);
    if (dup.rows.length) throw new DomainError('TUTOR_REPORT_ALREADY_EXISTS', 'Already reported');
    const conv = (await rawQuery(`SELECT conversation_mode AS mode, conversation_context_kind AS kind, conversation_context_ref AS ref FROM tutor.conversation WHERE conversation_id=$1`, [m.conversationId])).rows[0];
    const prev = (await rawQuery(
      `SELECT message_content AS content FROM tutor.message WHERE message_conversation_id=$1 AND message_role='user' AND message_id < $2 ORDER BY message_id DESC LIMIT 1`, [m.conversationId, m.id])).rows[0];
    const snapshot = JSON.stringify({
      messageCode: String(m.code), mode: conv?.mode, context: conv?.kind === 'none' ? null : { kind: conv?.kind, label: conv?.ref?.label || null, itemCode: conv?.ref?.itemCode || null },
      userMessage: prev?.content || null, assistantMessage: m.content, blocks: m.blocks, sources: m.sources,
    });
    const platformOrg = (await getPlatformOrgId(rawQuery)) ?? orgIdOf(caller);
    const { rows } = await rawQuery(
      `INSERT INTO tutor.message_report (message_report_tenant_code, message_report_organization_id, message_report_reporter_organization_id, message_report_message_id,
                                         message_report_reporter_user_account_id, message_report_message_snapshot, message_report_reason, message_report_note, message_report_created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$5) RETURNING message_report_code AS code`,
      [tenantOf(caller), platformOrg, orgIdOf(caller), m.id, userIdOf(caller), snapshot, reason, note ? clip(String(note).trim(), 1000) : null]);
    await rawQuery(`UPDATE tutor.message SET message_needs_expert_review=true WHERE message_id=$1`, [m.id]);
    return { code: String(rows[0].code), status: 'open' };
  };

  return Object.freeze({ overview, usage, create, get, update, remove, removeAll, feedback, report, ownConversation, getTutorUsage, usageDto });
};
