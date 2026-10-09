import { clamp, round2, round3 } from './util.js';

// Ustalık modeli v1 (Elo/Bayes benzeri). 0–100 ölçek; her beceri/soru tipi için ayrı.
//  beklenen(m,d) = 0.2 + 0.8·σ((m − gereksinim(d)) / 15)     (0.2 = beş şıkta rastgele tahmin)
//  Δ = K(kanıt) · (sonuç − beklenen) · ağırlık,  K = clamp(60/(1+kanıt), 4, 30),  |Δ| ≤ 25
//  sonuç: doğru 1 · ipucuyla doğru 0.6 · yanlış/boş 0
export const MASTERY_ALGO = 'v1';
const REQ = [20, 35, 50, 65, 80];

export const requirementOf = (difficulty) => REQ[clamp(Math.round(difficulty || 3), 1, 5) - 1];
export const expectedCorrect = (mastery, difficulty) => 0.2 + 0.8 / (1 + Math.exp(-(mastery - requirementOf(difficulty)) / 15));
export const confidenceOf = (evidence) => round3(1 - Math.exp(-(evidence || 0) / 8));
export const levelOf = (mastery, evidence = 0) => {
  if (!evidence || evidence < 3) return 'new';
  if (mastery < 30) return 'learning';
  if (mastery < 55) return 'developing';
  if (mastery < 80) return 'good';
  return 'strong';
};

/** Saf: tek cevaptan sonraki ustalık. outcome yoksa correct/hinted'den türetilir. */
export const nextMastery = ({ mastery = 0, evidence = 0 }, { correct, hinted = false, difficulty = 3, weight = 1, outcome = null }) => {
  const o = outcome ?? (correct ? (hinted ? 0.6 : 1) : 0);
  const k = clamp(60 / (1 + evidence), 4, 30);
  const delta = clamp(k * (o - expectedCorrect(mastery, difficulty)) * weight, -25, 25);
  const after = clamp(mastery + delta, 0, 100);
  return { mastery: round2(after), delta: round2(after - mastery), evidence: evidence + 1 };
};

const TABLES = {
  skill: { table: 'learning.skill_mastery', p: 'skill_mastery', idCol: 'skill_id' },
  type: { table: 'learning.question_type_mastery', p: 'question_type_mastery', idCol: 'question_type_id' },
};

/** Kullanıcının ustalık satırları: Map(id → { mastery, evidence, confidence, lastEvidenceAt }) */
export const loadMasteryMap = async (q, userId, kind, ids = null) => {
  const t = TABLES[kind];
  const { rows } = await q(
    `SELECT ${t.p}_${t.idCol} AS id, ${t.p}_mastery::float8 AS mastery, ${t.p}_evidence_count AS evidence, ${t.p}_confidence::float8 AS confidence, ${t.p}_last_evidence_at AS "lastEvidenceAt", ${t.p}_last_delta::float8 AS "lastDelta"
       FROM ${t.table} WHERE ${t.p}_user_account_id=$1 ${ids ? `AND ${t.p}_${t.idCol} = ANY($2)` : ''}`, ids ? [userId, ids] : [userId]);
  return new Map(rows.map((r) => [Number(r.id), { mastery: r.mastery, evidence: r.evidence, confidence: r.confidence, lastEvidenceAt: r.lastEvidenceAt, lastDelta: r.lastDelta }]));
};

/** 7 günlük değişim: mastery_snapshot (≤ bugün−7 en yakın, yoksa en eski) ile mevcut ustalık farkı. Map(id → delta) */
export const loadChange7d = async (q, userId, kind, today, currentMap) => {
  const col = kind === 'skill' ? 'mastery_snapshot_skill_id' : 'mastery_snapshot_question_type_id';
  const { rows } = await q(
    `SELECT ${col} AS id, mastery_snapshot_mastery::float8 AS mastery, mastery_snapshot_snapshot_date::text AS date
       FROM learning.mastery_snapshot
      WHERE mastery_snapshot_user_account_id=$1 AND ${col} IS NOT NULL AND mastery_snapshot_snapshot_date < $2::date
      ORDER BY mastery_snapshot_snapshot_date`, [userId, today]);
  const cutoff = new Date(`${today}T00:00:00Z`).getTime() - 7 * 86400000;
  const base = new Map(); // id → { old?: row, first?: row }
  for (const r of rows) {
    const id = Number(r.id);
    const b = base.get(id) || {};
    if (!b.first) b.first = r;
    if (new Date(`${r.date}T00:00:00Z`).getTime() <= cutoff) b.old = r; // tarih artan: en yakın eski olan kalır
    base.set(id, b);
  }
  const out = new Map();
  for (const [id, b] of base) {
    const ref = b.old || b.first;
    const cur = currentMap.get(id);
    if (cur && ref) out.set(id, round2(cur.mastery - ref.mastery));
  }
  return out;
};

/**
 * Ustalık güncelle (beceri + soru tipi) ve bugünkü anlık görüntüyü yaz.
 * @param {object} a { questionTypeId, skills:[{id,weight}], difficulty, correct, hinted, outcome?, bonus?, now }
 * @returns {{ skillDeltas:[{skillId,before,after,delta}], typeDelta:{before,after,delta} }}
 */
