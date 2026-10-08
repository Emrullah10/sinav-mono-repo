import { DomainError, consumeQuota, refundQuota, peekUsage, getEntitlements, fetchInternal, internalHeaders, INTERNAL_TIMEOUTS, registerUsageSeed } from 'app-shared';
import { EVAL_SYSTEM } from '../shared/prompts.js';
import { UUID_RE, requireCode, tenantOf, userIdOf, orgIdOf, getUserTimezone, insertAiUsage, wordDiff, clip } from '../shared/helpers.js';

const DIRECTIONS = { en_tr: ['en', 'tr'], tr_en: ['tr', 'en'] };
const DIFFICULTY_LABELS = { easy: [1, 2], medium: [3, 3], hard: [4, 5] };
const learningBase = () => (process.env.SERVICE_LEARNING_REST_URL || 'http://127.0.0.1:2003').replace(/\/+$/, '');

const directionOf = (src) => (src === 'tr' ? 'tr_en' : 'en_tr');

export const makeTranslation = ({ rawQuery, nowFn, llm }) => {
  // Redis 19 kaynağı: eksik sayaç, Postgres'teki değerlendirmelerden kurulur.
  registerUsageSeed('translation_evals_per_day', async ({ userId, from, to }) => Number((await rawQuery(
    `SELECT count(*) AS n FROM tutor.translation_evaluation WHERE translation_evaluation_user_account_id=$1 AND translation_evaluation_status IN ('pending','completed')
        AND translation_evaluation_created_at >= $2 AND translation_evaluation_created_at < $3`, [userId, from, to])).rows[0].n));
  registerUsageSeed('tutor_messages_per_day', async ({ userId, from, to }) => Number((await rawQuery(
    `SELECT count(*) AS n FROM tutor.message WHERE message_user_account_id=$1 AND message_role='user' AND COALESCE((message_metadata->>'quota')::boolean, false)
        AND message_created_at >= $2 AND message_created_at < $3`, [userId, from, to])).rows[0].n));

  const criteriaOf = async (rubricId) => (await rawQuery(
    `SELECT rubric_criterion_key AS key, rubric_criterion_name AS name, rubric_criterion_description AS description, rubric_criterion_max_points AS "maxPoints"
       FROM content.rubric_criterion WHERE rubric_criterion_rubric_id=$1 ORDER BY rubric_criterion_position NULLS LAST, rubric_criterion_id`, [rubricId])).rows;

  const usageOf = async (caller) => {
    const userId = userIdOf(caller);
    const p = await peekUsage({ userId, feature: 'translation_evals_per_day', tz: await getUserTimezone(rawQuery, userId), now: nowFn() });
    return { enabled: p.enabled, limit: p.limit, used: p.used, remaining: p.remaining, period: p.period };
  };

  const nextPrompt = async ({ caller, direction = 'en_tr', difficulty, area }) => {
    const dir = DIRECTIONS[direction];
    if (!dir) throw new DomainError('TUTOR_TRANSLATION_DIRECTION_INVALID', 'direction must be en_tr or tr_en');
    let range = [null, null];
    if (difficulty !== undefined && difficulty !== '') {
      if (DIFFICULTY_LABELS[difficulty]) range = DIFFICULTY_LABELS[difficulty];
      else { const n = Number(difficulty); if (!Number.isInteger(n) || n < 1 || n > 5) throw new DomainError('TUTOR_TRANSLATION_DIFFICULTY_INVALID', 'difficulty 1-5 or easy|medium|hard'); range = [n, n]; }
    }
    const userId = userIdOf(caller);
    const ent = await getEntitlements(userId);
    const row = (await rawQuery(
      `SELECT i.item_id AS "itemId", i.item_code AS code, tp.translation_prompt_source_text AS "sourceText", tp.translation_prompt_source_language AS src,
              tp.translation_prompt_difficulty AS difficulty, sa.subject_area_key AS area, i.item_access_tier AS tier, tp.translation_prompt_rubric_id AS "rubricId",
              EXISTS (SELECT 1 FROM tutor.translation_evaluation e WHERE e.translation_evaluation_user_account_id=$7 AND e.translation_evaluation_prompt_item_id = i.item_id
                       AND e.translation_evaluation_status='completed') AS done
         FROM content.translation_prompt tp
         JOIN content.item i ON i.item_published_revision_id = tp.translation_prompt_item_revision_id AND i.item_kind='translation_prompt' AND i.item_status='published'
         LEFT JOIN content.subject_area sa ON sa.subject_area_id = i.item_subject_area_id
        WHERE tp.translation_prompt_source_language=$1 AND tp.translation_prompt_target_language=$2
          AND ($3::int IS NULL OR tp.translation_prompt_difficulty >= $3::int) AND ($4::int IS NULL OR tp.translation_prompt_difficulty <= $4::int)
          AND ($5::varchar IS NULL OR sa.subject_area_key = $5::varchar) AND ($6::boolean OR i.item_access_tier = 'free')
        ORDER BY done ASC, random() LIMIT 1`,
      [dir[0], dir[1], range[0], range[1], area || null, ent.tier !== 'free', userId])).rows[0];
    if (!row) throw new DomainError('TUTOR_TRANSLATION_PROMPT_NOT_FOUND', 'No translation prompt available');
    return {
      promptCode: String(row.code), direction: directionOf(row.src), sourceText: row.sourceText, difficulty: row.difficulty, area: row.area || null, tier: row.tier,
      repeat: row.done, criteria: await criteriaOf(row.rubricId), usage: await usageOf(caller),
    };
  };

  const evalDto = (e, criteria = []) => {
    const sc = e.scores?.criteria || [];
    return {
      code: String(e.code), status: e.status, errorCode: e.feedback?.errorCode || null,
      promptCode: String(e.promptCode), direction: directionOf(e.src), sourceText: e.sourceText, userText: e.userText,
      scores: sc.length ? sc : criteria.map((c) => ({ key: c.key, name: c.name, points: null, maxPoints: c.maxPoints, comment: null })),
      totalScore: e.totalScore, maxScore: e.maxScore, suggestedTranslation: e.suggestedTranslation,
      feedback: e.status === 'completed' ? { summary: e.feedback?.summary || '', parts: e.feedback?.parts || [], notes: e.feedback?.notes || [] } : null,
      evaluatedAt: e.evaluatedAt, createdAt: e.createdAt,
    };
  };
  const EVAL_SELECT = `
    SELECT e.translation_evaluation_id AS id, e.translation_evaluation_code AS code, e.translation_evaluation_status AS status, e.translation_evaluation_user_text AS "userText",
           e.translation_evaluation_scores AS scores, e.translation_evaluation_total_score AS "totalScore", e.translation_evaluation_max_score AS "maxScore",
           e.translation_evaluation_suggested_translation AS "suggestedTranslation", e.translation_evaluation_feedback AS feedback, e.translation_evaluation_evaluated_at AS "evaluatedAt",
           e.translation_evaluation_created_at AS "createdAt", e.translation_evaluation_rubric_id AS "rubricId", i.item_code AS "promptCode",
           tp.translation_prompt_source_text AS "sourceText", tp.translation_prompt_source_language AS src
      FROM tutor.translation_evaluation e
      JOIN content.item i ON i.item_id = e.translation_evaluation_prompt_item_id
      JOIN content.translation_prompt tp ON tp.translation_prompt_item_revision_id = e.translation_evaluation_prompt_revision_id`;

  const get = async ({ caller, code }) => {
    const c = requireCode(code, 'TUTOR_EVALUATION_NOT_FOUND');
    const e = (await rawQuery(`${EVAL_SELECT} WHERE e.translation_evaluation_code=$1 AND e.translation_evaluation_user_account_id=$2`, [c, userIdOf(caller)])).rows[0];
    if (!e) throw new DomainError('TUTOR_EVALUATION_NOT_FOUND', 'Evaluation not found');
    return { ...evalDto(e, await criteriaOf(e.rubricId)), usage: await usageOf(caller) };
  };

  const buildEvalMessages = ({ dir, prompt, criteria, userText }) => {
    const L = [];
    L.push(`Yön: ${dir === 'en_tr' ? 'İngilizceden Türkçeye' : 'Türkçeden İngilizceye'}`);
    L.push(`<kaynak>\n${prompt.sourceText}\n</kaynak>`);
    L.push(`<referans>\n${prompt.referenceTranslation}\n</referans>`);
    if (Array.isArray(prompt.keyPoints) && prompt.keyPoints.length) L.push(`Anahtar noktalar: ${prompt.keyPoints.map((k) => (typeof k === 'string' ? k : JSON.stringify(k))).join(' | ')}`);
    L.push('Ölçütler (her biri 0 ile üst sınır arasında TAM SAYI):');
    for (const c of criteria) L.push(`- CRITERION:${c.key} (${c.name}, 0-${c.maxPoints}): ${c.description || ''}`);
    L.push(`<ogrenci_cevabi>\n${userText}\n</ogrenci_cevabi>`);
    L.push(`Şu JSON şemasıyla yanıtla:
{"scores":{${criteria.map((c) => `"${c.key}":0`).join(',')}},"criteriaComments":{${criteria.map((c) => `"${c.key}":"1 cümle Türkçe"`).join(',')}},"suggestedTranslation":"öğrencinin cevabını minimum değişiklikle düzelten çeviri (hedef dilde)","summary":"1-2 cümle Türkçe genel değerlendirme","changes":[{"from":"öğrencinin ifadesi","to":"düzeltme","explanation":"neden, Türkçe, tek cümle"}]}
suggestedTranslation, öğrencinin cümlesini mümkün olduğunca koruyarak yalnız gerekli yerleri düzeltmeli. En çok 6 değişiklik yaz.`);
    return [{ role: 'system', content: EVAL_SYSTEM, cache: true }, { role: 'user', content: L.join('\n') }];
  };

  const attachExplanations = (parts, changes) => {
    const notes = [];
    for (const c of changes) {
      const from = String(c?.from || '').toLowerCase(); const to = String(c?.to || '').toLowerCase(); const ex = clip(c?.explanation || '', 300);
      if (!ex) continue;
      const hit = parts.find((p) => !p.explanation && ((p.kind === 'deleted' && from && (p.text.toLowerCase().includes(from) || from.includes(p.text.toLowerCase())))
        || (p.kind === 'added' && to && (p.text.toLowerCase().includes(to) || to.includes(p.text.toLowerCase())))));
      if (hit) hit.explanation = ex; else notes.push(ex);
    }
    return notes;
  };

  const fireActivity = (caller, minutes) => {
    // Commit sonrası, en iyi çaba: learning henüz yoksa ya da yanıt vermezse sessizce geçilir.
    (async () => {
      try {
        await fetchInternal(`${learningBase()}/api/sinav-service-learning/v1/internal/activity`, {
          method: 'POST', headers: internalHeaders(caller), body: { userId: userIdOf(caller), kind: 'translation', minutes }, timeoutMs: INTERNAL_TIMEOUTS.bestEffort(),
        });
      } catch { /* yoksay */ }
    })();
  };

  const evaluate = async ({ caller, promptCode, userText, clientRef }) => {
    const userId = userIdOf(caller);
    const text = String(userText ?? '').trim();
    if (!text || text.length > 2000) throw new DomainError('TUTOR_EVALUATION_TEXT_INVALID', 'userText must be 1-2000 characters');
    if (clientRef && !UUID_RE.test(String(clientRef))) throw new DomainError('TUTOR_EVALUATION_TEXT_INVALID', 'clientRef must be a uuid');
    const pc = requireCode(promptCode, 'TUTOR_TRANSLATION_PROMPT_NOT_FOUND');
    const prompt = (await rawQuery(
      `SELECT i.item_id AS "itemId", i.item_access_tier AS tier, tp.translation_prompt_item_revision_id AS "revisionId", tp.translation_prompt_rubric_id AS "rubricId",
              tp.translation_prompt_source_text AS "sourceText", tp.translation_prompt_reference_translation AS "referenceTranslation", tp.translation_prompt_key_points AS "keyPoints",
              tp.translation_prompt_source_language AS src
         FROM content.item i JOIN content.translation_prompt tp ON tp.translation_prompt_item_revision_id = i.item_published_revision_id
        WHERE i.item_code=$1 AND i.item_kind='translation_prompt' AND i.item_status='published'`, [pc])).rows[0];
    if (!prompt) throw new DomainError('TUTOR_TRANSLATION_PROMPT_NOT_FOUND', 'Prompt not found');
    const ent = await getEntitlements(userId);
    if (prompt.tier !== 'free' && ent.tier === 'free') throw new DomainError('TUTOR_TRANSLATION_PROMPT_NOT_FOUND', 'Prompt not found');
    const criteria = await criteriaOf(prompt.rubricId);
    if (!criteria.length) throw new DomainError('TUTOR_RUBRIC_UNAVAILABLE', 'Rubric not available', undefined, 503);

    // Aynı clientRef: tamamlanmış sonucu döndür; başarısızsa aynı satırı yeniden dene.
    let rowId = null;
    if (clientRef) {
      const ex = (await rawQuery(`SELECT translation_evaluation_id AS id, translation_evaluation_code AS code, translation_evaluation_status AS status FROM tutor.translation_evaluation
                                   WHERE translation_evaluation_user_account_id=$1 AND translation_evaluation_client_ref=$2`, [userId, clientRef])).rows[0];
      if (ex?.status === 'completed') return get({ caller, code: ex.code });
      if (ex?.status === 'pending') throw new DomainError('TUTOR_EVALUATION_ALREADY_RUNNING', 'Evaluation already running');
      if (ex) rowId = ex.id;
    }
    const dir = directionOf(prompt.src);
    const tz = await getUserTimezone(rawQuery, userId);
    const fail = async (id, errorCode, quota) => {
      if (quota) await refundQuota({ userId, feature: 'translation_evals_per_day', tz, now: nowFn() }).catch(() => {});
      await rawQuery(`UPDATE tutor.translation_evaluation SET translation_evaluation_status='failed', translation_evaluation_feedback=$2, translation_evaluation_updated_at=now() WHERE translation_evaluation_id=$1`,
        [id, JSON.stringify({ errorCode })]);
    };
    const upsertPending = async (status) => {
      if (rowId) {
        await rawQuery(`UPDATE tutor.translation_evaluation SET translation_evaluation_status=$2, translation_evaluation_user_text=$3, translation_evaluation_feedback='{}'::jsonb, translation_evaluation_updated_at=now() WHERE translation_evaluation_id=$1`, [rowId, status, text]);
        return rowId;
      }
      return (await rawQuery(
        `INSERT INTO tutor.translation_evaluation (translation_evaluation_tenant_code, translation_evaluation_organization_id, translation_evaluation_user_account_id, translation_evaluation_prompt_item_id,
                translation_evaluation_prompt_revision_id, translation_evaluation_rubric_id, translation_evaluation_status, translation_evaluation_user_text, translation_evaluation_client_ref, translation_evaluation_created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$3) RETURNING translation_evaluation_id AS id`,
        [tenantOf(caller), orgIdOf(caller), userId, prompt.itemId, prompt.revisionId, prompt.rubricId, status, text, clientRef || null])).rows[0].id;
    };

    if (!llm.configured) {
      const id = await upsertPending('failed');
      await rawQuery(`UPDATE tutor.translation_evaluation SET translation_evaluation_feedback=$2 WHERE translation_evaluation_id=$1`, [id, JSON.stringify({ errorCode: 'LLM_NOT_CONFIGURED' })]);
      return get({ caller, code: (await rawQuery(`SELECT translation_evaluation_code AS code FROM tutor.translation_evaluation WHERE translation_evaluation_id=$1`, [id])).rows[0].code });
    }

    await consumeQuota({ userId, feature: 'translation_evals_per_day', tz, now: nowFn() });
    let id;
    try { id = await upsertPending('pending'); } catch (e) { await refundQuota({ userId, feature: 'translation_evals_per_day', tz, now: nowFn() }).catch(() => {}); throw e; }
    const started = Date.now();
    let res; let errorCode = null;
    try {
      res = await llm.complete({ messages: buildEvalMessages({ dir, prompt, criteria, userText: text }), model: llm.models.eval, json: true, maxTokens: 1200, task: 'translation_eval' });
      if (!res.json || typeof res.json !== 'object' || typeof res.json.scores !== 'object') throw new DomainError('LLM_BAD_OUTPUT', 'Model did not return the expected JSON', undefined, 502);
    } catch (e) { errorCode = e.code || 'LLM_UPSTREAM_ERROR'; }
    const latencyMs = Date.now() - started;
    await insertAiUsage(rawQuery, { caller, userId, feature: 'translation_eval', model: res?.model || llm.models.eval, usage: res?.usage, latencyMs, succeeded: !errorCode, requestRef: String(id), metadata: { errorCode } });
    if (errorCode) {
      await fail(id, errorCode, true);
    } else {
      const j = res.json;
      const scores = criteria.map((c) => {
        const raw = Math.round(Number(j.scores[c.key]));
        return { key: c.key, name: c.name, points: Number.isFinite(raw) ? Math.min(c.maxPoints, Math.max(0, raw)) : 0, maxPoints: c.maxPoints, comment: clip(j.criteriaComments?.[c.key] || '', 300) || null };
      });
      const suggested = clip(String(j.suggestedTranslation || '').trim() || prompt.referenceTranslation, 2200);
      const parts = wordDiff(text, suggested);
      const notes = attachExplanations(parts, Array.isArray(j.changes) ? j.changes.slice(0, 8) : []);
      await rawQuery(
        `UPDATE tutor.translation_evaluation SET translation_evaluation_status='completed', translation_evaluation_scores=$2, translation_evaluation_total_score=$3, translation_evaluation_max_score=$4,
                translation_evaluation_suggested_translation=$5, translation_evaluation_feedback=$6, translation_evaluation_model=$7, translation_evaluation_evaluated_at=now(), translation_evaluation_updated_at=now()
          WHERE translation_evaluation_id=$1`,
        [id, JSON.stringify({ criteria: scores }), scores.reduce((a, s) => a + s.points, 0), scores.reduce((a, s) => a + s.maxPoints, 0), suggested,
          JSON.stringify({ summary: clip(j.summary || '', 500), parts, notes }), String(res.model || llm.models.eval).slice(0, 60)]);
      fireActivity(caller, 2);
    }
    const code = (await rawQuery(`SELECT translation_evaluation_code AS code FROM tutor.translation_evaluation WHERE translation_evaluation_id=$1`, [id])).rows[0].code;
    return get({ caller, code });
  };

  return Object.freeze({ nextPrompt, evaluate, get });
};
