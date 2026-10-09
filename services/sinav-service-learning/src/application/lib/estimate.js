import { scoreFromCounts, maxScore as maxScoreOf, requiredCorrect } from 'app-shared';
import { clamp, round2, round3 } from './util.js';
import { loadMasteryMap } from './mastery.js';

// Puan tahmini v1: HER ZAMAN aralık. Hiyerarşik Beta modeli: tür başına başarı oranı, genel orana
// κ=4 sahte gözlemle çekilir; blueprint'teki tür soru sayılarıyla ağırlıklanır; aralık ±1 sd.
//   m_t = (s_t + κ·p̂) / (n_t + κ),   Var(m_t) = m_t(1−m_t)/(n_t+κ+1),   E = Σ N_t·m_t,   sd = √Σ N_t²·Var(m_t)
export const ESTIMATE_ALGO = 'v1';
const KAPPA = 4;
const PRIOR_P = 0.35;
const PRIOR_STRENGTH = 4;

/** Zorluk düzeltmeli deneme değeri (referans zorluk 3): kolayı bilmek az, zoru bilmek tam kanıt. */
export const trialValue = ({ correct, blank = false, difficulty = 3 }) => {
  if (blank) return 0;
  if (correct) return clamp(0.7 + 0.1 * difficulty, 0, 1);
  return clamp(0.05 * (difficulty - 1), 0, 0.2);
};

/**
 * @param {{sections:[{typeId,count}], perType: Map<number,{s:number,n:number}>, scoring:{method,params}, questionCount:number, z?:number}} a
 */
export const estimateScore = ({ sections, perType, scoring, questionCount, z = 1 }) => {
  const totalN = sections.reduce((a, s) => a + s.count, 0) || questionCount || 1;
  let sumS = 0;
  let sumN = 0;
  for (const v of perType.values()) { sumS += v.s; sumN += v.n; }
  const pHat = (sumS + PRIOR_P * PRIOR_STRENGTH) / (sumN + PRIOR_STRENGTH);
  let expected = 0;
  let variance = 0;
  const types = [];
  for (const sec of sections) {
    const t = perType.get(sec.typeId) || { s: 0, n: 0 };
    const m = clamp((t.s + KAPPA * pHat) / (t.n + KAPPA), 0.02, 0.98);
    expected += sec.count * m;
    variance += sec.count * sec.count * (m * (1 - m)) / (t.n + KAPPA + 1);
    types.push({ typeId: sec.typeId, n: t.n, p: round3(m), count: sec.count });
  }
  const sd = Math.sqrt(variance);
  const eLow = clamp(expected - z * sd, 0, totalN);
  const eHigh = clamp(expected + z * sd, 0, totalN);
  const sc = (c) => scoreFromCounts({ correct: c, wrong: 0 }, scoring);
  const maxS = maxScoreOf(totalN, scoring);
  return {
    point: Math.min(maxS, sc(expected)), low: Math.min(maxS, sc(eLow)), high: Math.min(maxS, sc(eHigh)),
    correct: { point: round2(expected), low: round2(eLow), high: round2(eHigh) },
    confidence: round3(clamp(1 - sd / (0.3 * totalN), 0.05, 0.98)),
    basisQuestionCount: sumN, overall: round3(pHat), types, algorithmVersion: ESTIMATE_ALGO,
  };
};

export const scoringOf = (catalog) => ({ method: catalog.blueprint.scoringMethod, params: catalog.blueprint.scoringParams || {} });
export const sectionsOf = (catalog) => catalog.sections.map((s) => ({ typeId: s.questionTypeId, count: s.questionCount }));

/** Soru tipi ustalığından (practice_model) tahmin: p = 0.2 + 0.7·ustalık/100, n = kanıt sayısı. */
export const practiceEstimate = async (q, ctx, catalog) => {
  const mm = await loadMasteryMap(q, ctx.userId, 'type');
  const perType = new Map();
  for (const [id, v] of mm) perType.set(id, { s: v.evidence * (0.2 + 0.7 * v.mastery / 100), n: v.evidence });
  return estimateScore({ sections: sectionsOf(catalog), perType, scoring: scoringOf(catalog), questionCount: catalog.blueprint.questionCount });
};

