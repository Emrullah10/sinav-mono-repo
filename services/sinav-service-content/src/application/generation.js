import { DomainError, withTransaction, writeAudit, fetchInternal, internalHeaders } from 'app-shared';
import { iso, pageOf, reqCode, userRef, asArray, clampInt, getPlatform } from '../shared/helpers.js';
import { findItem, findRevisionRow } from '../shared/item-read.js';

const tutorUrl = () => `${(process.env.SERVICE_TUTOR_REST_URL || process.env.TUTOR_REST_URL || 'http://127.0.0.1:2005').replace(/\/$/, '')}/api/sinav-service-tutor/v1`;
const BATCH = 5;
const aiTimeout = () => Number(process.env.CONTENT_AI_TIMEOUT_MS) || 120000;

const systemPrompt = (p) => `You write original, exam-grade English multiple-choice questions for Turkish students preparing for ${p.examKey || 'YDS'}-style exams.
Return ONLY a JSON object: {"questions":[{...}]}. Each question object has:
"stem" (string; single-sentence questions use ______ for the blank),
"options" (array of exactly 5 objects {"label":"A".."E","text":string,"rationale":string|null}; rationale in Turkish explains why a WRONG option is wrong, null for the correct one),
"correctLabel" ("A".."E"), "shortReason" (Turkish, one short sentence starting with "Doğru."), "explanation" (Turkish, 2-4 sentences),
"hints" (array of exactly 4 objects in this order: {"kind":"focus","body"}, {"kind":"rule","body"}, {"kind":"eliminate","body","eliminatesLabels":[two WRONG labels]}, {"kind":"solution","body"}; Turkish text),
"difficulty" (1-5), "estimatedSeconds" (integer).
Content must be original (never copy real exam questions), academic register, distractors plausible, correct answers varied across A-E. Turkish text must be calm, second person ("sen"), no exclamation marks or emoji.`;

const userPrompt = (p, n) => `Write ${n} question(s).
Question type: ${p.questionTypeKey}${p.questionTypeName ? ` (${p.questionTypeName})` : ''}
Skills: ${(p.skillKeys || []).join(', ') || 'any suitable'}
Target difficulty: ${p.difficulty || 3} (1 easy .. 5 hard)
${p.topic ? `Topic / area: ${p.topic}\n` : ''}${p.instructions ? `Extra instructions: ${p.instructions}\n` : ''}Vary the correct option label across the batch.`;

const extractJson = (data) => {
  if (!data) return null;
  for (const c of [data.json, data.parsed, data.output, data.result]) if (c && typeof c === 'object') return c;
  const text = data.content ?? data.text ?? data.message?.content ?? (typeof data === 'string' ? data : null);
  if (typeof text !== 'string') return null;
  const m = text.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : text); } catch { return null; }
};

