import { DomainError, withTransaction, writeAudit } from 'app-shared';
import { loadBody } from '../shared/bodies.js';
import { num, iso, pageOf, reqCode, userRef } from '../shared/helpers.js';
import { findItem, findRevisionRow, revisionDto, buildItemDto, itemTags } from '../shared/item-read.js';

const DECISIONS = { approve: 'approved', request_changes: 'changes_requested', reject: 'rejected' };

// ── alan düzeyinde fark ──
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const flatten = (v, path, out) => {
  if (Array.isArray(v)) {
    if (!v.length) out[path] = [];
    v.forEach((x, i) => flatten(x, `${path}[${i}]`, out));
  } else if (isObj(v)) {
    const keys = Object.keys(v);
    if (!keys.length) out[path] = {};
    for (const k of keys) flatten(v[k], path ? `${path}.${k}` : k, out);
  } else out[path] = v === undefined ? null : v;
};
export const diffSnapshots = (oldSnap, newSnap) => {
  const a = {};
  const b = {};
  flatten(oldSnap || {}, '', a);
  flatten(newSnap || {}, '', b);
  const paths = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const changes = [];
  for (const p of paths) {
    const has = (o) => Object.prototype.hasOwnProperty.call(o, p);
    if (has(a) && !has(b)) changes.push({ path: p, kind: 'removed', old: a[p], new: null });
    else if (!has(a) && has(b)) changes.push({ path: p, kind: 'added', old: null, new: b[p] });
    else if (JSON.stringify(a[p]) !== JSON.stringify(b[p])) changes.push({ path: p, kind: 'changed', old: a[p], new: b[p] });
  }
  return changes;
};