export const updateMastery = async (tx, ctx, a) => {
  const q = tx.query.bind(tx);
  const skills = (a.skills || []).filter((s) => s?.id);
  const typeId = a.questionTypeId ? Number(a.questionTypeId) : null;
  const apply = async (kind, ids) => {
    if (!ids.length) return new Map();
    const t = TABLES[kind];
    const sorted = [...new Set(ids)].sort((x, y) => x - y); // kilit sırası sabit (deadlock önleme)
    for (const id of sorted) {
      await q(
        `INSERT INTO ${t.table} (${t.p}_tenant_code, ${t.p}_organization_id, ${t.p}_user_account_id, ${t.p}_${t.idCol}) VALUES ($1,$2,$3,$4)
         ON CONFLICT (${t.p}_user_account_id, ${t.p}_${t.idCol}) DO NOTHING`, [ctx.tenantCode, ctx.orgId, ctx.userId, id]);
    }
    const { rows } = await q(
      `SELECT ${t.p}_${t.idCol} AS id, ${t.p}_mastery::float8 AS mastery, ${t.p}_evidence_count AS evidence FROM ${t.table}
        WHERE ${t.p}_user_account_id=$1 AND ${t.p}_${t.idCol} = ANY($2) ORDER BY ${t.p}_${t.idCol} FOR UPDATE`, [ctx.userId, sorted]);
    return new Map(rows.map((r) => [Number(r.id), { mastery: r.mastery, evidence: r.evidence }]));
  };
  const skillRows = await apply('skill', skills.map((s) => s.id));
  const typeRows = await apply('type', typeId ? [typeId] : []);
  const out = { skillDeltas: [], typeDelta: null };
  const write = async (kind, id, before, res) => {
    const t = TABLES[kind];
    const after = clamp(res.mastery + (a.bonus || 0), 0, 100);
    await q(
      `UPDATE ${t.table} SET ${t.p}_mastery=$3, ${t.p}_evidence_count=$4, ${t.p}_confidence=$5, ${t.p}_last_delta=$6, ${t.p}_last_evidence_at=$7
        WHERE ${t.p}_user_account_id=$1 AND ${t.p}_${t.idCol}=$2`, [ctx.userId, id, round2(after), res.evidence, confidenceOf(res.evidence), round2(after - before.mastery), a.now || ctx.now]);
    return { before: before.mastery, after: round2(after), delta: round2(after - before.mastery) };
  };
  for (const s of skills) {
    const before = skillRows.get(s.id);
    const res = nextMastery(before, { correct: a.correct, hinted: a.hinted, difficulty: a.difficulty, weight: s.weight ?? 1, outcome: a.outcome ?? null });
    out.skillDeltas.push({ skillId: s.id, ...(await write('skill', s.id, before, res)) });
    skillRows.set(s.id, { mastery: out.skillDeltas.at(-1).after, evidence: res.evidence });
  }
  if (typeId) {
    const before = typeRows.get(typeId);
    const res = nextMastery(before, { correct: a.correct, hinted: a.hinted, difficulty: a.difficulty, weight: 1, outcome: a.outcome ?? null });
    out.typeDelta = { questionTypeId: typeId, ...(await write('type', typeId, before, res)) };
  }
  await snapshotMastery(tx, ctx, { skillIds: skills.map((s) => s.id), typeIds: typeId ? [typeId] : [] });
  return out;
};

/** Bugünün anlık görüntüsünü (gün sonu değeri olarak) yazar. */
export const snapshotMastery = async (tx, ctx, { skillIds = [], typeIds = [] }) => {
  if (skillIds.length) {
    await tx.query(
      `INSERT INTO learning.mastery_snapshot (mastery_snapshot_tenant_code, mastery_snapshot_organization_id, mastery_snapshot_user_account_id, mastery_snapshot_snapshot_date, mastery_snapshot_skill_id, mastery_snapshot_mastery)
       SELECT $1,$2,$3,$4, skill_mastery_skill_id, skill_mastery_mastery FROM learning.skill_mastery WHERE skill_mastery_user_account_id=$3 AND skill_mastery_skill_id = ANY($5)
       ON CONFLICT (mastery_snapshot_user_account_id, mastery_snapshot_snapshot_date, mastery_snapshot_skill_id, mastery_snapshot_question_type_id) DO UPDATE SET mastery_snapshot_mastery = EXCLUDED.mastery_snapshot_mastery`,
      [ctx.tenantCode, ctx.orgId, ctx.userId, ctx.today, [...new Set(skillIds)]]);
  }
  if (typeIds.length) {
    await tx.query(
      `INSERT INTO learning.mastery_snapshot (mastery_snapshot_tenant_code, mastery_snapshot_organization_id, mastery_snapshot_user_account_id, mastery_snapshot_snapshot_date, mastery_snapshot_question_type_id, mastery_snapshot_mastery)
       SELECT $1,$2,$3,$4, question_type_mastery_question_type_id, question_type_mastery_mastery FROM learning.question_type_mastery WHERE question_type_mastery_user_account_id=$3 AND question_type_mastery_question_type_id = ANY($5)
       ON CONFLICT (mastery_snapshot_user_account_id, mastery_snapshot_snapshot_date, mastery_snapshot_skill_id, mastery_snapshot_question_type_id) DO UPDATE SET mastery_snapshot_mastery = EXCLUDED.mastery_snapshot_mastery`,
      [ctx.tenantCode, ctx.orgId, ctx.userId, ctx.today, [...new Set(typeIds)]]);
  }
};

/** Kanıt sayısı hesabı için ağırlıklı bonus (not kontrolü 3/3 vb.): ustalığa doğrudan ekler. */
export const boostSkills = async (tx, ctx, skillIds, amount) => {
  if (!skillIds.length) return;
  await tx.query(
    `UPDATE learning.skill_mastery SET skill_mastery_mastery = LEAST(100, skill_mastery_mastery + $3), skill_mastery_last_delta = $3, skill_mastery_last_evidence_at=$4
      WHERE skill_mastery_user_account_id=$1 AND skill_mastery_skill_id = ANY($2)`, [ctx.userId, skillIds, amount, ctx.now]);
  await snapshotMastery(tx, ctx, { skillIds });
};
