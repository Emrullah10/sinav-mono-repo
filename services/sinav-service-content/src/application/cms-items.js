import { DomainError, withTransaction, writeAudit } from 'app-shared';
import { normalizeBody, validateBody, replaceBody, loadBody, titleFromBody, KINDS } from '../shared/bodies.js';
import {
  num, iso, asArray, pageOf, like, trunc, slugify, normalizeHeadword, getPlatform, reqCode, cacheDel, itemPubKeys, vocabKey, bumpCatalogVersion, assertAnyPerm, PERM, userRef,
} from '../shared/helpers.js';
import { findItem, buildItemDto, findRevisionRow, EDITABLE, itemTags } from '../shared/item-read.js';

const STATUSES = ['draft', 'in_review', 'pilot', 'published', 'retired'];
const TIERS = ['free', 'premium'];

export const makeCmsItems = ({ rawQuery, nowFn }) => {
  const ctxOf = async (caller) => {
    const p = await getPlatform(rawQuery);
    return { tenantCode: p.tenantCode, organizationId: p.organizationId, userId: Number(caller.callerUserId) };
  };
  const audit = (caller, action, item, extra = {}) =>
    writeAudit({ caller, action, schema: 'content', table: 'item', entityCode: Number(item.code), after: { status: item.status, kind: item.kind, ...extra } });

  const unknown = (field, value) => new DomainError('CONTENT_TAXONOMY_UNKNOWN', `Unknown ${field}: ${value}`, { field, value });

  // ── etiketler ──
  const setTags = async (q, ctx, itemId, { examKeys, skills }) => {
    if (examKeys) {
      await q(`DELETE FROM content.item_exam WHERE item_exam_item_id = $1`, [itemId]);
      for (const key of [...new Set(asArray(examKeys))]) {
        const r = await q(`SELECT exam_id AS id FROM content.exam WHERE exam_key = $1 AND exam_tenant_code = $2`, [key, ctx.tenantCode]);
        if (!r.rows.length) throw unknown('examKeys', key);
        await q(
          `INSERT INTO content.item_exam (item_exam_tenant_code, item_exam_organization_id, item_exam_item_id, item_exam_exam_id, item_exam_created_by, item_exam_updated_by) VALUES ($1,$2,$3,$4,$5,$5)`,
          [ctx.tenantCode, ctx.organizationId, itemId, r.rows[0].id, ctx.userId]);
      }
    }
    if (skills) {
      await q(`DELETE FROM content.item_skill WHERE item_skill_item_id = $1`, [itemId]);
      const list = (Array.isArray(skills) ? skills : asArray(skills)).map((s) => (typeof s === 'string' ? { key: s } : s));
      const seen = new Set();
      const primaryIdx = list.findIndex((s) => s.isPrimary);
      let i = 0;
      for (const s of list) {
        if (!s.key || seen.has(s.key)) { i += 1; continue; }
        seen.add(s.key);
        const r = await q(`SELECT skill_id AS id FROM content.skill WHERE skill_key = $1 AND skill_tenant_code = $2`, [s.key, ctx.tenantCode]);
        if (!r.rows.length) throw unknown('skills', s.key);
        const weight = s.weight === undefined ? 1 : Number(s.weight);
        if (!(weight > 0 && weight <= 1)) throw new DomainError('CONTENT_BODY_INVALID', 'skill weight must be in (0,1]', { field: 'skills.weight' });
        const isPrimary = primaryIdx === -1 ? i === 0 : i === primaryIdx;
        await q(
          `INSERT INTO content.item_skill (item_skill_tenant_code, item_skill_organization_id, item_skill_item_id, item_skill_skill_id, item_skill_weight, item_skill_is_primary, item_skill_created_by, item_skill_updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`, [ctx.tenantCode, ctx.organizationId, itemId, r.rows[0].id, weight, isPrimary, ctx.userId]);
        i += 1;
      }
    }
  };

  const subjectAreaId = async (q, ctx, key) => {
    if (key === undefined) return undefined;
    if (!key) return null;
    const r = await q(`SELECT subject_area_id AS id FROM content.subject_area WHERE subject_area_key = $1 AND subject_area_tenant_code = $2`, [key, ctx.tenantCode]);
    if (!r.rows.length) throw unknown('subjectAreaKey', key);
    return r.rows[0].id;
  };

  const uniqueSlug = async (q, ctx, kind, base, excludeId = null) => {
    let slug = base;
    for (let n = 2; n < 50; n += 1) {
      const r = await q(`SELECT 1 FROM content.item WHERE item_tenant_code=$1 AND item_kind=$2 AND item_slug=$3 AND ($4::bigint IS NULL OR item_id <> $4)`, [ctx.tenantCode, kind, slug, excludeId]);
      if (!r.rows.length) return slug;
      slug = `${base}-${n}`;
    }
    return `${base}-${Date.now()}`;
  };

  const assertVocabUnique = async (q, ctx, body, excludeItemId = null) => {
    const norm = normalizeHeadword(body.headword);
    if (!norm) return;
    const r = await q(
      `SELECT i.item_code AS code FROM content.vocab_entry v JOIN content.item_revision r ON r.item_revision_id = v.vocab_entry_item_revision_id
         JOIN content.item i ON i.item_id = r.item_revision_item_id AND i.item_status <> 'retired'
          AND r.item_revision_id IN (i.item_latest_revision_id, i.item_published_revision_id)
        WHERE v.vocab_entry_headword_normalized = $1 AND v.vocab_entry_part_of_speech = $2 AND i.item_tenant_code = $3 AND ($4::bigint IS NULL OR i.item_id <> $4) LIMIT 1`,
      [norm, body.partOfSpeech, ctx.tenantCode, excludeItemId]);
    if (r.rows.length) throw new DomainError('CONTENT_VOCAB_DUPLICATE', 'A vocab entry with this headword and part of speech already exists', { itemCode: Number(r.rows[0].code) }, 409);
  };

  const insertRevision = async (q, ctx, item, { revisionNo, basedOn = null, changeNote = null, generationJobId = null }) => {
    const r = await q(
      `INSERT INTO content.item_revision (item_revision_tenant_code, item_revision_organization_id, item_revision_item_id, item_revision_revision_no, item_revision_review_status,
              item_revision_author_user_account_id, item_revision_change_note, item_revision_based_on_revision_id, item_revision_generation_job_id, item_revision_created_by, item_revision_updated_by)
       VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$5,$5) RETURNING item_revision_id AS id`,
      [ctx.tenantCode, ctx.organizationId, item.id, revisionNo, ctx.userId, changeNote, basedOn, generationJobId]);
    return r.rows[0].id;
  };

  /** Tek kayıt oluşturma yolu (CMS, yapay zekâ üretimi ve alt sorular aynı yolu kullanır). */
  const createInTx = async (tx, ctx, caller, input) => {
    const q = (s, p) => tx.query(s, p);
    const kind = input.kind;
    if (!KINDS.includes(kind)) throw new DomainError('CONTENT_KIND_INVALID', `kind must be one of ${KINDS.join(', ')}`);
    const origin = input.origin || 'manual';
    const accessTier = input.accessTier || 'free';
    if (!TIERS.includes(accessTier)) throw new DomainError('CONTENT_BODY_INVALID', 'accessTier must be free|premium', { field: 'accessTier' });
    const body = normalizeBody(kind, input.body);
    if (kind === 'vocab_entry') await assertVocabUnique(q, ctx, body);
    const autoTitle = !input.title;
    const title = String(input.title || titleFromBody(kind, body, `${kind} draft`)).slice(0, 300);
    let slug = input.slug ? slugify(input.slug) : null;
    if (!slug && kind === 'article') slug = slugify(title);
    if (slug) {
      const clash = await q(`SELECT 1 FROM content.item WHERE item_tenant_code=$1 AND item_kind=$2 AND item_slug=$3`, [ctx.tenantCode, kind, slug]);
      if (clash.rows.length) {
        if (input.slug) throw new DomainError('CONTENT_SLUG_CONFLICT', 'Slug already in use', { slug });
        slug = await uniqueSlug(q, ctx, kind, slug);
      }
    }
    const saId = (await subjectAreaId(q, ctx, input.subjectAreaKey)) ?? null;
    const metadata = { ...(input.checkQuestion ? { checkQuestion: true } : {}), ...(autoTitle ? { autoTitle: true } : {}) };
    const ir = await q(
      `INSERT INTO content.item (item_tenant_code, item_organization_id, item_kind, item_status, item_language, item_subject_area_id, item_access_tier, item_origin, item_title, item_slug, item_external_ref, item_metadata, item_created_by, item_updated_by)
       VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING item_id AS id, item_code AS code`,
      [ctx.tenantCode, ctx.organizationId, kind, input.language || 'en', saId, accessTier, origin, title, slug, input.externalRef || null, JSON.stringify(metadata), ctx.userId]);
    const item = { id: ir.rows[0].id, code: Number(ir.rows[0].code), kind };
    const revId = await insertRevision(q, ctx, item, { revisionNo: 1, changeNote: input.changeNote || null, generationJobId: input.generationJobId || null });
    await replaceBody(q, ctx, kind, revId, body);
    await q(`UPDATE content.item SET item_latest_revision_id = $2 WHERE item_id = $1`, [item.id, revId]);
    await setTags(q, ctx, item.id, { examKeys: input.examKeys, skills: input.skills });
    const children = [];
    if (kind === 'passage' && Array.isArray(input.body?.questions)) {
      let pos = 1;
      for (const child of input.body.questions) {
        const c = await createInTx(tx, ctx, caller, {
          kind: 'question', origin, accessTier: child.accessTier || accessTier, language: input.language, subjectAreaKey: input.subjectAreaKey,
          examKeys: child.examKeys || input.examKeys, skills: child.skills || input.skills, generationJobId: input.generationJobId,
          body: { ...(child.body || child), passageItemCode: item.code, groupPosition: child.groupPosition || (child.body || {}).groupPosition || pos },
        });
        children.push(c.code);
        pos += 1;
      }
    }
    return { id: item.id, code: item.code, kind, revisionId: revId, children };
  };

  const createItem = async ({ caller, ...input }) => {
    const ctx = await ctxOf(caller);
    const created = await withTransaction((tx) => createInTx(tx, ctx, caller, input));
    const item = await findItem(rawQuery, created.code);
    await audit(caller, 'content.item.create', item, { origin: item.origin });
    return buildItemDto(rawQuery, item);
  };

  const getItem = async ({ code }) => {
    const item = await findItem(rawQuery, reqCode(code));
    return buildItemDto(rawQuery, item);
  };

  const updateDraft = async ({ caller, code, ...input }) => {
    const ctx = await ctxOf(caller);
    const itemCode = reqCode(code);
    await withTransaction(async (tx) => {
      const q = (s, p) => tx.query(s, p);
      const item = await findItem(q, itemCode, { lock: true });
      if (item.status === 'retired') throw new DomainError('CONTENT_ITEM_RETIRED', 'Item is retired', undefined, 409);
      const rev = await findRevisionRow(q, { id: item.latestRevisionId, lock: true });
      if (!rev || !EDITABLE.includes(rev.reviewStatus)) throw new DomainError('CONTENT_REVISION_NOT_EDITABLE', 'Latest revision is not editable; create a new revision first', { reviewStatus: rev?.reviewStatus });
      const sets = [];
      const params = [item.id];
      const push = (col, v) => { params.push(v); sets.push(`${col} = $${params.length}`); };
      let meta = { ...(item.metadata || {}) };
      let body;
      if (input.body !== undefined) {
        const existing = await loadBody(q, item.kind, rev.id);
        const merged = { ...existing, ...input.body };
        if (item.kind === 'passage' && input.body.questions === undefined) delete merged.questions;
        body = normalizeBody(item.kind, merged);
        if (item.kind === 'vocab_entry') await assertVocabUnique(q, ctx, body, item.id);
        await replaceBody(q, ctx, item.kind, rev.id, body);
        if (item.metadata?.autoTitle && input.title === undefined) push('item_title', titleFromBody(item.kind, body, item.title).slice(0, 300));
      }
      if (input.title !== undefined) { push('item_title', String(input.title).slice(0, 300)); delete meta.autoTitle; }
      if (input.language !== undefined) push('item_language', input.language);
      if (input.accessTier !== undefined) {
        if (!TIERS.includes(input.accessTier)) throw new DomainError('CONTENT_BODY_INVALID', 'accessTier must be free|premium', { field: 'accessTier' });
        push('item_access_tier', input.accessTier);
      }
      if (input.subjectAreaKey !== undefined) push('item_subject_area_id', await subjectAreaId(q, ctx, input.subjectAreaKey));
      if (input.slug !== undefined) {
        const slug = input.slug ? slugify(input.slug) : null;
        if (slug) {
          const clash = await q(`SELECT 1 FROM content.item WHERE item_tenant_code=$1 AND item_kind=$2 AND item_slug=$3 AND item_id <> $4`, [ctx.tenantCode, item.kind, slug, item.id]);
          if (clash.rows.length) throw new DomainError('CONTENT_SLUG_CONFLICT', 'Slug already in use', { slug });
        }
        push('item_slug', slug);
      }
      if (input.checkQuestion !== undefined) meta = input.checkQuestion ? { ...meta, checkQuestion: true } : Object.fromEntries(Object.entries(meta).filter(([k]) => k !== 'checkQuestion'));
      push('item_metadata', JSON.stringify(meta));
      push('item_updated_by', ctx.userId);
      await q(`UPDATE content.item SET ${sets.join(', ')} WHERE item_id = $1`, params);
      await setTags(q, ctx, item.id, { examKeys: input.examKeys, skills: input.skills });
      await q(`UPDATE content.item_revision SET item_revision_change_note = COALESCE($2, item_revision_change_note), item_revision_updated_by = $3 WHERE item_revision_id = $1`, [rev.id, input.changeNote ?? null, ctx.userId]);
      // Alt sorular (okuma metni): kodu olan taslağı güncellenir, kodu olmayan yeni soru olur.
      if (item.kind === 'passage' && Array.isArray(input.body?.questions)) {
        let pos = 1;
        for (const child of input.body.questions) {
          const cb = child.body || child;
          if (child.code || child.itemCode) {
            const cItem = await findItem(q, Number(child.code || child.itemCode), { kind: 'question', lock: true });
            const cRev = await findRevisionRow(q, { id: cItem.latestRevisionId, lock: true });
            if (cRev && EDITABLE.includes(cRev.reviewStatus) && child.body) {
              const merged = normalizeBody('question', { ...(await loadBody(q, 'question', cRev.id)), ...cb, passageItemCode: item.code });
              await replaceBody(q, ctx, 'question', cRev.id, merged);
            }
          } else {
            await createInTx(tx, ctx, caller, {
              kind: 'question', origin: item.origin, accessTier: item.accessTier, language: item.language, subjectAreaKey: item.subjectAreaKey,
              examKeys: child.examKeys || (await itemTags(q, item.id)).examKeys, skills: child.skills, body: { ...cb, passageItemCode: item.code, groupPosition: cb.groupPosition || pos },
            });
          }
          pos += 1;
        }
      }
    });
    const item = await findItem(rawQuery, itemCode);
    await audit(caller, 'content.item.update_draft', item);
    return buildItemDto(rawQuery, item);
  };

  // ── benzer soru (pg_trgm) ──
  const similar = async ({ code, stem, limit = 10, minSimilarity = 0.4 }) => {
    let text = stem;
    let excludeId = null;
    let kind = 'question';
    if (code !== 'new') {
      const item = await findItem(rawQuery, reqCode(code));
      excludeId = item.id;
      kind = item.kind;
      if (!text && item.latestRevisionId) {
        const body = await loadBody(rawQuery, item.kind, item.latestRevisionId);
        text = item.kind === 'question' ? body.stem : item.kind === 'vocab_entry' ? body.headword : item.title;
      }
    }
    if (!text || String(text).trim().length < 8) return { items: [] };
    if (kind !== 'question') {
      const { rows } = await rawQuery(
        `SELECT i.item_code AS code, i.item_status AS status, i.item_title AS title, similarity(i.item_title, $1) AS sim FROM content.item i
          WHERE i.item_kind = $2 AND i.item_title % $1 AND ($3::bigint IS NULL OR i.item_id <> $3) AND i.item_status <> 'retired' ORDER BY sim DESC LIMIT $4`, [text, kind, excludeId, limit]);
      return { items: rows.map((r) => ({ itemCode: Number(r.code), status: r.status, title: r.title, text: r.title, similarity: Number(Number(r.sim).toFixed(3)) })) };
    }
    const { rows } = await rawQuery(
      `SELECT i.item_code AS code, i.item_status AS status, i.item_title AS title, qu.question_stem AS stem, similarity(qu.question_stem, $1) AS sim, r.item_revision_revision_no AS "revisionNo"
         FROM content.question qu JOIN content.item_revision r ON r.item_revision_id = qu.question_item_revision_id
         JOIN content.item i ON i.item_id = r.item_revision_item_id AND r.item_revision_id IN (i.item_latest_revision_id, i.item_published_revision_id)
        WHERE qu.question_stem % $1 AND ($2::bigint IS NULL OR i.item_id <> $2) AND i.item_status <> 'retired' AND similarity(qu.question_stem, $1) >= $3
        ORDER BY sim DESC LIMIT $4`, [text, excludeId, minSimilarity, limit]);
    const seen = new Set();
    const items = [];
    for (const r of rows) {
      if (seen.has(r.code)) continue;
      seen.add(r.code);
      items.push({ itemCode: Number(r.code), status: r.status, title: r.title, text: r.stem, similarity: Number(Number(r.sim).toFixed(3)), revisionNo: r.revisionNo });
    }
    return { items };
  };

  // ── gönder ──
  const snapshotOf = async (q, item, revId) => {
    const [body, tags] = await Promise.all([loadBody(q, item.kind, revId), itemTags(q, item.id)]);
    return {
      title: item.title, slug: item.slug, language: item.language, accessTier: item.accessTier, subjectAreaKey: item.subjectAreaKey, examKeys: tags.examKeys,
      skills: tags.skills.map((s) => ({ key: s.key, weight: s.weight, isPrimary: s.isPrimary })), body,
    };
  };

  const submitInTx = async (tx, ctx, caller, item, { reviewerCode = null, note = null } = {}) => {
    const q = (s, p) => tx.query(s, p);
    const rev = await findRevisionRow(q, { id: item.latestRevisionId, lock: true });
    if (!rev || !EDITABLE.includes(rev.reviewStatus)) throw new DomainError('CONTENT_REVISION_NOT_SUBMITTABLE', 'Latest revision is not a draft', { reviewStatus: rev?.reviewStatus });
    const body = await loadBody(q, item.kind, rev.id);
    const tags = await itemTags(q, item.id);
    const { errors, warnings } = validateBody(item.kind, body, { checkQuestion: !!item.metadata?.checkQuestion });
    if (item.kind === 'question' && !tags.skills.length) errors.push({ field: 'skills', code: 'REQUIRED', message: 'At least one skill is required' });
    if (item.kind === 'article' && !item.slug) errors.push({ field: 'slug', code: 'REQUIRED', message: 'slug is required' });
    if (!tags.examKeys.length && ['question', 'passage', 'note'].includes(item.kind)) warnings.push({ field: 'examKeys', code: 'EXAM_MISSING', message: 'No exam tag' });
    if (errors.length) throw new DomainError('CONTENT_VALIDATION_FAILED', 'Content validation failed', { errors, warnings });
    if (item.kind === 'question' && body.stem) {
      const sim = await q(
        `SELECT i.item_code AS code, similarity(qu.question_stem, $1) AS sim FROM content.question qu JOIN content.item_revision r ON r.item_revision_id = qu.question_item_revision_id
           JOIN content.item i ON i.item_id = r.item_revision_item_id AND r.item_revision_id IN (i.item_latest_revision_id, i.item_published_revision_id)
          WHERE qu.question_stem % $1 AND i.item_id <> $2 AND i.item_status <> 'retired' AND similarity(qu.question_stem, $1) >= 0.6 ORDER BY sim DESC LIMIT 3`, [body.stem, item.id]);
      for (const s of sim.rows) warnings.push({ field: 'stem', code: 'SIMILAR_QUESTION', message: `Similar question ${s.code} (${Number(s.sim).toFixed(2)})`, itemCode: Number(s.code), similarity: Number(Number(s.sim).toFixed(3)) });
    }
    let reviewerId = null;
    if (reviewerCode) {
      const u = await q(`SELECT user_account_id AS id FROM identity.user_account WHERE user_account_code = $1`, [Number(reviewerCode)]);
      if (!u.rows.length) throw unknown('reviewerCode', reviewerCode);
      reviewerId = u.rows[0].id;
    }
    const snapshot = await snapshotOf(q, item, rev.id);
    await q(
      `UPDATE content.item_revision SET item_revision_review_status='submitted', item_revision_submitted_at=$2, item_revision_snapshot=$3, item_revision_assigned_reviewer_id=COALESCE($4, item_revision_assigned_reviewer_id),
              item_revision_reviewed_by=NULL, item_revision_reviewed_at=NULL, item_revision_decision_note=NULL, item_revision_change_note=COALESCE($5, item_revision_change_note), item_revision_updated_by=$6
        WHERE item_revision_id=$1`, [rev.id, nowFn(), JSON.stringify(snapshot), reviewerId, note, ctx.userId]);
    const newStatus = item.publishedRevisionId ? item.status : 'in_review';
    await q(`UPDATE content.item SET item_status = $2, item_updated_by = $3 WHERE item_id = $1`, [item.id, newStatus, ctx.userId]);
    return { warnings, revisionId: rev.id };
  };

  const submit = async ({ caller, code, reviewerCode = null, note = null }) => {
    const ctx = await ctxOf(caller);
    const itemCode = reqCode(code);
    const out = await withTransaction(async (tx) => {
      const q = (s, p) => tx.query(s, p);
      const item = await findItem(q, itemCode, { lock: true });
      if (item.status === 'retired') throw new DomainError('CONTENT_ITEM_RETIRED', 'Item is retired', undefined, 409);
      const res = await submitInTx(tx, ctx, caller, item, { reviewerCode, note });
      const submittedChildren = [];
      if (item.kind === 'passage') {
        const kids = await q(
          `SELECT i.item_code AS code FROM content.question qu JOIN content.item_revision r ON r.item_revision_id = qu.question_item_revision_id
             JOIN content.item i ON i.item_id = r.item_revision_item_id AND i.item_latest_revision_id = r.item_revision_id
            WHERE qu.question_passage_item_id = $1 AND r.item_revision_review_status IN ('draft','changes_requested') ORDER BY i.item_id`, [item.id]);
        for (const k of kids.rows) {
          const ci = await findItem(q, Number(k.code), { lock: true });
          const r = await submitInTx(tx, ctx, caller, ci, { reviewerCode, note });
          submittedChildren.push(Number(k.code));
          res.warnings.push(...r.warnings.map((w) => ({ ...w, childItemCode: Number(k.code) })));
        }
      }
      return { ...res, submittedChildren };
    });
    const item = await findItem(rawQuery, itemCode);
    await audit(caller, 'content.item.submit', item);
    return { item: await buildItemDto(rawQuery, item), warnings: out.warnings, submittedChildren: out.submittedChildren };
  };

  const dropCaches = async (q, item, revisionIds = []) => {
    await cacheDel(...itemPubKeys(item.code));
    if (item.kind === 'vocab_entry') {
      const ids = [...new Set([item.latestRevisionId, item.publishedRevisionId, ...revisionIds].filter(Boolean))];
      const { rows } = await q(`SELECT DISTINCT vocab_entry_headword_normalized AS h FROM content.vocab_entry WHERE vocab_entry_item_revision_id = ANY($1::bigint[])`, [ids]);
      await cacheDel(...rows.map((r) => vocabKey(item.language || 'en', r.h)));
    }
    await bumpCatalogVersion();
  };

  const retire = async ({ caller, code, note = null }) => {
    assertAnyPerm(caller, [PERM.contentWrite, PERM.contentReview]);
    const itemCode = reqCode(code);
    const before = await findItem(rawQuery, itemCode);
    const res = await rawQuery(
      `UPDATE content.item SET item_status='retired', item_retired_at=$2, item_updated_by=$3 WHERE item_id=$1 AND item_status <> 'retired' RETURNING item_id`, [before.id, nowFn(), Number(caller.callerUserId)]);
    if (!res.rows.length) throw new DomainError('CONTENT_ITEM_RETIRED', 'Item is already retired', undefined, 409);
    await dropCaches(rawQuery, before);
    const item = await findItem(rawQuery, itemCode);
    await audit(caller, 'content.item.retire', item, { note });
    return buildItemDto(rawQuery, item);
  };

  const newRevision = async ({ caller, code, changeNote = null }) => {
    const ctx = await ctxOf(caller);
    const itemCode = reqCode(code);
    await withTransaction(async (tx) => {
      const q = (s, p) => tx.query(s, p);
      const item = await findItem(q, itemCode, { lock: true });
      if (item.status === 'retired') throw new DomainError('CONTENT_ITEM_RETIRED', 'Item is retired', undefined, 409);
      const latest = await findRevisionRow(q, { id: item.latestRevisionId, lock: true });
      if (latest && EDITABLE.includes(latest.reviewStatus)) throw new DomainError('CONTENT_REVISION_ALREADY_OPEN', 'There is already an editable revision', { revisionCode: Number(latest.code) });
      if (latest?.reviewStatus === 'submitted') throw new DomainError('CONTENT_REVISION_IN_REVIEW', 'The latest revision is waiting for review', { revisionCode: Number(latest.code) }, 409);
      const sourceId = item.publishedRevisionId || latest.id;
      const max = await q(`SELECT max(item_revision_revision_no) AS n FROM content.item_revision WHERE item_revision_item_id = $1`, [item.id]);
      const revId = await insertRevision(q, ctx, item, { revisionNo: Number(max.rows[0].n) + 1, basedOn: sourceId, changeNote });
      const body = await loadBody(q, item.kind, sourceId);
      await replaceBody(q, ctx, item.kind, revId, normalizeBody(item.kind, body));
      await q(`UPDATE content.item SET item_latest_revision_id = $2, item_updated_by = $3 WHERE item_id = $1`, [item.id, revId, ctx.userId]);
    });
    const item = await findItem(rawQuery, itemCode);
    await audit(caller, 'content.item.new_revision', item);
    return buildItemDto(rawQuery, item);
  };

  // ── liste ──
  const PREVIEW = `COALESCE(left(qu.question_stem, 160), left(pa.passage_body, 160), nt.note_title, ve.vocab_entry_headword, left(tp.translation_prompt_source_text, 160), ef.exam_form_title, ar.article_title, i.item_title)`;
  const FROM = `
    FROM content.item i
    LEFT JOIN content.item_revision r ON r.item_revision_id = i.item_latest_revision_id
    LEFT JOIN content.question qu ON qu.question_item_revision_id = r.item_revision_id
    LEFT JOIN content.question_type qt ON qt.question_type_id = qu.question_question_type_id
    LEFT JOIN content.passage pa ON pa.passage_item_revision_id = r.item_revision_id
    LEFT JOIN content.note nt ON nt.note_item_revision_id = r.item_revision_id
    LEFT JOIN content.vocab_entry ve ON ve.vocab_entry_item_revision_id = r.item_revision_id
    LEFT JOIN content.translation_prompt tp ON tp.translation_prompt_item_revision_id = r.item_revision_id
    LEFT JOIN content.exam_form ef ON ef.exam_form_item_revision_id = r.item_revision_id
    LEFT JOIN content.article ar ON ar.article_item_revision_id = r.item_revision_id
    LEFT JOIN identity.user_account au ON au.user_account_id = r.item_revision_author_user_account_id
    LEFT JOIN identity.user_account uu ON uu.user_account_id = i.item_updated_by
    LEFT JOIN content.item_stat st ON st.item_stat_item_id = i.item_id`;

  const SORTS = {
    updated_desc: 'i.item_updated_at DESC, i.item_id DESC', updated_asc: 'i.item_updated_at ASC, i.item_id ASC', created_desc: 'i.item_created_at DESC, i.item_id DESC',
    title: 'i.item_title ASC, i.item_id', correct_rate_asc: 'st.item_stat_correct_rate ASC NULLS LAST, i.item_id', correct_rate_desc: 'st.item_stat_correct_rate DESC NULLS LAST, i.item_id',
    attempts_desc: 'st.item_stat_attempt_count DESC NULLS LAST, i.item_id', reports_desc: 'st.item_stat_report_count DESC NULLS LAST, i.item_id',
  };

  const list = async ({ caller, query = {} }) => {
    const { page, pageSize, offset } = pageOf(query);
    const where = ['i.item_tenant_code = $1'];
    const params = [Number(caller.callerTenantCode) || (await getPlatform(rawQuery)).tenantCode];
    const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
    const kinds = asArray(query.kind);
    if (kinds.length) add('i.item_kind = ANY(?::varchar[])', kinds);
    const statuses = asArray(query.status);
    const baseWhereLen = () => where.length;
    if (query.exam) add('EXISTS (SELECT 1 FROM content.item_exam ie JOIN content.exam e ON e.exam_id = ie.item_exam_exam_id WHERE ie.item_exam_item_id = i.item_id AND e.exam_key = ?)', String(query.exam));
    if (query.skill) add('EXISTS (SELECT 1 FROM content.item_skill isk JOIN content.skill s ON s.skill_id = isk.item_skill_skill_id JOIN content.skill root ON root.skill_key = ? AND (s.skill_path = root.skill_path OR s.skill_path LIKE root.skill_path || \'.%\') WHERE isk.item_skill_item_id = i.item_id)', String(query.skill));
    if (query.type) add('qt.question_type_key = ?', String(query.type));
    if (query.tier) add('i.item_access_tier = ?', String(query.tier));
    if (query.origin) add('i.item_origin = ?', String(query.origin));
    if (query.reviewStatus) add('r.item_revision_review_status = ?', String(query.reviewStatus));
    if (query.mine === 'true' || query.mine === true) add('r.item_revision_author_user_account_id = ?', Number(caller.callerUserId));
    if (query.q && String(query.q).trim()) {
      const qs = String(query.q).trim();
      params.push(like(qs));
      const li = `$${params.length}`;
      const codeMatch = /^\d+$/.test(qs) ? (params.push(Number(qs)), ` OR i.item_code = $${params.length}`) : '';
      where.push(`(i.item_title ILIKE ${li} OR ${PREVIEW} ILIKE ${li} OR i.item_external_ref ILIKE ${li}${codeMatch})`);
    }
    const statusCountsSql = `SELECT i.item_status AS status, count(*)::int AS n ${FROM} WHERE ${where.join(' AND ')} GROUP BY 1`;
    const statusCountsParams = [...params];
    if (statuses.length) add('i.item_status = ANY(?::varchar[])', statuses);
    const order = SORTS[query.sort] || SORTS.updated_desc;
    void baseWhereLen;
    const [rows, total, sc] = await Promise.all([
      rawQuery(
        `SELECT i.item_code AS code, i.item_kind AS kind, i.item_status AS status, i.item_title AS title, i.item_language AS language, i.item_access_tier AS "accessTier", i.item_origin AS origin,
                i.item_updated_at AS "updatedAt", i.item_created_at AS "createdAt", i.item_published_at AS "publishedAt", r.item_revision_code AS "revisionCode", r.item_revision_revision_no AS "revisionNo",
                r.item_revision_review_status AS "reviewStatus", r.item_revision_submitted_at AS "submittedAt", au.user_account_code AS "authorCode", au.user_account_display_name AS "authorName",
                uu.user_account_code AS "updaterCode", uu.user_account_display_name AS "updaterName", qt.question_type_key AS "questionTypeKey", qu.question_difficulty AS difficulty,
                ${PREVIEW} AS preview,
                COALESCE((SELECT array_agg(e.exam_key ORDER BY e.exam_key) FROM content.item_exam ie JOIN content.exam e ON e.exam_id = ie.item_exam_exam_id WHERE ie.item_exam_item_id = i.item_id), '{}') AS "examKeys",
                COALESCE((SELECT array_agg(s.skill_key ORDER BY isk.item_skill_is_primary DESC, s.skill_key) FROM content.item_skill isk JOIN content.skill s ON s.skill_id = isk.item_skill_skill_id WHERE isk.item_skill_item_id = i.item_id), '{}') AS "skillKeys",
                st.item_stat_attempt_count AS attempts, st.item_stat_correct_rate AS "correctRate", st.item_stat_avg_time_ms AS "avgTimeMs", st.item_stat_report_count AS reports
         ${FROM} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${offset}`, params),
      rawQuery(`SELECT count(*)::int AS n ${FROM} WHERE ${where.join(' AND ')}`, params),
      rawQuery(statusCountsSql, statusCountsParams),
    ]);
    return {
      items: rows.rows.map((r) => ({
        code: Number(r.code), kind: r.kind, status: r.status, title: r.title, preview: trunc(r.preview, 160), language: r.language, accessTier: r.accessTier, origin: r.origin,
        questionTypeKey: r.questionTypeKey, difficulty: r.difficulty, examKeys: r.examKeys, skillKeys: r.skillKeys, primarySkillKey: r.skillKeys?.[0] || null,
        revision: { code: num(r.revisionCode), revisionNo: r.revisionNo, reviewStatus: r.reviewStatus, submittedAt: iso(r.submittedAt) },
        author: userRef(r.authorCode, r.authorName), updatedBy: userRef(r.updaterCode, r.updaterName),
        stat: r.attempts === null || r.attempts === undefined ? null : { attemptCount: r.attempts, correctRate: r.correctRate === null ? null : Number(r.correctRate), avgTimeMs: r.avgTimeMs, reportCount: r.reports },
        publishedAt: iso(r.publishedAt), updatedAt: iso(r.updatedAt), createdAt: iso(r.createdAt),
      })),
      page, pageSize, total: total.rows[0].n,
      statusCounts: Object.fromEntries(STATUSES.map((s) => [s, sc.rows.find((x) => x.status === s)?.n || 0])),
    };
  };

  // ── toplu işlem ──
  const bulk = async ({ caller, codes, action, skillKeys, examKeys, mode = 'add', reviewerCode = null }) => {
    const list = asArray(codes).map(Number).filter(Boolean);
    if (!list.length || list.length > 200) throw new DomainError('CONTENT_BULK_INVALID', 'codes: 1..200 item codes required');
    if (!['tag_skills', 'tag_exams', 'send_to_review'].includes(action)) throw new DomainError('CONTENT_BULK_INVALID', 'action must be tag_skills|tag_exams|send_to_review');
    if (!['add', 'replace', 'remove'].includes(mode)) throw new DomainError('CONTENT_BULK_INVALID', 'mode must be add|replace|remove');
    const ctx = await ctxOf(caller);
    const results = [];
    for (const code of list) {
      try {
        if (action === 'send_to_review') {
          await submit({ caller, code, reviewerCode });
        } else {
          await withTransaction(async (tx) => {
            const q = (s, p) => tx.query(s, p);
            const item = await findItem(q, code, { lock: true });
            if (item.status === 'retired') throw new DomainError('CONTENT_ITEM_RETIRED', 'Item is retired', undefined, 409);
            const cur = await itemTags(q, item.id);
            if (action === 'tag_skills') {
              const want = asArray(skillKeys);
              if (!want.length) throw new DomainError('CONTENT_BULK_INVALID', 'skillKeys required');
              const curKeys = cur.skills.map((s) => s.key);
              const next = mode === 'replace' ? want : mode === 'remove' ? curKeys.filter((k) => !want.includes(k)) : [...new Set([...curKeys, ...want])];
              const primary = cur.skills.find((s) => s.isPrimary)?.key;
              await setTags(q, ctx, item.id, { skills: next.map((k, i) => ({ key: k, isPrimary: primary && next.includes(primary) ? k === primary : i === 0, weight: cur.skills.find((s) => s.key === k)?.weight })) });
            } else {
              const want = asArray(examKeys);
              if (!want.length) throw new DomainError('CONTENT_BULK_INVALID', 'examKeys required');
              const next = mode === 'replace' ? want : mode === 'remove' ? cur.examKeys.filter((k) => !want.includes(k)) : [...new Set([...cur.examKeys, ...want])];
              await setTags(q, ctx, item.id, { examKeys: next });
            }
            await q(`UPDATE content.item SET item_updated_by = $2 WHERE item_id = $1`, [item.id, ctx.userId]);
          });
          if (action) await cacheDel(...itemPubKeys(code));
        }
        results.push({ code, ok: true });
      } catch (e) {
        results.push({ code, ok: false, error: { code: e.code || 'INTERNAL_ERROR', message: e.message, details: e.details } });
      }
    }
    await writeAudit({ caller, action: `content.item.bulk.${action}`, schema: 'content', table: 'item', after: { count: list.length, ok: results.filter((r) => r.ok).length } });
    return { results, okCount: results.filter((r) => r.ok).length, failedCount: results.filter((r) => !r.ok).length };
  };

  return Object.freeze({ createItem, createInTx, getItem, updateDraft, similar, submit, submitInTx, retire, newRevision, list, bulk, dropCaches });
};