export const makeCmsReview = ({ rawQuery, nowFn, items }) => {
  const userId = (caller) => Number(caller.callerUserId);

  const snapshotFor = async (q, item, rev) => {
    if (rev.snapshot && Object.keys(rev.snapshot).length) return rev.snapshot;
    const tags = await itemTags(q, item.id);
    return {
      title: item.title, slug: item.slug, language: item.language, accessTier: item.accessTier, subjectAreaKey: item.subjectAreaKey, examKeys: tags.examKeys,
      skills: tags.skills.map((s) => ({ key: s.key, weight: s.weight, isPrimary: s.isPrimary })), body: await loadBody(q, item.kind, rev.id),
    };
  };

  const loadRevision = async (code) => {
    const rev = await findRevisionRow(rawQuery, { code: reqCode(code, 'CONTENT_REVISION_NOT_FOUND', 'Revision not found') });
    if (!rev) throw new DomainError('CONTENT_REVISION_NOT_FOUND', 'Revision not found');
    const { rows } = await rawQuery(`SELECT item_code FROM content.item WHERE item_id = $1`, [rev.itemId]);
    const item = await findItem(rawQuery, Number(rows[0].item_code));
    return { rev, item };
  };

  // ── kuyruk ──
  const queue = async ({ caller, query = {} }) => {
    const { page, pageSize, offset } = pageOf(query);
    const where = [`r.item_revision_review_status = 'submitted'`];
    const params = [];
    const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
    const scope = query.assigned || 'me';
    if (scope === 'me') add('(r.item_revision_assigned_reviewer_id = ? OR r.item_revision_assigned_reviewer_id IS NULL)', userId(caller));
    else if (scope === 'mine_only') add('r.item_revision_assigned_reviewer_id = ?', userId(caller));
    else if (scope === 'unassigned') where.push('r.item_revision_assigned_reviewer_id IS NULL');
    if (query.kind) add('i.item_kind = ?', String(query.kind));
    if (query.priority) add('prio.p = ?', String(query.priority));
    const base = `
      FROM content.item_revision r JOIN content.item i ON i.item_id = r.item_revision_item_id
      LEFT JOIN identity.user_account au ON au.user_account_id = r.item_revision_author_user_account_id
      LEFT JOIN identity.user_account asg ON asg.user_account_id = r.item_revision_assigned_reviewer_id
      LEFT JOIN content.question qu ON qu.question_item_revision_id = r.item_revision_id
      LEFT JOIN content.passage pa ON pa.passage_item_revision_id = r.item_revision_id
      LEFT JOIN content.note nt ON nt.note_item_revision_id = r.item_revision_id
      LEFT JOIN content.vocab_entry ve ON ve.vocab_entry_item_revision_id = r.item_revision_id
      LEFT JOIN content.translation_prompt tp ON tp.translation_prompt_item_revision_id = r.item_revision_id
      LEFT JOIN content.exam_form ef ON ef.exam_form_item_revision_id = r.item_revision_id
      LEFT JOIN content.article ar ON ar.article_item_revision_id = r.item_revision_id
      CROSS JOIN LATERAL (SELECT count(*)::int AS n FROM content.content_report cr WHERE cr.content_report_item_id = i.item_id AND cr.content_report_status IN ('open','in_review')) rep
      CROSS JOIN LATERAL (SELECT CASE WHEN rep.n > 0 OR r.item_revision_submitted_at < now() - interval '48 hours' THEN 'high'
                                      WHEN r.item_revision_submitted_at < now() - interval '12 hours' OR i.item_published_revision_id IS NOT NULL THEN 'normal' ELSE 'low' END AS p) prio`;
    const [rows, total] = await Promise.all([
      rawQuery(
        `SELECT r.item_revision_code AS "revisionCode", r.item_revision_revision_no AS "revisionNo", r.item_revision_submitted_at AS "submittedAt", r.item_revision_change_note AS "changeNote",
                i.item_code AS "itemCode", i.item_kind AS kind, i.item_title AS title, i.item_access_tier AS "accessTier", i.item_origin AS origin, i.item_published_revision_id IS NOT NULL AS "isUpdate",
                COALESCE(left(qu.question_stem,160), left(pa.passage_body,160), nt.note_title, ve.vocab_entry_headword, left(tp.translation_prompt_source_text,160), ef.exam_form_title, ar.article_title, i.item_title) AS preview,
                au.user_account_code AS "authorCode", au.user_account_display_name AS "authorName", asg.user_account_code AS "assignedCode", asg.user_account_display_name AS "assignedName",
                rep.n AS "openReports", prio.p AS priority, EXTRACT(EPOCH FROM (now() - r.item_revision_submitted_at))::bigint AS "waitingSeconds",
                (SELECT count(*)::int FROM content.review_comment c WHERE c.review_comment_item_revision_id = r.item_revision_id AND c.review_comment_resolved_at IS NULL AND c.review_comment_parent_comment_id IS NULL) AS "openComments"
         ${base} WHERE ${where.join(' AND ')}
         ORDER BY CASE prio.p WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, r.item_revision_submitted_at ASC LIMIT ${pageSize} OFFSET ${offset}`, params),
      rawQuery(`SELECT count(*)::int AS n ${base} WHERE ${where.join(' AND ')}`, params),
    ]);
    return {
      items: rows.rows.map((r) => ({
        revisionCode: Number(r.revisionCode), revisionNo: r.revisionNo, itemCode: Number(r.itemCode), kind: r.kind, title: r.title, preview: r.preview, accessTier: r.accessTier, origin: r.origin,
        isUpdate: r.isUpdate, changeNote: r.changeNote, author: userRef(r.authorCode, r.authorName), assignedReviewer: userRef(r.assignedCode, r.assignedName), priority: r.priority,
        submittedAt: iso(r.submittedAt), waitingSeconds: Number(r.waitingSeconds), openReports: r.openReports, openComments: r.openComments,
      })),
      page, pageSize, total: total.rows[0].n,
    };
  };

  const assign = async ({ caller, code, reviewerCode }) => {
    const { rev, item } = await loadRevision(code);
    if (rev.reviewStatus !== 'submitted') throw new DomainError('CONTENT_REVISION_NOT_PENDING', 'Revision is not waiting for review');
    let reviewerId = null;
    if (reviewerCode && reviewerCode !== 'me') {
      const u = await rawQuery(`SELECT user_account_id AS id FROM identity.user_account WHERE user_account_code = $1`, [Number(reviewerCode)]);
      if (!u.rows.length) throw new DomainError('CONTENT_TAXONOMY_UNKNOWN', 'Unknown reviewer', { field: 'reviewerCode' });
      reviewerId = u.rows[0].id;
    } else if (reviewerCode === 'me') reviewerId = userId(caller);
    await rawQuery(`UPDATE content.item_revision SET item_revision_assigned_reviewer_id = $2, item_revision_updated_by = $3 WHERE item_revision_id = $1`, [rev.id, reviewerId, userId(caller)]);
    return getRevision({ code, caller });
  };

  // ── revizyon ──
  const getRevision = async ({ code }) => {
    const { rev, item } = await loadRevision(code);
    const body = await loadBody(rawQuery, item.kind, rev.id);
    const dto = await buildItemDto(rawQuery, item, { withRevisions: false });
    return {
      revision: revisionDto(rev, item, body),
      item: { code: dto.code, kind: dto.kind, status: dto.status, title: dto.title, slug: dto.slug, language: dto.language, accessTier: dto.accessTier, examKeys: dto.examKeys, skills: dto.skills, subjectAreaKey: dto.subjectAreaKey },
      body,
      isPublished: item.publishedRevisionId === rev.id,
    };
  };

  const diff = async ({ code, against }) => {
    const { rev, item } = await loadRevision(code);
    let base = null;
    if (against) {
      base = await findRevisionRow(rawQuery, { code: reqCode(against, 'CONTENT_REVISION_NOT_FOUND') });
      if (!base || base.itemId !== rev.itemId) throw new DomainError('CONTENT_REVISION_NOT_FOUND', 'Comparison revision not found for this item');
    } else {
      const { rows } = await rawQuery(
        `SELECT item_revision_id AS id FROM content.item_revision WHERE item_revision_item_id = $1 AND item_revision_id <> $2 AND item_revision_revision_no < $3
            AND item_revision_review_status IN ('approved','superseded') ORDER BY item_revision_revision_no DESC LIMIT 1`, [rev.itemId, rev.id, rev.revisionNo]);
      if (rows.length) base = await findRevisionRow(rawQuery, { id: rows[0].id });
    }
    const newSnap = await snapshotFor(rawQuery, item, rev);
    const oldSnap = base ? await (async () => { const it = item; return snapshotFor(rawQuery, it, base); })() : null;
    return {
      revision: { code: Number(rev.code), revisionNo: rev.revisionNo },
      against: base ? { code: Number(base.code), revisionNo: base.revisionNo } : null,
      isNew: !base,
      changes: base ? diffSnapshots(oldSnap, newSnap) : diffSnapshots({}, newSnap),
    };
  };

  // ── yorumlar ──
  const listComments = async ({ code }) => {
    const { rev } = await loadRevision(code);
    const { rows } = await rawQuery(
      `SELECT c.review_comment_code AS code, c.review_comment_body AS body, c.review_comment_anchor AS anchor, c.review_comment_resolved_at AS "resolvedAt", c.review_comment_created_at AS "createdAt",
              p.review_comment_code AS "parentCode", au.user_account_code AS "authorCode", au.user_account_display_name AS "authorName", rb.user_account_code AS "resolvedByCode", rb.user_account_display_name AS "resolvedByName"
         FROM content.review_comment c LEFT JOIN content.review_comment p ON p.review_comment_id = c.review_comment_parent_comment_id
         LEFT JOIN identity.user_account au ON au.user_account_id = c.review_comment_author_user_account_id LEFT JOIN identity.user_account rb ON rb.user_account_id = c.review_comment_resolved_by
        WHERE c.review_comment_item_revision_id = $1 ORDER BY c.review_comment_created_at, c.review_comment_id`, [rev.id]);
    return {
      items: rows.map((r) => ({
        code: Number(r.code), parentCode: num(r.parentCode), body: r.body, anchor: r.anchor, author: userRef(r.authorCode, r.authorName), resolved: !!r.resolvedAt, resolvedAt: iso(r.resolvedAt),
        resolvedBy: userRef(r.resolvedByCode, r.resolvedByName), createdAt: iso(r.createdAt),
      })),
      openCount: rows.filter((r) => !r.resolvedAt && !r.parentCode).length,
    };
  };

  const addComment = async ({ caller, code, body, anchor = null, parentCode = null }) => {
    if (!String(body || '').trim()) throw new DomainError('CONTENT_COMMENT_INVALID', 'body is required');
    const { rev } = await loadRevision(code);
    let parentId = null;
    if (parentCode) {
      const p = await rawQuery(`SELECT review_comment_id AS id FROM content.review_comment WHERE review_comment_code = $1 AND review_comment_item_revision_id = $2`, [Number(parentCode), rev.id]);
      if (!p.rows.length) throw new DomainError('CONTENT_COMMENT_NOT_FOUND', 'Parent comment not found');
      parentId = p.rows[0].id;
    }
    const { rows } = await rawQuery(
      `INSERT INTO content.review_comment (review_comment_tenant_code, review_comment_organization_id, review_comment_item_revision_id, review_comment_author_user_account_id, review_comment_parent_comment_id,
              review_comment_body, review_comment_anchor, review_comment_created_by, review_comment_updated_by)
       SELECT item_revision_tenant_code, item_revision_organization_id, item_revision_id, $2, $3, $4, $5, $2, $2 FROM content.item_revision WHERE item_revision_id = $1 RETURNING review_comment_code AS code`,
      [rev.id, userId(caller), parentId, String(body).trim(), anchor ? JSON.stringify(anchor) : null]);
    return { code: Number(rows[0].code) };
  };

  const resolveComment = async ({ caller, commentCode, resolved = true }) => {
    const r = await rawQuery(
      `UPDATE content.review_comment SET review_comment_resolved_at = CASE WHEN $2 THEN $3::timestamptz ELSE NULL END, review_comment_resolved_by = CASE WHEN $2 THEN $4::bigint ELSE NULL END, review_comment_updated_by = $4
        WHERE review_comment_code = $1 RETURNING review_comment_code AS code, review_comment_resolved_at AS "resolvedAt"`, [reqCode(commentCode, 'CONTENT_COMMENT_NOT_FOUND', 'Comment not found'), !!resolved, nowFn(), userId(caller)]);
    if (!r.rows.length) throw new DomainError('CONTENT_COMMENT_NOT_FOUND', 'Comment not found');
    return { code: Number(r.rows[0].code), resolved: !!r.rows[0].resolvedAt };
  };

  // ── karar ──
  const decide = async ({ caller, code, decision, note = null }) => {
    const target = DECISIONS[decision];
    if (!target) throw new DomainError('CONTENT_DECISION_INVALID', 'decision must be approve|request_changes|reject');
    if (target !== 'approved' && !String(note || '').trim()) throw new DomainError('CONTENT_DECISION_INVALID', 'note is required when requesting changes or rejecting', { field: 'note' });
    const uid = userId(caller);
    const { rev: pre, item: preItem } = await loadRevision(code);
    let published = null;
    try {
      await withTransaction(async (tx) => {
        const q = (s, p) => tx.query(s, p);
        const item = await findItem(q, Number(preItem.code), { lock: true });
        const rev = await findRevisionRow(q, { id: pre.id, lock: true });
        if (rev.reviewStatus !== 'submitted') throw new DomainError('CONTENT_REVISION_NOT_PENDING', 'Revision is not waiting for review', { reviewStatus: rev.reviewStatus });
        if (target === 'approved' && rev.authorId && Number(rev.authorId) === uid) throw new DomainError('CONTENT_REVIEW_SELF_APPROVAL', 'You cannot approve your own content');
        // Asıl bekçi: chk_item_revision_four_eyes (yukarıdaki ön kontrol yalnız onay içindir).
        await q(
          `UPDATE content.item_revision SET item_revision_review_status = $2, item_revision_reviewed_by = $3, item_revision_reviewed_at = $4, item_revision_decision_note = $5, item_revision_updated_by = $3
            WHERE item_revision_id = $1`, [rev.id, target, uid, nowFn(), note]);
        if (target === 'approved') {
          if (item.publishedRevisionId && item.publishedRevisionId !== rev.id) {
            await q(`UPDATE content.item_revision SET item_revision_review_status = 'superseded' WHERE item_revision_id = $1`, [item.publishedRevisionId]);
          }
          await q(`UPDATE content.item SET item_published_revision_id = $2, item_published_at = $3, item_status = 'published', item_retired_at = NULL, item_updated_by = $4 WHERE item_id = $1`, [item.id, rev.id, nowFn(), uid]);
          published = { item, previousRevisionId: item.publishedRevisionId };
        } else {
          const status = item.publishedRevisionId ? item.status : 'draft';
          await q(`UPDATE content.item SET item_status = $2, item_updated_by = $3 WHERE item_id = $1`, [item.id, status, uid]);
        }
      });
    } catch (e) {
      if (e?.code === '23514' && /four_eyes/.test(`${e.constraint || ''}${e.message || ''}`)) throw new DomainError('CONTENT_REVIEW_SELF_APPROVAL', 'You cannot review your own content');
      throw e;
    }
    if (published) {
      const fresh = await findItem(rawQuery, Number(preItem.code));
      await items.dropCaches(rawQuery, { ...fresh, code: preItem.code, language: fresh.language }, [published.previousRevisionId]);
    }
    const item = await findItem(rawQuery, Number(preItem.code));
    await writeAudit({ caller, action: `content.revision.${decision}`, schema: 'content', table: 'item_revision', entityCode: Number(pre.code), after: { itemCode: Number(item.code), status: item.status, note } });
    return { revision: revisionDto(await findRevisionRow(rawQuery, { id: pre.id }), item), item: await buildItemDto(rawQuery, item, { withRevisions: false }) };
  };

  return Object.freeze({ queue, assign, getRevision, diff, listComments, addComment, resolveComment, decide });
};