export const makeGeneration = ({ rawQuery, nowFn, fetchFn, items }) => {
  const jobDto = (r, drafts) => ({
    code: Number(r.code), status: r.status, params: r.params, requestedCount: r.requestedCount, producedCount: r.producedCount, failedCount: r.failedCount, model: r.model,
    costMicros: Number(r.costMicros), startedAt: iso(r.startedAt), finishedAt: iso(r.finishedAt), error: r.error, errorCode: r.errorCode || null,
    requestedBy: userRef(r.requesterCode, r.requesterName), createdAt: iso(r.createdAt), ...(drafts ? { drafts } : {}),
  });
  const JOB_SELECT = `
    SELECT j.generation_job_id AS id, j.generation_job_code AS code, j.generation_job_status AS status, j.generation_job_params AS params, j.generation_job_requested_count AS "requestedCount",
           j.generation_job_produced_count AS "producedCount", j.generation_job_failed_count AS "failedCount", j.generation_job_model AS model, j.generation_job_cost_micros AS "costMicros",
           j.generation_job_started_at AS "startedAt", j.generation_job_finished_at AS "finishedAt", j.generation_job_error AS error, j.generation_job_metadata->>'errorCode' AS "errorCode",
           j.generation_job_requested_by AS "requestedById", j.generation_job_created_at AS "createdAt", u.user_account_code AS "requesterCode", u.user_account_display_name AS "requesterName"
      FROM content.generation_job j LEFT JOIN identity.user_account u ON u.user_account_id = j.generation_job_requested_by`;

  const createJob = async ({ caller, ...input }) => {
    const count = Number(input.count ?? input.requestedCount ?? 5);
    if (!Number.isInteger(count) || count < 1 || count > 50) throw new DomainError('CONTENT_JOB_INVALID', 'count must be an integer between 1 and 50', { field: 'count' });
    const kind = input.kind || 'question';
    if (kind !== 'question') throw new DomainError('CONTENT_JOB_INVALID', 'Only kind "question" can be generated for now', { field: 'kind' });
    const qt = await rawQuery(`SELECT question_type_name AS name FROM content.question_type WHERE question_type_key = $1`, [input.questionTypeKey || '']);
    if (!qt.rows.length) throw new DomainError('CONTENT_JOB_INVALID', 'questionTypeKey is required and must exist', { field: 'questionTypeKey' });
    for (const k of asArray(input.skillKeys)) {
      const s = await rawQuery(`SELECT 1 FROM content.skill WHERE skill_key = $1`, [k]);
      if (!s.rows.length) throw new DomainError('CONTENT_TAXONOMY_UNKNOWN', `Unknown skill: ${k}`, { field: 'skillKeys', value: k });
    }
    if (input.examKey) {
      const e = await rawQuery(`SELECT 1 FROM content.exam WHERE exam_key = $1`, [input.examKey]);
      if (!e.rows.length) throw new DomainError('CONTENT_TAXONOMY_UNKNOWN', `Unknown exam: ${input.examKey}`, { field: 'examKey' });
    }
    const difficulty = clampInt(input.difficulty, 3, 1, 5);
    const params = {
      kind, questionTypeKey: input.questionTypeKey, questionTypeName: qt.rows[0].name, skillKeys: asArray(input.skillKeys), examKey: input.examKey || 'yds', difficulty,
      topic: input.topic || null, instructions: input.instructions || null, language: input.language || 'en', accessTier: input.accessTier || 'free', subjectAreaKey: input.subjectAreaKey || null,
    };
    const p = await getPlatform(rawQuery);
    const { rows } = await rawQuery(
      `INSERT INTO content.generation_job (generation_job_tenant_code, generation_job_organization_id, generation_job_requested_by, generation_job_status, generation_job_params, generation_job_requested_count,
              generation_job_model, generation_job_created_by, generation_job_updated_by)
       VALUES ($1,$2,$3,'queued',$4,$5,$6,$3,$3) RETURNING generation_job_code AS code`, [p.tenantCode, p.organizationId, Number(caller.callerUserId), JSON.stringify(params), count, process.env.CONTENT_MODEL || null]);
    await writeAudit({ caller, action: 'content.generation_job.create', schema: 'content', table: 'generation_job', entityCode: Number(rows[0].code), after: params });
    return getJob({ code: rows[0].code });
  };

  const draftsOf = async (jobId) => {
    const { rows } = await rawQuery(
      `SELECT i.item_code AS "itemCode", i.item_title AS title, i.item_status AS "itemStatus", r.item_revision_code AS "revisionCode", r.item_revision_review_status AS "reviewStatus", r.item_revision_decision_note AS "decisionNote",
              left(qu.question_stem, 200) AS stem, qu.question_difficulty AS difficulty
         FROM content.item_revision r JOIN content.item i ON i.item_id = r.item_revision_item_id LEFT JOIN content.question qu ON qu.question_item_revision_id = r.item_revision_id
        WHERE r.item_revision_generation_job_id = $1 ORDER BY i.item_id`, [jobId]);
    return rows.map((r) => ({ itemCode: Number(r.itemCode), title: r.title, stem: r.stem, difficulty: r.difficulty, itemStatus: r.itemStatus, revisionCode: Number(r.revisionCode), reviewStatus: r.reviewStatus, decisionNote: r.decisionNote }));
  };

  const listJobs = async ({ query = {} }) => {
    const { page, pageSize, offset } = pageOf(query);
    const params = [];
    let w = '';
    if (query.status) { params.push(asArray(query.status)); w = 'WHERE j.generation_job_status = ANY($1::varchar[])'; }
    const [rows, total] = await Promise.all([
      rawQuery(`${JOB_SELECT} ${w} ORDER BY j.generation_job_created_at DESC LIMIT ${pageSize} OFFSET ${offset}`, params),
      rawQuery(`SELECT count(*)::int AS n FROM content.generation_job j ${w}`, params),
    ]);
    return { items: rows.rows.map((r) => jobDto(r)), page, pageSize, total: total.rows[0].n };
  };

  const getJob = async ({ code }) => {
    const { rows } = await rawQuery(`${JOB_SELECT} WHERE j.generation_job_code = $1`, [reqCode(code, 'CONTENT_JOB_NOT_FOUND', 'Generation job not found')]);
    if (!rows.length) throw new DomainError('CONTENT_JOB_NOT_FOUND', 'Generation job not found');
    return jobDto(rows[0], await draftsOf(rows[0].id));
  };

  const cancelJob = async ({ caller, code }) => {
    const r = await rawQuery(
      `UPDATE content.generation_job SET generation_job_status='canceled', generation_job_finished_at=$2, generation_job_updated_by=$3 WHERE generation_job_code=$1 AND generation_job_status='queued' RETURNING generation_job_code`,
      [reqCode(code, 'CONTENT_JOB_NOT_FOUND'), nowFn(), Number(caller.callerUserId)]);
    if (!r.rows.length) throw new DomainError('CONTENT_JOB_NOT_ACTIVE', 'Only queued jobs can be canceled');
    return getJob({ code });
  };

  // ── işçi (cron): kuyruktaki işleri işler ──
  const failJob = (id, errorCode, message) =>
    rawQuery(
      `UPDATE content.generation_job SET generation_job_status='failed', generation_job_finished_at=$2, generation_job_error=$3, generation_job_metadata = generation_job_metadata || $4::jsonb WHERE generation_job_id=$1`,
      [id, nowFn(), String(message).slice(0, 2000), JSON.stringify({ errorCode })]);

  const callTutor = async (job, messages, caller) => {
    const res = await fetchInternal(`${tutorUrl()}/internal/ai/complete`, {
      method: 'POST', headers: internalHeaders(caller), timeoutMs: aiTimeout(), fetchFn,
      body: { feature: 'content_draft', model: process.env.CONTENT_MODEL || undefined, messages, json: true, userAccountId: Number(job.requestedById) },
    });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok || body?.success === false) {
      const code = body?.error?.code || (res.status === 404 ? 'TUTOR_AI_ENDPOINT_MISSING' : `TUTOR_HTTP_${res.status}`);
      const e = new Error(body?.error?.message || `Tutor AI call failed (${res.status})`);
      e.aiCode = code;
      throw e;
    }
    return body?.data ?? body;
  };

  const toQuestionBody = (q, p) => {
    const options = Array.isArray(q.options) ? q.options : Object.entries(q.options || {}).map(([label, text]) => ({ label, text }));
    return {
      questionTypeKey: p.questionTypeKey, stem: q.stem, difficulty: Number(q.difficulty) || p.difficulty, estimatedSeconds: q.estimatedSeconds || null, shortReason: q.shortReason || null, explanation: q.explanation || '',
      options: options.map((o, i) => ({ label: o.label, text: o.text, rationale: o.rationale ?? null, isCorrect: String(o.label || 'ABCDE'[i]).toUpperCase() === String(q.correctLabel || '').toUpperCase() })),
      hints: (q.hints || []).map((h, i) => ({ stepNo: i + 1, kind: h.kind, body: h.body, eliminatesLabels: h.eliminatesLabels || [] })),
    };
  };

  const processJob = async (job) => {
    const p = job.params;
    const caller = { callerUserId: job.requestedById, callerTenantCode: job.tenantCode, callerOrganizationId: job.organizationId, callerUserRole: 'content_editor' };
    const ctx = { tenantCode: Number(job.tenantCode), organizationId: Number(job.organizationId), userId: Number(job.requestedById) };
    let produced = 0;
    let failed = 0;
    let cost = 0;
    let model = job.model;
    let remaining = job.requestedCount;
    while (remaining > 0) {
      const n = Math.min(BATCH, remaining);
      remaining -= n;
      let data;
      try {
        data = await callTutor(job, [{ role: 'system', content: systemPrompt(p) }, { role: 'user', content: userPrompt(p, n) }], caller);
      } catch (e) {
        const code = e.aiCode || e.code || 'CONTENT_AI_UNAVAILABLE';
        if (produced === 0 && failed === 0) { await failJob(job.id, code, e.message); return { failed: true }; }
        failed += n;
        if (code === 'LLM_NOT_CONFIGURED') break;
        continue;
      }
      model = data?.model || model;
      cost += Number(data?.costMicros ?? data?.usage?.costMicros ?? 0) || 0;
      const parsed = extractJson(data);
      const list = Array.isArray(parsed) ? parsed : parsed?.questions;
      if (!Array.isArray(list) || !list.length) { failed += n; continue; }
      for (const q of list.slice(0, n)) {
        try {
          await withTransaction((tx) => items.createInTx(tx, ctx, caller, {
            kind: 'question', origin: 'ai_draft', language: p.language, accessTier: p.accessTier, subjectAreaKey: p.subjectAreaKey, examKeys: p.examKey ? [p.examKey] : [], skills: p.skillKeys,
            generationJobId: job.id, changeNote: 'AI draft', body: toQuestionBody(q, p),
          }));
          produced += 1;
        } catch { failed += 1; }
      }
      failed += Math.max(0, n - list.length);
    }
    const status = produced === 0 ? 'failed' : 'completed';
    await rawQuery(
      `UPDATE content.generation_job SET generation_job_status=$2, generation_job_produced_count=$3, generation_job_failed_count=$4, generation_job_cost_micros=$5, generation_job_model=$6,
              generation_job_finished_at=$7, generation_job_error=CASE WHEN $2='failed' THEN 'No valid draft was produced' END,
              generation_job_metadata = CASE WHEN $2='failed' THEN generation_job_metadata || '{"errorCode":"CONTENT_AI_BAD_OUTPUT"}'::jsonb ELSE generation_job_metadata END WHERE generation_job_id=$1`,
      [job.id, status, Math.min(produced, 32000), Math.min(failed, 32000), cost, model, nowFn()]);
    return { failed: status === 'failed' };
  };

  const processQueued = async () => {
    const { rows } = await rawQuery(
      `SELECT generation_job_id AS id FROM content.generation_job WHERE generation_job_status='queued' ORDER BY generation_job_created_at LIMIT 3`);
    let changed = 0;
    for (const r of rows) {
      const claimed = await rawQuery(
        `UPDATE content.generation_job SET generation_job_status='running', generation_job_started_at=$2 WHERE generation_job_id=$1 AND generation_job_status='queued'
         RETURNING generation_job_id AS id, generation_job_params AS params, generation_job_requested_count AS "requestedCount", generation_job_requested_by AS "requestedById", generation_job_model AS model,
                   generation_job_tenant_code AS "tenantCode", generation_job_organization_id AS "organizationId"`, [r.id, nowFn()]);
      if (!claimed.rows.length) continue;
      try {
        await processJob(claimed.rows[0]);
      } catch (e) {
        await failJob(r.id, e.code || 'CONTENT_AI_UNAVAILABLE', e.message);
      }
      changed += 1;
    }
    // Takılı kalan "running" işler (servis yeniden başladı): 30 dk sonra başarısız say.
    await rawQuery(
      `UPDATE content.generation_job SET generation_job_status='failed', generation_job_finished_at=$1, generation_job_error='Worker did not finish', generation_job_metadata = generation_job_metadata || '{"errorCode":"CONTENT_JOB_STALLED"}'::jsonb
        WHERE generation_job_status='running' AND generation_job_started_at < $1::timestamptz - interval '30 minutes'`, [nowFn()]);
    return { changed };
  };

  // ── taslak kabul / ret ──
  const draftContext = async (jobCode, itemCode) => {
    const job = (await rawQuery(`SELECT generation_job_id AS id FROM content.generation_job WHERE generation_job_code = $1`, [reqCode(jobCode, 'CONTENT_JOB_NOT_FOUND')])).rows[0];
    if (!job) throw new DomainError('CONTENT_JOB_NOT_FOUND', 'Generation job not found');
    const item = await findItem(rawQuery, reqCode(itemCode));
    const rev = await findRevisionRow(rawQuery, { id: item.latestRevisionId });
    const own = await rawQuery(`SELECT 1 FROM content.item_revision WHERE item_revision_id = $1 AND item_revision_generation_job_id = $2`, [rev.id, job.id]);
    if (!own.rows.length) throw new DomainError('CONTENT_DRAFT_NOT_FROM_JOB', 'This item is not a draft of the given job', undefined, 404);
    return { job, item, rev };
  };

  /** Kabul: doğrulamadan geçerse inceleme kuyruğuna gönderilir. */
  const acceptDraft = async ({ caller, jobCode, itemCode }) => {
    const { item } = await draftContext(jobCode, itemCode);
    const out = await items.submit({ caller, code: item.code });
    return { accepted: true, itemCode: Number(item.code), warnings: out.warnings, status: out.item.status };
  };
  const rejectDraft = async ({ caller, jobCode, itemCode, note = null }) => {
    const { item, rev } = await draftContext(jobCode, itemCode);
    if (!['draft', 'changes_requested'].includes(rev.reviewStatus)) throw new DomainError('CONTENT_REVISION_NOT_EDITABLE', 'Draft is no longer pending', { reviewStatus: rev.reviewStatus });
    await withTransaction(async (tx) => {
      await tx.query(`UPDATE content.item_revision SET item_revision_review_status='rejected', item_revision_decision_note=$2, item_revision_updated_by=$3 WHERE item_revision_id=$1`, [rev.id, note || 'AI draft rejected', Number(caller.callerUserId)]);
      await tx.query(`UPDATE content.item SET item_status='retired', item_retired_at=$2, item_updated_by=$3 WHERE item_id=$1`, [item.id, nowFn(), Number(caller.callerUserId)]);
    });
    await writeAudit({ caller, action: 'content.generation_job.reject_draft', schema: 'content', table: 'item', entityCode: Number(item.code) });
    return { rejected: true, itemCode: Number(item.code) };
  };

  return Object.freeze({ createJob, listJobs, getJob, cancelJob, processQueued, acceptDraft, rejectDraft });
};
