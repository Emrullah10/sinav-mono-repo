import { DomainError } from 'app-shared';
import { loadBody } from './bodies.js';
import { num, iso, userRef, cacheGetJson, cacheSetJson, itemPubKey } from './helpers.js';

export const ITEM_SELECT = `
  SELECT i.item_id AS id, i.item_code AS code, i.item_kind AS kind, i.item_status AS status, i.item_language AS language, i.item_access_tier AS "accessTier",
         i.item_origin AS origin, i.item_title AS title, i.item_slug AS slug, i.item_external_ref AS "externalRef",
         i.item_latest_revision_id AS "latestRevisionId", i.item_published_revision_id AS "publishedRevisionId", i.item_published_at AS "publishedAt",
         i.item_retired_at AS "retiredAt", i.item_created_at AS "createdAt", i.item_updated_at AS "updatedAt", i.item_metadata AS metadata,
         i.item_organization_id AS "organizationId", i.item_tenant_code AS "tenantCode", sa.subject_area_key AS "subjectAreaKey"
    FROM content.item i LEFT JOIN content.subject_area sa ON sa.subject_area_id = i.item_subject_area_id`;

export const findItem = async (q, code, { kind = null, lock = false } = {}) => {
  const { rows } = await q(`${ITEM_SELECT} WHERE i.item_code = $1 ${lock ? 'FOR UPDATE OF i' : ''}`, [code]);
  if (!rows.length || (kind && rows[0].kind !== kind)) throw new DomainError('CONTENT_ITEM_NOT_FOUND', 'Content item not found');
  return rows[0];
};

const REVISION_SELECT = `
  SELECT r.item_revision_id AS id, r.item_revision_code AS code, r.item_revision_item_id AS "itemId", r.item_revision_revision_no AS "revisionNo",
         r.item_revision_review_status AS "reviewStatus",
         au.user_account_code AS "authorCode", au.user_account_display_name AS "authorName",
         asg.user_account_code AS "assignedCode", asg.user_account_display_name AS "assignedName",
         rv.user_account_code AS "reviewedByCode", rv.user_account_display_name AS "reviewedByName",
         r.item_revision_author_user_account_id AS "authorId", r.item_revision_reviewed_by AS "reviewedById",
         r.item_revision_submitted_at AS "submittedAt", r.item_revision_reviewed_at AS "reviewedAt", r.item_revision_decision_note AS "decisionNote",
         r.item_revision_change_note AS "changeNote", b.item_revision_revision_no AS "basedOnRevisionNo", gj.generation_job_code AS "generationJobCode",
         r.item_revision_snapshot AS snapshot, r.item_revision_created_at AS "createdAt", r.item_revision_updated_at AS "updatedAt",
         (SELECT count(*) FROM content.review_comment c WHERE c.review_comment_item_revision_id = r.item_revision_id AND c.review_comment_resolved_at IS NULL AND c.review_comment_parent_comment_id IS NULL) AS "openComments"
    FROM content.item_revision r
    LEFT JOIN identity.user_account au ON au.user_account_id = r.item_revision_author_user_account_id
    LEFT JOIN identity.user_account asg ON asg.user_account_id = r.item_revision_assigned_reviewer_id
    LEFT JOIN identity.user_account rv ON rv.user_account_id = r.item_revision_reviewed_by
    LEFT JOIN content.item_revision b ON b.item_revision_id = r.item_revision_based_on_revision_id
    LEFT JOIN content.generation_job gj ON gj.generation_job_id = r.item_revision_generation_job_id`;

export const findRevisionRow = async (q, { id = null, code = null, lock = false } = {}) => {
  const { rows } = await q(`${REVISION_SELECT} WHERE ${id ? 'r.item_revision_id = $1' : 'r.item_revision_code = $1'} ${lock ? 'FOR UPDATE OF r' : ''}`, [id || code]);
  return rows[0] || null;
};

export const EDITABLE = ['draft', 'changes_requested'];

export const revisionDto = (r, item, body) => ({
  code: Number(r.code),
  revisionNo: r.revisionNo,
  reviewStatus: r.reviewStatus,
  editable: EDITABLE.includes(r.reviewStatus) && item.status !== 'retired',
  author: userRef(r.authorCode, r.authorName),
  assignedReviewer: userRef(r.assignedCode, r.assignedName),
  reviewedBy: userRef(r.reviewedByCode, r.reviewedByName),
  submittedAt: iso(r.submittedAt),
  reviewedAt: iso(r.reviewedAt),
  decisionNote: r.decisionNote,
  changeNote: r.changeNote,
  basedOnRevisionNo: r.basedOnRevisionNo,
  generationJobCode: num(r.generationJobCode),
  openComments: Number(r.openComments || 0),
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
  ...(body !== undefined ? { body } : {}),
});

export const itemTags = async (q, itemId) => {
  const [ex, sk] = await Promise.all([
    q(`SELECT e.exam_key AS key FROM content.item_exam ie JOIN content.exam e ON e.exam_id = ie.item_exam_exam_id WHERE ie.item_exam_item_id = $1 ORDER BY e.exam_sort_order, e.exam_key`, [itemId]),
    q(`SELECT s.skill_key AS key, s.skill_name AS name, s.skill_path AS path, isk.item_skill_weight AS weight, isk.item_skill_is_primary AS "isPrimary"
         FROM content.item_skill isk JOIN content.skill s ON s.skill_id = isk.item_skill_skill_id WHERE isk.item_skill_item_id = $1 ORDER BY isk.item_skill_is_primary DESC, s.skill_path`, [itemId]),
  ]);
  return { examKeys: ex.rows.map((r) => r.key), skills: sk.rows.map((r) => ({ key: r.key, name: r.name, path: r.path, weight: Number(r.weight), isPrimary: r.isPrimary })) };
};

