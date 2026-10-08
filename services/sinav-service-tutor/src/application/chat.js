import datasources from 'app-datasource';
import { DomainError, consumeQuota, refundQuota, peekUsage, withTransaction } from 'app-shared';
import { buildStablePrefix, QUESTION_LADDER, PRESET_INSTRUCTIONS } from '../shared/prompts.js';
import {
  MODES, requireCode, UUID_RE, clip, tenantOf, userIdOf, orgIdOf, getUserTimezone, insertAiUsage, makeFenceFilter, parseModelExtras,
} from '../shared/helpers.js';

const HISTORY_LIMIT = 20;
const MAX_INPUT = 4000;
const redis = () => datasources.coreAppRedis?.client;
const inflightKey = (userId) => `tutor:inflight:${userId}`;
const stopKey = (messageCode) => `tutor:stream:${messageCode}:stop`;
const ctxKey = (convCode) => `tutor:ctx:${convCode}`;

export const makeChat = ({ rawQuery, nowFn, llm, context, conversations }) => {
  const studentSummaryCached = async (caller, convCode) => {
    const r = redis();
    if (r) {
      try {
        const hit = await r.get(ctxKey(convCode));
        if (hit) { await r.expire(ctxKey(convCode), 1800); return JSON.parse(hit).student; }
      } catch { /* önbellek yoksa yeniden kur */ }
    }
    const s = await context.studentSummary(caller);
    if (r) { try { await r.set(ctxKey(convCode), JSON.stringify({ student: s.text }), 'EX', 1800); } catch { /* yoksay */ } }
    return s.text;
  };

  const buildPrompt = async ({ caller, conv, mode, text, preset, historyRows }) => {
    const [student, ctx, kw] = await Promise.all([
      studentSummaryCached(caller, String(conv.code)),
      context.loadPromptContext(conv),
      context.notesByKeyword(text),
    ]);
    const candidates = [...ctx.sources];
    for (const k of kw) if (!candidates.some((c) => c.code === k.code)) candidates.push(k);
    const stable = buildStablePrefix(mode) + (conv.contextKind === 'question' || conv.contextKind === 'mock_review' ? `\n\n${QUESTION_LADDER}` : '');
    const dyn = [
      'ÖĞRENCİ ÖZETİ', student,
      ctx.text ? `\n${ctx.text}` : '',
      `\nKAYNAK ADAYLARI (yalnız bunlar kaynak gösterilebilir; kod ve başlık aynen kullanılmalı)\n${candidates.length ? candidates.map((c) => `[kaynak:${c.code}|${c.title}]`).join('\n') : '(yok)'}`,
    ].filter(Boolean).join('\n');
    const wrapUser = (t) => `<ogrenci_mesaji>\n${t}\n</ogrenci_mesaji>`;
    const messages = [
      { role: 'system', content: stable, cache: true },
      { role: 'system', content: dyn },
      ...historyRows.map((h) => ({ role: h.role, content: h.role === 'user' ? wrapUser(h.content) : h.content })),
      { role: 'user', content: wrapUser(text) + (preset ? `\n[İstek: ${PRESET_INSTRUCTIONS[preset]}]` : '') },
    ];
    return { messages, candidates };
  };

  /**
   * SSE: text/event-stream. Olaylar: meta, token, block, done, error (ayrıntı docs/api/tutor.md).
   * SSE başlamadan önceki hatalar normal JSON hata zarfıdır (402 kota, 404, 409 vb.).
   */
  const sendMessage = async ({ caller, code, body = {}, res }) => {
    const userId = userIdOf(caller);
    const text = String(body.content ?? '').trim();
    if (!text || text.length > MAX_INPUT) throw new DomainError('TUTOR_MESSAGE_INVALID', 'Message must be 1-4000 characters');
    const preset = body.preset ? String(body.preset) : null;
    if (preset && !PRESET_INSTRUCTIONS[preset]) throw new DomainError('TUTOR_MESSAGE_INVALID', 'Unknown preset');
    const clientRef = body.clientRef ? String(body.clientRef) : null;
    if (clientRef && !UUID_RE.test(clientRef)) throw new DomainError('TUTOR_MESSAGE_INVALID', 'clientRef must be a uuid');
    if (body.mode !== undefined && !MODES.includes(body.mode)) throw new DomainError('TUTOR_MODE_INVALID', 'Unknown mode');

    const conv = await conversations.ownConversation(caller, code);
    const mode = body.mode || conv.mode;
    if (clientRef) {
      const dup = await rawQuery(`SELECT 1 FROM tutor.message WHERE message_user_account_id=$1 AND message_client_ref=$2`, [userId, clientRef]);
      if (dup.rows.length) throw new DomainError('TUTOR_MESSAGE_ALREADY_EXISTS', 'Message already sent');
    }

    const r = redis();
    const lock = inflightKey(userId);
    if (r && !(await r.set(lock, String(conv.code), 'EX', 120, 'NX'))) {
      throw new DomainError('TUTOR_STREAM_ALREADY_RUNNING', 'Another answer is still being written');
    }
    const releaseLock = async () => { if (r) { try { await r.del(lock); } catch { /* yoksay */ } } };

    const tz = await getUserTimezone(rawQuery, userId);
    let quotaState = null; let quotaConsumed = false;
    let userMsg; let asstMsg; let historyRows;
    try {
      if (llm.configured) { quotaState = await consumeQuota({ userId, feature: 'tutor_messages_per_day', tz, now: nowFn() }); quotaConsumed = true; }
      historyRows = (await rawQuery(
        `SELECT message_role AS role, message_content AS content FROM (
           SELECT message_id, message_role, message_content FROM tutor.message
            WHERE message_conversation_id=$1 AND message_role IN ('user','assistant') AND message_status IN ('complete','interrupted') AND message_content <> ''
            ORDER BY message_id DESC LIMIT ${HISTORY_LIMIT}) h ORDER BY message_id`, [conv.id])).rows;
      await withTransaction(async (tx) => {
        const ins = (role, status, content, extra = {}) => tx.query(
          `INSERT INTO tutor.message (message_tenant_code, message_organization_id, message_conversation_id, message_user_account_id, message_role, message_status, message_content,
                                      message_preset, message_client_ref, message_metadata, message_created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$4) RETURNING message_id AS id, message_code AS code`,
          [tenantOf(caller), orgIdOf(caller), conv.id, userId, role, status, content, extra.preset ?? null, extra.clientRef ?? null, JSON.stringify(extra.metadata || {})]);
        userMsg = (await ins('user', 'complete', text, { preset, clientRef, metadata: { quota: quotaConsumed } })).rows[0];
        asstMsg = (await ins('assistant', 'streaming', '', { metadata: { mode } })).rows[0];
        await tx.query(
          `UPDATE tutor.conversation SET conversation_message_count = conversation_message_count + 2, conversation_last_message_at = now(), conversation_mode=$2,
                  conversation_title = CASE WHEN conversation_title IS NULL THEN $3 ELSE conversation_title END, conversation_updated_at = now()
            WHERE conversation_id=$1`, [conv.id, mode, clip(text.replace(/\s+/g, ' '), 60)]);
      });
    } catch (e) {
      if (quotaConsumed) await refundQuota({ userId, feature: 'tutor_messages_per_day', tz, now: nowFn() }).catch(() => {});
      await releaseLock();
      throw e;
    }

    // ── SSE başlıyor: bundan sonra hata fırlatılmaz, `error` olayı yazılır ──
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const send = (event, data) => { if (!res.writableEnded && !res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };

    const ac = new AbortController();
    let abortReason = null;
    let finished = false;
    res.on('close', () => { if (!finished) { abortReason = abortReason || 'disconnect'; ac.abort(); } });
    const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(': ping\n\n'); if (r) r.expire(lock, 120).catch(() => {}); }, 15000);
    const stopPoll = setInterval(async () => {
      if (!r) return;
      try { if (await r.get(stopKey(asstMsg.code))) { abortReason = 'stop'; ac.abort(); } } catch { /* yoksay */ }
    }, 400);

    const remainingNow = () => (quotaState && quotaState.limit != null ? { limit: quotaState.limit, used: quotaState.used, remaining: Math.max(0, quotaState.limit - quotaState.used), period: quotaState.period || 'day' } : { limit: null, used: null, remaining: null, period: 'day' });
    send('meta', { messageCode: String(asstMsg.code), userMessageCode: String(userMsg.code), conversationCode: String(conv.code), mode, remaining: remainingNow() });

    const started = Date.now();
    const filter = makeFenceFilter();
    let visible = ''; let tokenCount = 0; let result = null; let failure = null; let candidates = [];
    try {
      const built = await buildPrompt({ caller, conv, mode, text, preset, historyRows });
      candidates = built.candidates;
      result = await llm.stream({
        messages: built.messages, model: llm.models.tutor, signal: ac.signal, maxTokens: 1400,
        onToken: (piece) => {
          const safe = filter.push(piece);
          if (safe) { visible += safe; tokenCount += 1; send('token', { text: safe }); }
        },
      });
    } catch (e) { failure = e; }
    const { tail, fenced } = filter.finish();
    if (tail && !failure) { visible += tail; tokenCount += 1; send('token', { text: tail }); }

    const interrupted = failure?.name === 'AbortError' || (abortReason && !!failure);
    let status = 'complete'; let errorCode = null; let extras = { blocks: [], sources: [], unsure: false };
    if (failure) {
      status = interrupted ? 'interrupted' : 'failed';
      errorCode = interrupted ? null : (failure.code || 'LLM_UPSTREAM_ERROR');
    } else {
      extras = parseModelExtras(fenced, candidates);
    }
    const content = visible.trim();
    const noToken = tokenCount === 0;
    if (quotaConsumed && noToken && status !== 'complete') await refundQuota({ userId, feature: 'tutor_messages_per_day', tz, now: nowFn() }).catch(() => {});
    const refunded = quotaConsumed && noToken && status !== 'complete';
    if (refunded) { await rawQuery(`UPDATE tutor.message SET message_metadata = message_metadata || '{"quota":false}'::jsonb WHERE message_id=$1`, [userMsg.id]).catch(() => {}); }

    const usage = result?.usage || { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costMicros: 0 };
    const latencyMs = Date.now() - started;
    const modelUsed = result?.model || llm.models.tutor;
    try {
      await rawQuery(
        `UPDATE tutor.message SET message_status=$2, message_content=$3, message_blocks=$4, message_sources=$5, message_needs_expert_review=$6, message_model=$7,
                message_input_tokens=$8, message_output_tokens=$9, message_cache_read_tokens=$10, message_latency_ms=$11, message_finished_at=now(), message_error_code=$12, message_updated_at=now()
          WHERE message_id=$1`,
        [asstMsg.id, status, content, JSON.stringify(extras.blocks), JSON.stringify(extras.sources), extras.unsure, String(modelUsed).slice(0, 60),
          usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, latencyMs, errorCode]);
    } catch (e) { console.error('[tutor] mesaj güncellenemedi', e.message); }
    if (llm.configured) {
      await insertAiUsage(rawQuery, { caller, userId, feature: 'tutor_chat', model: modelUsed, usage, latencyMs, succeeded: status === 'complete', requestRef: String(asstMsg.code), metadata: { mode, status, errorCode } });
    }

    clearInterval(heartbeat); clearInterval(stopPoll);
    if (r) { await r.del(stopKey(asstMsg.code)).catch(() => {}); }
    await releaseLock();

    let remaining = remainingNow();
    try {
      const p = await peekUsage({ userId, feature: 'tutor_messages_per_day', tz, now: nowFn() });
      remaining = { limit: p.limit, used: p.used, remaining: p.remaining, period: p.period };
    } catch { /* yoksay */ }
    if (status === 'failed') {
      send('error', { messageCode: String(asstMsg.code), code: errorCode, retryable: errorCode !== 'LLM_NOT_CONFIGURED', partial: !noToken, remaining });
    } else {
      for (const b of extras.blocks) send('block', { messageCode: String(asstMsg.code), block: b });
      send('done', {
        messageCode: String(asstMsg.code), status, content,
        usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cacheReadTokens: usage.cacheReadTokens },
        sources: extras.sources, needsExpertReview: extras.unsure, remaining,
      });
    }
    finished = true;
    res.end();
    return undefined;
  };

  const stop = async ({ caller, code }) => {
    const c = requireCode(code, 'TUTOR_MESSAGE_NOT_FOUND');
    const m = (await rawQuery(`SELECT message_status AS status, message_role AS role FROM tutor.message WHERE message_code=$1 AND message_user_account_id=$2`, [c, userIdOf(caller)])).rows[0];
    if (!m || m.role !== 'assistant') throw new DomainError('TUTOR_MESSAGE_NOT_FOUND', 'Message not found');
    if (m.status !== 'streaming') return { stopped: false, status: m.status };
    const r = redis();
    if (r) await r.set(stopKey(c), '1', 'EX', 600);
    return { stopped: true, status: 'streaming' };
  };

  /** cron: süreç çökmesinden kalan 'streaming' mesajları kapatır. */
  const sweepStale = async () => {
    const r = await rawQuery(`UPDATE tutor.message SET message_status='interrupted', message_finished_at=now(), message_updated_at=now() WHERE message_status='streaming' AND message_created_at < now() - interval '10 minutes'`);
    return { changed: r.rowCount ?? 0 };
  };

  return Object.freeze({ sendMessage, stop, sweepStale });
};
