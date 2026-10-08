import { createHash } from 'node:crypto';
import { DomainError } from 'app-shared';

export const CODE_RE = /^\d{1,18}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MODES = ['free', 'explain', 'sentence_xray', 'translation_coach'];
export const CONTEXT_KINDS = ['none', 'question', 'mock_review', 'note'];
export const REPORT_REASONS = ['wrong_info', 'unclear', 'off_topic', 'inappropriate', 'other'];
export const CMS_STATUSES = ['open', 'in_review', 'resolved', 'rejected'];

export const tenantOf = (caller) => Number(caller.callerTenantCode) || 1;
export const userIdOf = (caller) => Number(caller.callerUserId);
export const orgIdOf = (caller) => Number(caller.callerOrganizationId);

export const requireCode = (value, errCode) => {
  const s = String(value ?? '');
  if (!CODE_RE.test(s)) throw new DomainError(errCode, 'Not found');
  return s;
};

export const clip = (s, n) => { const v = String(s ?? ''); return v.length > n ? `${v.slice(0, n - 1)}…` : v; };

/** Öğrenci kimliği modele yalnız takma adla gider: ad ve e-posta ASLA. */
export const pseudonym = (userId) => `ogr-${createHash('sha256').update(`odak-tutor:${userId}`).digest('hex').slice(0, 8)}`;

export const getUserTimezone = async (rawQuery, userId) => {
  const { rows } = await rawQuery(`SELECT user_account_timezone AS tz FROM identity.user_account WHERE user_account_id=$1`, [userId]);
  return rows[0]?.tz || 'Europe/Istanbul';
};

let platformOrgCache = null;
export const getPlatformOrgId = async (rawQuery) => {
  if (platformOrgCache) return platformOrgCache;
  const { rows } = await rawQuery(`SELECT organization_id AS id FROM identity.organization WHERE organization_type='platform' ORDER BY organization_id LIMIT 1`);
  platformOrgCache = rows[0] ? Number(rows[0].id) : null;
  return platformOrgCache;
};

export const insertAiUsage = async (rawQuery, { caller, userId, feature, model, usage = {}, latencyMs = null, succeeded, requestRef = null, metadata = {} }) => {
  try {
    await rawQuery(
      `INSERT INTO tutor.ai_usage (ai_usage_tenant_code, ai_usage_organization_id, ai_usage_user_account_id, ai_usage_feature, ai_usage_model,
                                   ai_usage_input_tokens, ai_usage_output_tokens, ai_usage_cache_read_tokens, ai_usage_cache_write_tokens,
                                   ai_usage_latency_ms, ai_usage_cost_micros, ai_usage_succeeded, ai_usage_request_ref, ai_usage_metadata)
       VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,0,$8,$9,$10,$11,$12)`,
      [tenantOf(caller || {}), userId ?? null, feature, String(model || 'unknown').slice(0, 60), usage.inputTokens ?? 0, usage.outputTokens ?? 0,
        usage.cacheReadTokens ?? 0, latencyMs, usage.costMicros ?? 0, !!succeeded, requestRef ? String(requestRef).slice(0, 80) : null, JSON.stringify(metadata)]);
  } catch (e) {
    console.error('[tutor] ai_usage yazılamadı', e.message);
  }
};

