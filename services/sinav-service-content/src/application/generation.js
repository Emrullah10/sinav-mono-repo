import { DomainError, withTransaction, writeAudit, fetchInternal, internalHeaders } from 'app-shared';
import { iso, pageOf, reqCode, userRef, asArray, clampInt, getPlatform } from '../shared/helpers.js';
import { findItem, findRevisionRow } from '../shared/item-read.js';
import { loadBody } from '../shared/bodies.js';
import {
  AREAS, PASSAGE_KINDS, NOTE_KINDS, PARAGRAPH_TYPES, MAX_COUNT, unitsPerRequest, maxTokensFor, notePrompts, passagePrompts, checkPrompts,
  checkQuestion, checkNote, checkPassage, questionBody, passageBody, noteBody, checkTypeFromSkills,
} from './generation-kinds.js';

const tutorUrl = () => `${(process.env.SERVICE_TUTOR_REST_URL || process.env.TUTOR_REST_URL || 'http://127.0.0.1:2005').replace(/\/$/, '')}/api/sinav-service-tutor/v1`;
const aiTimeout = () => Number(process.env.CONTENT_AI_TIMEOUT_MS) || 120000;

const systemPrompt = (p) => `[gen:question]
You write original, exam-grade English multiple-choice questions for Turkish students preparing for ${p.examKey || 'YDS'}-style exams.
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
    requestedBy: userRef(r.requesterCode, r.requesterName), createdAt: iso(r.createdAt), issues: r.issues || [], ...(drafts ? { drafts } : {}),
  });
  const JOB_SELECT = `
    SELECT j.generation_job_id AS id, j.generation_job_code AS code, j.generation_job_status AS status, j.generation_job_params AS params, j.generation_job_requested_count AS "requestedCount",
           j.generation_job_produced_count AS "producedCount", j.generation_job_failed_count AS "failedCount", j.generation_job_model AS model, j.generation_job_cost_micros AS "costMicros",
           j.generation_job_started_at AS "startedAt", j.generation_job_finished_at AS "finishedAt", j.generation_job_error AS error, j.generation_job_metadata->>'errorCode' AS "errorCode", j.generation_job_metadata->'issues' AS issues,
           j.generation_job_requested_by AS "requestedById", j.generation_job_created_at AS "createdAt", u.user_account_code AS "requesterCode", u.user_account_display_name AS "requesterName"
      FROM content.generation_job j LEFT JOIN identity.user_account u ON u.user_account_id = j.generation_job_requested_by`;

  const createJob = async ({ caller, ...input }) => {
    const kind = input.kind || 'question';
    if (!MAX_COUNT[kind]) throw new DomainError('CONTENT_JOB_INVALID', 'kind must be question, note or passage', { field: 'kind' });
    const count = Number(input.count ?? input.requestedCount ?? (kind === 'question' ? 5 : 1));
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT[kind]) throw new DomainError('CONTENT_JOB_INVALID', `count must be an integer between 1 and ${MAX_COUNT[kind]}`, { field: 'count' });
    const skillKeys = asArray(input.skillKeys);
    if (kind !== 'question' && !skillKeys.length) throw new DomainError('CONTENT_JOB_INVALID', 'skillKeys is required for notes and passages', { field: 'skillKeys' });
    for (const k of skillKeys) {
      const s = await rawQuery(`SELECT 1 FROM content.skill WHERE skill_key = $1`, [k]);
      if (!s.rows.length) throw new DomainError('CONTENT_TAXONOMY_UNKNOWN', `Unknown skill: ${k}`, { field: 'skillKeys', value: k });
    }
    if (input.examKey) {
      const e = await rawQuery(`SELECT 1 FROM content.exam WHERE exam_key = $1`, [input.examKey]);
      if (!e.rows.length) throw new DomainError('CONTENT_TAXONOMY_UNKNOWN', `Unknown exam: ${input.examKey}`, { field: 'examKey' });
    }
    if (input.subjectAreaKey && !AREAS.includes(input.subjectAreaKey)) throw new DomainError('CONTENT_JOB_INVALID', `subjectAreaKey must be one of ${AREAS.join(', ')}`, { field: 'subjectAreaKey' });
    let questionTypeKey = input.questionTypeKey || '';
    let noteKind = null;
    let passageKind = null;
    if (kind === 'note') {
      noteKind = input.noteKind || 'skill';
      if (!NOTE_KINDS.includes(noteKind)) throw new DomainError('CONTENT_JOB_INVALID', `noteKind must be one of ${NOTE_KINDS.join(', ')}`, { field: 'noteKind' });
      questionTypeKey = questionTypeKey || checkTypeFromSkills(skillKeys);
    } else if (kind === 'passage') {
      passageKind = input.passageKind;
      if (!PASSAGE_KINDS.includes(passageKind)) throw new DomainError('CONTENT_JOB_INVALID', `passageKind must be one of ${PASSAGE_KINDS.join(', ')}`, { field: 'passageKind' });
      if (passageKind === 'paragraph') {
        questionTypeKey = questionTypeKey || PARAGRAPH_TYPES[0];
        if (!PARAGRAPH_TYPES.includes(questionTypeKey)) throw new DomainError('CONTENT_JOB_INVALID', `questionTypeKey must be one of ${PARAGRAPH_TYPES.join(', ')} for paragraph passages`, { field: 'questionTypeKey' });
      } else questionTypeKey = passageKind;
    }
    const qt = await rawQuery(`SELECT question_type_name AS name FROM content.question_type WHERE question_type_key = $1`, [questionTypeKey]);
    if (!qt.rows.length) throw new DomainError('CONTENT_JOB_INVALID', 'questionTypeKey is required and must exist', { field: 'questionTypeKey' });
    const typeName = kind === 'note' ? `Hap not (${noteKind}) · ${skillKeys.join(', ')}` : kind === 'passage' ? `Metin (${passageKind}) · ${qt.rows[0].name}` : qt.rows[0].name;
    const difficulty = clampInt(input.difficulty, 3, 1, 5);
    const params = {
      kind, questionTypeKey, questionTypeName: typeName, noteKind, passageKind, skillKeys, examKey: input.examKey || 'yds', difficulty,
      topic: input.topic || null, instructions: input.instructions || null, language: input.language || 'en', accessTier: input.accessTier || 'free', subjectAreaKey: input.subjectAreaKey || null,
    };
    const p = await getPlatform(rawQuery);
    const { rows } = await rawQuery(
      `INSERT INTO content.generation_job (generation_job_tenant_code, generation_job_organization_id, generation_job_requested_by, generation_job_status, generation_job_params, generation_job_requested_count,
              generation_job_model, generation_job_created_by, generation_job_updated_by)
       VALUES ($1,$2,$3,'queued',$4,$5,$6,$3,$3) RETURNING generation_job_code AS code`, [p.tenantCode, p.organizationId, Number(caller?.callerUserId) || null, JSON.stringify(params), count, process.env.CONTENT_MODEL || null]);
    await writeAudit({ caller, action: 'content.generation_job.create', schema: 'content', table: 'generation_job', entityCode: Number(rows[0].code), after: params });
    return getJob({ code: rows[0].code });
  };

  const draftsOf = async (jobId) => {
    const { rows } = await rawQuery(
      `SELECT i.item_code AS "itemCode", i.item_kind AS kind, i.item_metadata->'aiCheck' AS "aiCheck", i.item_title AS title, i.item_status AS "itemStatus", r.item_revision_code AS "revisionCode", r.item_revision_review_status AS "reviewStatus", r.item_revision_decision_note AS "decisionNote",
              left(qu.question_stem, 200) AS stem, qu.question_difficulty AS difficulty
         FROM content.item_revision r JOIN content.item i ON i.item_id = r.item_revision_item_id LEFT JOIN content.question qu ON qu.question_item_revision_id = r.item_revision_id
        WHERE r.item_revision_generation_job_id = $1
          AND NOT (i.item_kind = 'question' AND (qu.question_passage_item_id IS NOT NULL OR i.item_metadata ? 'checkQuestion')) ORDER BY i.item_id`, [jobId]);
    return rows.map((r) => ({ itemCode: Number(r.itemCode), kind: r.kind, aiCheck: r.aiCheck, status: r.itemStatus, title: r.title, stem: r.stem, difficulty: r.difficulty, itemStatus: r.itemStatus, revisionCode: Number(r.revisionCode), reviewStatus: r.reviewStatus, decisionNote: r.decisionNote }));
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

  const callTutor = async (job, messages, caller, opts = {}) => {
    const res = await fetchInternal(`${tutorUrl()}/internal/ai/complete`, {
      method: 'POST', headers: internalHeaders(caller), timeoutMs: aiTimeout(), fetchFn,
      body: { feature: 'content_draft', model: opts.model ?? (process.env.CONTENT_MODEL || undefined), messages, json: true, maxTokens: opts.maxTokens, userAccountId: Number(job.requestedById) },
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

  const costOf = (data) => Number(data?.costMicros ?? data?.usage?.costMicros ?? 0) || 0;
  const ask = async (job, caller, st, prompts, maxTokens) => {
    const data = await callTutor(job, [{ role: 'system', content: prompts.system }, { role: 'user', content: prompts.user }], caller, { maxTokens });
    st.model = data?.model || st.model;
    st.cost += costOf(data);
    if (data?.finishReason === 'length') st.issue(`yanıt uzunluk sınırında kesildi (${data?.usage?.outputTokens ?? '?'} token, ${data?.model ?? '-'})`);
    const parsed = extractJson(data);
    if (!parsed) st.issue('yanıtta JSON bulunamadı');
    return parsed;
  };
  const recentTitles = async (kind) => (await rawQuery(`SELECT item_title AS t FROM content.item WHERE item_kind = $1 ORDER BY item_id DESC LIMIT 40`, [kind])).rows.map((r) => String(r.t).slice(0, 80));
  const common = (job, p) => ({
    origin: 'ai_draft', language: p.language, accessTier: p.accessTier, subjectAreaKey: p.subjectAreaKey, examKeys: p.examKey ? [p.examKey] : [], skills: p.skillKeys,
    generationJobId: job.id, changeNote: 'AI draft',
  });
  const forCheck = (qb) => ({ stem: qb.stem, blankNo: qb.blankNo, options: qb.options, correctLabel: qb.options.find((o) => o.isCorrect)?.label });

  /** Cevap anahtarı denetimi: ucuz model soruları cevabı görmeden çözer; uyuşmayanlar işaretlenir. Hiçbir zaman işi düşürmez. */
  const verify = async (job, caller, st, { passageBody = null, questions }) => {
    if (process.env.CONTENT_AI_CHECK === '0' || !questions.length) return null;
    try {
      const { system, user } = checkPrompts({ passageBody, questions });
      const data = await callTutor(job, [{ role: 'system', content: system }, { role: 'user', content: user }], caller, { model: process.env.EVAL_MODEL || undefined, maxTokens: 800 });
      st.cost += costOf(data);
      const answers = extractJson(data)?.answers;
      if (!Array.isArray(answers)) return { status: 'error', model: data?.model || null, mismatches: [] };
      const mismatches = [];
      questions.forEach((q, i) => {
        const got = String(answers.find((a) => Number(a?.n) === i + 1)?.label || '').toUpperCase();
        if (got !== q.correctLabel) mismatches.push({ n: i + 1, expected: q.correctLabel, got: got || null });
      });
      return { status: mismatches.length ? 'mismatch' : 'agree', model: data?.model || null, mismatches };
    } catch (e) {
      return { status: 'error', code: e.aiCode || e.code || null, mismatches: [] };
    }
  };
  const stamp = (job, code, aiCheck) => (aiCheck
    ? rawQuery(`UPDATE content.item SET item_metadata = COALESCE(item_metadata, '{}'::jsonb) || $2::jsonb WHERE item_code = $1 AND item_tenant_code = $3`, [code, JSON.stringify({ aiCheck }), job.tenantCode]).catch(() => {})
    : Promise.resolve());

  const doQuestions = async (job, p, n, caller, ctx, st) => {
    const parsed = await ask(job, caller, st, { system: systemPrompt(p), user: userPrompt(p, n) }, maxTokensFor(p));
    const list = Array.isArray(parsed) ? parsed : parsed?.questions;
    if (!Array.isArray(list) || !list.length) { st.failed += n; return; }
    const made = [];
    for (const q of list.slice(0, n)) {
      const errs = checkQuestion(q);
      if (errs.length) { st.failed += 1; st.issue(`soru: ${errs.join(', ')}`); continue; }
      const body = questionBody(q, { questionTypeKey: p.questionTypeKey, difficulty: p.difficulty });
      try {
        const r = await withTransaction((tx) => items.createInTx(tx, ctx, caller, { ...common(job, p), kind: 'question', body }));
        st.produced += 1;
        made.push({ code: r.code, body });
      } catch (e) { st.failed += 1; st.issue(`soru kaydedilemedi: ${e.code || ''} ${e.details?.field || ''} ${e.message}`); }
    }
    st.failed += Math.max(0, n - list.length);
    const v = await verify(job, caller, st, { questions: made.map((m) => forCheck(m.body)) });
    if (v) await Promise.all(made.map((m, i) => stamp(job, m.code, { ...v, mismatches: v.mismatches.filter((x) => x.n === i + 1), status: v.status === 'error' ? 'error' : v.mismatches.some((x) => x.n === i + 1) ? 'mismatch' : 'agree' })));
  };

  const doNotes = async (job, p, _n, caller, ctx, st) => {
    const parsed = await ask(job, caller, st, notePrompts(p, await recentTitles('note')), maxTokensFor(p));
    const note = parsed?.note ?? (Array.isArray(parsed?.notes) ? parsed.notes[0] : null);
    const errs = checkNote(note, p);
    if (errs.length) { st.failed += 1; st.issue(`not: ${errs.join(', ')}`); return; }
    const qbs = note.checks.map((c) => questionBody(c, { questionTypeKey: p.questionTypeKey, difficulty: p.difficulty }));
    try {
      const r = await withTransaction(async (tx) => {
        const codes = [];
        for (const body of qbs) codes.push((await items.createInTx(tx, ctx, caller, { ...common(job, p), kind: 'question', checkQuestion: true, body })).code);
        return items.createInTx(tx, ctx, caller, { ...common(job, p), kind: 'note', title: String(note.title).slice(0, 300), body: noteBody(note, p, codes) });
      });
      st.produced += 1;
      await stamp(job, r.code, await verify(job, caller, st, { questions: qbs.map(forCheck) }));
    } catch (e) { st.failed += 1; st.issue(`not kaydedilemedi: ${e.code || ''} ${e.details?.field || ''} ${e.message}`); }
  };

  const doPassages = async (job, p, n, caller, ctx, st) => {
    const parsed = await ask(job, caller, st, passagePrompts(p, n, await recentTitles('passage')), maxTokensFor(p));
    const list = Array.isArray(parsed?.passages) ? parsed.passages : [];
    if (!list.length) { st.failed += n; return; }
    for (const x of list.slice(0, n)) {
      const errs = checkPassage(x, p);
      if (errs.length) { st.failed += 1; st.issue(`metin "${String(x?.title || '').slice(0, 40)}": ${errs.join(', ')}`); continue; }
      const body = passageBody(x, p);
      try {
        const r = await withTransaction((tx) => items.createInTx(tx, ctx, caller, { ...common(job, p), kind: 'passage', title: String(x.title).slice(0, 300), body }));
        st.produced += 1;
        await stamp(job, r.code, await verify(job, caller, st, { passageBody: x.body, questions: body.questions.map(forCheck) }));
      } catch (e) { st.failed += 1; st.issue(`metin kaydedilemedi: ${e.code || ''} ${e.details?.field || ''} ${e.message}`); }
    }
    st.failed += Math.max(0, n - list.length);
  };
  const HANDLERS = { question: doQuestions, note: doNotes, passage: doPassages };

  const processJob = async (job) => {
    const p = job.params;
    const caller = { callerUserId: job.requestedById, callerTenantCode: job.tenantCode, callerOrganizationId: job.organizationId, callerUserRole: 'content_editor' };
    const ctx = { tenantCode: Number(job.tenantCode), organizationId: Number(job.organizationId), userId: Number(job.requestedById) || null };
    const issues = [];
    const st = { produced: 0, failed: 0, cost: 0, model: job.model, issue: (m) => { if (issues.length < 20) issues.push(String(m).slice(0, 300)); } };
    const handler = HANDLERS[p.kind || 'question'];
    let remaining = job.requestedCount;
    while (remaining > 0) {
      const n = Math.min(unitsPerRequest(p), remaining);
      remaining -= n;
      try {
        await handler(job, p, n, caller, ctx, st);
      } catch (e) {
        const code = e.aiCode || e.code || 'CONTENT_AI_UNAVAILABLE';
        if (st.produced === 0 && st.failed === 0) { await failJob(job.id, code, e.message); return { failed: true }; }
        st.failed += n;
        st.issue(`model çağrısı başarısız: ${code}`);
        if (code === 'LLM_NOT_CONFIGURED') break;
      }
    }
    const { produced, failed, cost, model } = st;
    const status = produced === 0 ? 'failed' : 'completed';
    await rawQuery(
      `UPDATE content.generation_job SET generation_job_status=$2::varchar, generation_job_produced_count=$3, generation_job_failed_count=$4, generation_job_cost_micros=$5, generation_job_model=$6,
              generation_job_finished_at=$7, generation_job_error=CASE WHEN $2::varchar='failed' THEN 'No valid draft was produced' END,
              generation_job_metadata = (CASE WHEN $2::varchar='failed' THEN generation_job_metadata || '{"errorCode":"CONTENT_AI_BAD_OUTPUT"}'::jsonb ELSE generation_job_metadata END) || $8::jsonb WHERE generation_job_id=$1`,
      [job.id, status, Math.min(produced, 32000), Math.min(failed, 32000), cost, model, nowFn(), JSON.stringify({ issues })]);
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
    const warnings = [...out.warnings];
    if (item.kind === 'note') {
      const body = await loadBody(rawQuery, 'note', item.latestRevisionId);
      for (const c of body.checkQuestions.filter((x) => x.status === 'draft')) {
        try { await items.submit({ caller, code: c.questionItemCode }); } catch (e) { warnings.push({ field: 'checkQuestions', code: e.code || 'CHECK_SUBMIT_FAILED', message: e.message, childItemCode: c.questionItemCode }); }
      }
    }
    return { accepted: true, itemCode: Number(item.code), warnings, status: out.item.status };
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
