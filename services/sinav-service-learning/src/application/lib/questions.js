import { clamp, shuffle } from './util.js';

/**
 * Yayımlanmış soru havuzu (hafif satırlar). Kullanıcının son denediği zaman ile birlikte gelir (görmediğini öne al).
 * @param {object} f { examIds, typeIds?, skillIds?, tiers: ['free'|'premium'], language?, excludeItemIds?, noteCheckOnly? , limit }
 */
export const loadPublishedQuestions = async (q, userId, f) => {
  const params = [userId, f.examIds?.length ? f.examIds : null, f.language || null];
  let sql = `
    SELECT i.item_id AS "itemId", i.item_code AS "itemCode", qn.question_id AS "questionId", qn.question_question_type_id AS "typeId", qn.question_difficulty AS difficulty,
           qn.question_passage_item_id AS "passageItemId", qn.question_group_position AS "groupPosition", la."lastAttemptAt" AS "lastAttemptAt"
      FROM content.item i
      JOIN content.question qn ON qn.question_item_revision_id = i.item_published_revision_id
      LEFT JOIN (SELECT attempt_item_id, MAX(attempt_answered_at) AS "lastAttemptAt" FROM learning.attempt WHERE attempt_user_account_id=$1 GROUP BY attempt_item_id) la ON la.attempt_item_id = i.item_id
     WHERE i.item_kind='question' AND i.item_status='published'
       AND ($3::varchar IS NULL OR i.item_language=$3)
       AND ($2::bigint[] IS NULL OR EXISTS (SELECT 1 FROM content.item_exam ie WHERE ie.item_exam_item_id=i.item_id AND ie.item_exam_exam_id = ANY($2)))`;
  if (f.typeIds?.length) { params.push(f.typeIds); sql += ` AND qn.question_question_type_id = ANY($${params.length})`; }
  if (f.skillIds?.length) { params.push(f.skillIds); sql += ` AND EXISTS (SELECT 1 FROM content.item_skill s WHERE s.item_skill_item_id=i.item_id AND s.item_skill_skill_id = ANY($${params.length}))`; }
  if (f.tiers?.length) { params.push(f.tiers); sql += ` AND i.item_access_tier = ANY($${params.length})`; }
  if (f.excludeItemIds?.length) { params.push(f.excludeItemIds); sql += ` AND NOT (i.item_id = ANY($${params.length}))`; }
  if (f.itemIds?.length) { params.push(f.itemIds); sql += ` AND i.item_id = ANY($${params.length})`; }
  params.push(f.limit || 3000);
  sql += ` ORDER BY random() LIMIT $${params.length}`;
  const { rows } = await q(sql, params);
  return rows.map((r) => ({
    itemId: Number(r.itemId), itemCode: Number(r.itemCode), questionId: Number(r.questionId), typeId: Number(r.typeId), difficulty: r.difficulty,
    passageItemId: r.passageItemId ? Number(r.passageItemId) : null, groupPosition: r.groupPosition, lastAttemptAt: r.lastAttemptAt ? new Date(r.lastAttemptAt).getTime() : null,
  }));
};

/** Satırlardan "birim" üret: aynı metne bağlı sorular bir birim (art arda), tekil sorular tek birim. */
export const toUnits = (rows) => {
  const groups = new Map();
  const units = [];
  for (const r of rows) {
    if (r.passageItemId) {
      if (!groups.has(r.passageItemId)) groups.set(r.passageItemId, []);
      groups.get(r.passageItemId).push(r);
    } else units.push({ typeId: r.typeId, rows: [r], difficulty: r.difficulty, lastAttemptAt: r.lastAttemptAt, passageItemId: null });
  }
  for (const [pid, rs] of groups) {
    rs.sort((a, b) => (a.groupPosition || 0) - (b.groupPosition || 0));
    const seen = rs.filter((x) => x.lastAttemptAt);
    units.push({
      typeId: rs[0].typeId, rows: rs, passageItemId: pid, difficulty: rs.reduce((s, x) => s + x.difficulty, 0) / rs.length,
      lastAttemptAt: seen.length ? Math.max(...seen.map((x) => x.lastAttemptAt)) : null,
    });
  }
  return units;
};

const unitKey = (u, targetDiff, rnd) => {
  const unseenBucket = u.lastAttemptAt ? 1 : 0;
  const fit = targetDiff ? Math.abs(u.difficulty - targetDiff) : 0;
  const recency = u.lastAttemptAt ? Math.min(1, (Date.now() - u.lastAttemptAt) / (30 * 86400_000)) : 0; // eskiyi öne
  return unseenBucket * 100 + fit * 8 + (1 - recency) * 4 + rnd() * 3;
};