// ── Akış filtresi: ilk ``` çitinden sonrası öğrenciye gönderilmez, tamponda toplanır ─────────
export const makeFenceFilter = () => {
  let pending = '';
  let fenced = '';
  let inFence = false;
  return {
    /** @returns {string} öğrenciye gönderilecek güvenli metin */
    push(piece) {
      if (inFence) { fenced += piece; return ''; }
      pending += piece;
      const i = pending.indexOf('```');
      if (i >= 0) {
        const out = pending.slice(0, i);
        fenced = pending.slice(i);
        pending = '';
        inFence = true;
        return out;
      }
      // sonda yarım çit (` ya da ``) olabilir: tut
      const m = /`{1,2}$/.exec(pending);
      const keep = m ? m[0].length : 0;
      const out = pending.slice(0, pending.length - keep);
      pending = pending.slice(pending.length - keep);
      return out;
    },
    finish() { const out = inFence ? '' : pending; pending = ''; return { tail: out, fenced }; },
  };
};

const BLOCK_TYPES = new Set(['mini_question', 'sentence_xray', 'table']);
const str = (v, n) => clip(typeof v === 'string' ? v : v == null ? '' : String(v), n);

export const sanitizeBlock = (b) => {
  if (!b || typeof b !== 'object' || !BLOCK_TYPES.has(b.type)) return null;
  if (b.type === 'mini_question') {
    const options = (Array.isArray(b.options) ? b.options : []).slice(0, 5).map((o) => ({ label: str(o?.label, 2).toUpperCase(), text: str(o?.text, 200) })).filter((o) => o.label && o.text);
    if (!b.stem || options.length < 2) return null;
    const answerLabel = str(b.answerLabel, 2).toUpperCase();
    return { type: 'mini_question', stem: str(b.stem, 600), options, answerLabel: options.some((o) => o.label === answerLabel) ? answerLabel : null, explanation: str(b.explanation, 600) };
  }
  if (b.type === 'sentence_xray') {
    const parts = (Array.isArray(b.parts) ? b.parts : []).slice(0, 14).map((p, i) => ({ no: Number(p?.no) || i + 1, text: str(p?.text, 200), role: str(p?.role, 60), function: str(p?.function, 200), main: !!p?.main })).filter((p) => p.text);
    if (!b.sentence || !parts.length) return null;
    return { type: 'sentence_xray', sentence: str(b.sentence, 500), parts, skeleton: str(b.skeleton, 200), translation: str(b.translation, 500) };
  }
  const columns = (Array.isArray(b.columns) ? b.columns : []).slice(0, 6).map((c) => str(c, 60));
  const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 20).map((r) => (Array.isArray(r) ? r.slice(0, columns.length || 6).map((c) => str(c, 200)) : [])).filter((r) => r.length);
  if (!columns.length || !rows.length) return null;
  return { type: 'table', title: str(b.title, 120), columns, rows };
};

/** Modelin çitli JSON bloğunu ayrıştırır. @returns {{blocks:object[], sources:object[], unsure:boolean}} */
export const parseModelExtras = (fenced, sourceCandidates = []) => {
  const empty = { blocks: [], sources: [], unsure: false };
  if (!fenced) return empty;
  const m = /```json\s*([\s\S]*?)(?:```|$)/i.exec(fenced);
  if (!m) return empty;
  let data; try { data = JSON.parse(m[1].trim()); } catch { return empty; }
  if (!data || typeof data !== 'object') return empty;
  const blocks = (Array.isArray(data.blocks) ? data.blocks : []).slice(0, 4).map(sanitizeBlock).filter(Boolean);
  const byCode = new Map(sourceCandidates.map((s) => [String(s.code), s]));
  const sources = [];
  for (const s of Array.isArray(data.sources) ? data.sources : []) {
    const c = byCode.get(String(s?.code));
    if (c && !sources.some((x) => x.code === c.code)) sources.push({ kind: c.kind, code: String(c.code), title: c.title });
  }
  return { blocks, sources, unsure: data.unsure === true };
};

// ── Kelime düzeyi fark (çeviri değerlendirme) ───────────────────────────────
const tokenize = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
const norm = (w) => w.toLocaleLowerCase('tr').replace(/[.,;:!?"'“”‘’()]/g, '');

/** @returns {{kind:'kept'|'deleted'|'added', text:string}[]} birleşik ardışık parçalar */
export const wordDiff = (userText, suggested) => {
  const a = tokenize(userText); const b = tokenize(suggested);
  const n = a.length; const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) dp[i][j] = norm(a[i]) === norm(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const raw = [];
  let i = 0; let j = 0;
  while (i < n && j < m) {
    if (norm(a[i]) === norm(b[j])) { raw.push(['kept', b[j]]); i += 1; j += 1; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { raw.push(['deleted', a[i]]); i += 1; }
    else { raw.push(['added', b[j]]); j += 1; }
  }
  while (i < n) { raw.push(['deleted', a[i]]); i += 1; }
  while (j < m) { raw.push(['added', b[j]]); j += 1; }
  const parts = [];
  for (const [kind, w] of raw) {
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.text += ` ${w}`; else parts.push({ kind, text: w });
  }
  return parts;
};