/** Hiç kanıt yok (seviye tespiti atlandı): geniş, düşük güvenli başlangıç aralığı. */
export const defaultLevelEstimate = (catalog) =>
  estimateScore({ sections: sectionsOf(catalog), perType: new Map(), scoring: scoringOf(catalog), questionCount: catalog.blueprint.questionCount, z: 1 });

export const saveScoreEstimate = async (tx, ctx, { enrollmentId, source, sourceSessionId = null, est }) => {
  const { rows } = await tx.query(
    `INSERT INTO learning.score_estimate (score_estimate_tenant_code, score_estimate_organization_id, score_estimate_user_account_id, score_estimate_enrollment_id, score_estimate_source,
        score_estimate_source_session_id, score_estimate_score_low, score_estimate_score_high, score_estimate_score_point, score_estimate_confidence, score_estimate_basis_question_count, score_estimate_computed_at, score_estimate_metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING score_estimate_code AS code`,
    [ctx.tenantCode, ctx.orgId, ctx.userId, enrollmentId, source, sourceSessionId, est.low, est.high, est.point, est.confidence, est.basisQuestionCount, ctx.now,
      JSON.stringify({ algorithmVersion: est.algorithmVersion, correct: est.correct, overall: est.overall })]);
  return { code: Number(rows[0].code) };
};

export const latestEstimate = async (q, userId, enrollmentId) => {
  const { rows } = await q(
    `SELECT score_estimate_code AS code, score_estimate_source AS source, score_estimate_score_low::float8 AS low, score_estimate_score_high::float8 AS high, score_estimate_score_point::float8 AS point,
            score_estimate_confidence::float8 AS confidence, score_estimate_basis_question_count AS "basisQuestionCount", score_estimate_computed_at AS "computedAt", score_estimate_metadata AS meta
       FROM learning.score_estimate WHERE score_estimate_user_account_id=$1 AND score_estimate_enrollment_id=$2 ORDER BY score_estimate_computed_at DESC, score_estimate_id DESC LIMIT 1`, [userId, enrollmentId]);
  return rows[0] || null;
};

/** İstemciye giden tahmin biçimi: aralık + hedef için gereken/tahmin doğru sayıları. */
export const estimateView = (e, catalog, targetScore) => {
  if (!e) return null;
  const scoring = scoringOf(catalog);
  const need = requiredCorrect(targetScore, scoring, catalog.blueprint.questionCount);
  const corr = e.meta?.correct || null;
  return {
    low: e.low, high: e.high, point: e.point, confidence: e.confidence, source: e.source, computedAt: new Date(e.computedAt).toISOString(),
    basisQuestionCount: e.basisQuestionCount, scoreMax: catalog.blueprint.scoreMax,
    requiredCorrect: need,
    estimatedCorrect: corr ? { low: Math.round(corr.low), high: Math.round(corr.high), point: Math.round(corr.point) } : null,
  };
};

/** Kayıtlı en son tahmin eskiyse (≥1 saat ya da ≥5 soru farkı) ustalıktan yeni practice_model tahmini yazar. */
export const maybeRefreshEstimate = async (tx, ctx, { enrollmentId, catalog, sessionId = null, minQuestions = 5, answered = 0 }) => {
  if (!catalog?.blueprint || answered < minQuestions) return null;
  const last = await latestEstimate(tx.query.bind(tx), ctx.userId, enrollmentId);
  if (last && last.source === 'practice_model' && ctx.now - new Date(last.computedAt) < 3600_000) return null;
  const est = await practiceEstimate(tx.query.bind(tx), ctx, catalog);
  await saveScoreEstimate(tx, ctx, { enrollmentId, source: 'practice_model', sourceSessionId: sessionId, est });
  return est;
};