/**
 * Birimleri sayıya göre seç.
 * @param {Array} units toUnits çıktısı
 * @param {object} o { count, typeWeights: Map(typeId→ağırlık)|null, targetDifficulty|null, allowOvershoot=2, rnd }
 * @returns seçilen birimler (sıralı: karışık), toplam soru sayısı count'a yakın
 */
export const selectUnits = (units, { count, typeWeights = null, targetDifficulty = null, allowOvershoot = 2, rnd = Math.random }) => {
  const byType = new Map();
  for (const u of units) {
    if (!byType.has(u.typeId)) byType.set(u.typeId, []);
    byType.get(u.typeId).push(u);
  }
  for (const list of byType.values()) list.sort((a, b) => unitKey(a, targetDifficulty, rnd) - unitKey(b, targetDifficulty, rnd));
  const types = [...byType.keys()];
  if (!types.length) return [];
  const weights = new Map(types.map((t) => [t, typeWeights?.get(t) ?? 1]));
  const totalW = [...weights.values()].reduce((a, b) => a + b, 0) || 1;
  // En büyük kalan yöntemi: tür başına hedef soru sayısı
  const quota = new Map();
  let allocated = 0;
  const fr = [];
  for (const t of types) {
    const exact = (count * weights.get(t)) / totalW;
    quota.set(t, Math.floor(exact));
    allocated += Math.floor(exact);
    fr.push([t, exact - Math.floor(exact)]);
  }
  fr.sort((a, b) => b[1] - a[1]);
  for (let i = 0; allocated < count && i < fr.length; i += 1, allocated += 1) quota.set(fr[i][0], quota.get(fr[i][0]) + 1);
  const picked = [];
  let total = 0;
  const take = (t, limit) => {
    const list = byType.get(t);
    while (list.length && limit > 0) {
      const idx = list.findIndex((u) => u.rows.length <= limit + allowOvershoot);
      if (idx < 0) return limit;
      const [u] = list.splice(idx, 1);
      picked.push(u); total += u.rows.length; limit -= u.rows.length;
    }
    return limit;
  };
  for (const t of types) take(t, quota.get(t));
  // Eksik kalanı (havuz yetmeyen tür / birim büyüklüğü) kalan türlerden tamamla
  let guard = 0;
  while (total < count && guard < 50) {
    guard += 1;
    const open = types.filter((t) => byType.get(t).length);
    if (!open.length) break;
    const t = open.sort((a, b) => (picked.filter((u) => u.typeId === a).length) - (picked.filter((u) => u.typeId === b).length))[0];
    const before = total;
    take(t, count - total);
    if (total === before) { // sığmayan büyük birimler: en küçüğünü al (hiç soru yoksa)
      const smallest = byType.get(t).sort((a, b) => a.rows.length - b.rows.length)[0];
      if (!picked.length && smallest) { byType.get(t).splice(byType.get(t).indexOf(smallest), 1); picked.push(smallest); total += smallest.rows.length; } else byType.set(t, []);
    }
  }
  return shuffle(picked, rnd);
};

export const flattenUnits = (units) => units.flatMap((u) => u.rows);

/** Oturum maddelerini toplu ekle (position 1..n, verilen başlangıçtan). */
export const insertSessionItems = async (tx, ctx, sessionId, picks, startPosition = 1) => {
  if (!picks.length) return;
  await tx.query(
    `INSERT INTO learning.study_session_item (study_session_item_tenant_code, study_session_item_organization_id, study_session_item_study_session_id, study_session_item_position,
        study_session_item_item_id, study_session_item_question_id)
     SELECT $1,$2,$3,p,i,qq FROM unnest($4::int[], $5::bigint[], $6::bigint[]) AS t(p,i,qq)`,
    [ctx.tenantCode, ctx.orgId, sessionId, picks.map((_p, idx) => startPosition + idx), picks.map((p) => p.itemId), picks.map((p) => p.questionId)]);
};

/** Ustalığa göre hedef zorluk (1–5): ustalık 0 → 2, 100 → 5; "Bana göre" için hafif zorlayıcı. */
export const targetDifficultyFor = (mastery) => clamp(1.5 + (mastery / 100) * 3.5, 1, 5);