export const itemStat = async (q, itemId) => {
  const { rows } = await q(`SELECT * FROM content.item_stat WHERE item_stat_item_id = $1`, [itemId]);
  if (!rows.length) return null;
  const r = rows[0];
  return {
    attemptCount: r.item_stat_attempt_count, correctRate: r.item_stat_correct_rate === null ? null : Number(r.item_stat_correct_rate), avgTimeMs: r.item_stat_avg_time_ms,
    optionPickCounts: r.item_stat_option_pick_counts, hintUsageRate: r.item_stat_hint_usage_rate === null ? null : Number(r.item_stat_hint_usage_rate),
    reportCount: r.item_stat_report_count, discrimination: r.item_stat_discrimination === null ? null : Number(r.item_stat_discrimination), computedAt: iso(r.item_stat_computed_at),
  };
};

/** Bir passage kimliğine bağlı soru maddeleri (en son revizyonlarındaki passage_item_id üzerinden). */
export const passageChildren = async (q, passageItemId) => {
  const { rows } = await q(
    `SELECT i.item_code AS code, i.item_status AS status, i.item_title AS title, qu.question_group_position AS "groupPosition", qu.question_blank_no AS "blankNo",
            qt.question_type_key AS "questionTypeKey", r.item_revision_review_status AS "reviewStatus", left(qu.question_stem, 160) AS stem
       FROM content.question qu
       JOIN content.item_revision r ON r.item_revision_id = qu.question_item_revision_id
       JOIN content.item i ON i.item_id = r.item_revision_item_id AND i.item_latest_revision_id = r.item_revision_id
       JOIN content.question_type qt ON qt.question_type_id = qu.question_question_type_id
      WHERE qu.question_passage_item_id = $1 ORDER BY qu.question_group_position, qu.question_blank_no, i.item_id`, [passageItemId]);
  return rows.map((r) => ({ ...r, code: Number(r.code) }));
};

/** CMS'in düzenleyici için tam madde yanıtı. */
export const buildItemDto = async (q, item, { withRevisions = true } = {}) => {
  const [latestRow, pubRow, tags, stat] = await Promise.all([
    item.latestRevisionId ? findRevisionRow(q, { id: item.latestRevisionId }) : null,
    item.publishedRevisionId ? findRevisionRow(q, { id: item.publishedRevisionId }) : null,
    itemTags(q, item.id),
    itemStat(q, item.id),
  ]);
  const latestBody = latestRow ? await loadBody(q, item.kind, latestRow.id) : null;
  const pubBody = pubRow ? (pubRow.id === latestRow?.id ? latestBody : await loadBody(q, item.kind, pubRow.id)) : null;
  if (item.kind === 'passage') {
    const kids = await passageChildren(q, item.id);
    if (latestBody) latestBody.questions = kids;
    if (pubBody && pubBody !== latestBody) pubBody.questions = kids;
  }
  let revisions = [];
  if (withRevisions) {
    const { rows } = await q(`${REVISION_SELECT} WHERE r.item_revision_item_id = $1 ORDER BY r.item_revision_revision_no DESC`, [item.id]);
    revisions = rows.map((r) => revisionDto(r, item));
  }
  return {
    code: Number(item.code), kind: item.kind, status: item.status, title: item.title, slug: item.slug, language: item.language, accessTier: item.accessTier, origin: item.origin,
    externalRef: item.externalRef, subjectAreaKey: item.subjectAreaKey, checkQuestion: !!item.metadata?.checkQuestion, examKeys: tags.examKeys, skills: tags.skills,
    publishedAt: iso(item.publishedAt), retiredAt: iso(item.retiredAt), createdAt: iso(item.createdAt), updatedAt: iso(item.updatedAt),
    latestRevision: latestRow ? revisionDto(latestRow, item, latestBody) : null,
    publishedRevision: pubRow ? revisionDto(pubRow, item, pubBody) : null,
    body: latestBody,
    revisions,
    stat,
  };
};

/** Yayımlanmış maddenin tam DTO'su (doğru şık dahil; ham olarak istemciye gitmez). Redis 12, 24 sa. */
export const getPublishedItem = async (q, code) => {
  const cacheKey = itemPubKey(code);
  const hit = await cacheGetJson(cacheKey);
  if (hit !== undefined) return hit;
  const { rows } = await q(`${ITEM_SELECT} WHERE i.item_code = $1 AND i.item_status IN ('published','pilot') AND i.item_published_revision_id IS NOT NULL`, [code]);
  if (!rows.length) return null;
  const item = rows[0];
  const rev = await findRevisionRow(q, { id: item.publishedRevisionId });
  const [body, tags] = await Promise.all([loadBody(q, item.kind, item.publishedRevisionId), itemTags(q, item.id)]);
  const dto = {
    code: Number(item.code), kind: item.kind, title: item.title, slug: item.slug, language: item.language, accessTier: item.accessTier, subjectAreaKey: item.subjectAreaKey,
    examKeys: tags.examKeys, skills: tags.skills, publishedAt: iso(item.publishedAt), revisionCode: Number(rev.code), revisionNo: rev.revisionNo, body,
  };
  await cacheSetJson(cacheKey, dto, 24 * 3600);
  return dto;
};
