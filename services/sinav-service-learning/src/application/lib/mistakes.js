// Hata defteri ve aralıklı tekrar. Merdiven (gün): 1 → 3 → 7 → 14 → 30; yeni hata 3 gün sonra gelir;
// tekrarda yanlış: aralık 1 güne iner, seri sıfırlanır; ardışık 3 doğru tekrar → çözüldü.
export const MISTAKE_LADDER_DAYS = [1, 3, 7, 14, 30];
export const NEW_MISTAKE_INTERVAL_DAYS = 3;
export const RESOLVE_STREAK = 3;
const DAY = 86400_000;

export const nextInterval = (current) => MISTAKE_LADDER_DAYS.find((d) => d > (current || 0)) || MISTAKE_LADDER_DAYS.at(-1);

/** Sezgisel hata türü önerisi (öğretmen önerisi yoksa): tür/süre/hız. */
export const suggestMistakeType = ({ dto, timeMs, selectedBlank }) => {
  if (dto.questionType.key === 'vocabulary') return 'vocabulary';
  const est = (dto.estimatedSeconds || 75) * 1000;
  if (selectedBlank || (timeMs !== null && timeMs < 6000)) return 'attention';
  if (timeMs !== null && timeMs > est * 1.8) return 'time';
  return 'knowledge_gap';
};

/**
 * Yanlış cevaptan hata defteri kaydı: yeni ise 3 gün sonra, tekrar yanlışsa 1 gün sonra.
 * @returns {{ created:boolean, mistake:{ id, code, wrongCount, intervalDays, nextReviewAt, status, mistakeType } }}
 */
export const upsertMistake = async (tx, ctx, { itemId, questionTypeId, attemptId, suggestedType = null, now = ctx.now }) => {
  const nextNew = new Date(now.getTime() + NEW_MISTAKE_INTERVAL_DAYS * DAY);
  const nextAgain = new Date(now.getTime() + DAY);
  const { rows } = await tx.query(
    `INSERT INTO learning.mistake (mistake_tenant_code, mistake_organization_id, mistake_user_account_id, mistake_item_id, mistake_question_type_id, mistake_first_attempt_id, mistake_last_attempt_id,
        mistake_suggested_mistake_type, mistake_interval_days, mistake_next_review_at)
     VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9)
     ON CONFLICT (mistake_user_account_id, mistake_item_id) DO UPDATE SET
        mistake_wrong_count = LEAST(32000, learning.mistake.mistake_wrong_count + 1), mistake_status = 'open', mistake_correct_streak = 0, mistake_resolved_at = NULL,
        mistake_last_attempt_id = EXCLUDED.mistake_last_attempt_id, mistake_suggested_mistake_type = COALESCE(EXCLUDED.mistake_suggested_mistake_type, learning.mistake.mistake_suggested_mistake_type),
        mistake_interval_days = 1, mistake_next_review_at = $10
     RETURNING mistake_id AS id, mistake_code AS code, mistake_wrong_count AS "wrongCount", mistake_interval_days::float8 AS "intervalDays", mistake_next_review_at AS "nextReviewAt",
               mistake_status AS status, mistake_mistake_type AS "mistakeType", (xmax = 0) AS created`,
    [ctx.tenantCode, ctx.orgId, ctx.userId, itemId, questionTypeId, attemptId, suggestedType, NEW_MISTAKE_INTERVAL_DAYS, nextNew, nextAgain]);
  const m = rows[0];
  return { created: m.created, mistake: { id: Number(m.id), code: Number(m.code), wrongCount: m.wrongCount, intervalDays: m.intervalDays, nextReviewAt: new Date(m.nextReviewAt).toISOString(), status: m.status, mistakeType: m.mistakeType } };
};

/**
 * Tekrar sonucu (hata tekrarı oturumu ya da alıştırmada vadesi gelmiş hatayı doğru çözme).
 * Koşullu: yalnız açık kayıt güncellenir. @returns {{ resolved:boolean, intervalDays:number|null, nextReviewAt:string|null }|null}
 */
export const applyMistakeReview = async (tx, ctx, { mistakeId, correct, now = ctx.now }) => {
  const { rows } = await tx.query('SELECT mistake_interval_days::float8 AS interval, mistake_correct_streak AS streak FROM learning.mistake WHERE mistake_id=$1 AND mistake_user_account_id=$2 AND mistake_status=\'open\' FOR UPDATE', [mistakeId, ctx.userId]);
  if (!rows[0]) return null;
  if (!correct) {
    const next = new Date(now.getTime() + DAY);
    await tx.query('UPDATE learning.mistake SET mistake_correct_streak=0, mistake_review_count=mistake_review_count+1, mistake_interval_days=1, mistake_next_review_at=$2, mistake_last_reviewed_at=$3 WHERE mistake_id=$1', [mistakeId, next, now]);
    return { resolved: false, intervalDays: 1, nextReviewAt: next.toISOString() };
  }
  const streak = rows[0].streak + 1;
  if (streak >= RESOLVE_STREAK) {
    await tx.query("UPDATE learning.mistake SET mistake_correct_streak=$2, mistake_review_count=mistake_review_count+1, mistake_status='resolved', mistake_resolved_at=$3, mistake_next_review_at=NULL, mistake_last_reviewed_at=$3 WHERE mistake_id=$1", [mistakeId, streak, now]);
    return { resolved: true, intervalDays: null, nextReviewAt: null };
  }
  const interval = nextInterval(rows[0].interval);
  const next = new Date(now.getTime() + interval * DAY);
  await tx.query('UPDATE learning.mistake SET mistake_correct_streak=$2, mistake_review_count=mistake_review_count+1, mistake_interval_days=$3, mistake_next_review_at=$4, mistake_last_reviewed_at=$5 WHERE mistake_id=$1', [mistakeId, streak, interval, next, now]);
  return { resolved: false, intervalDays: interval, nextReviewAt: next.toISOString() };
};

/** Bu soruya ait vadesi gelmiş açık hata var mı? (alıştırmada doğru çözüm tekrar sayılır) */
export const findDueMistake = async (q, userId, itemId, now) => {
  const { rows } = await q("SELECT mistake_id AS id FROM learning.mistake WHERE mistake_user_account_id=$1 AND mistake_item_id=$2 AND mistake_status='open' AND mistake_next_review_at <= $3", [userId, itemId, now]);
  return rows[0] ? Number(rows[0].id) : null;
};

export const countDueMistakes = async (q, userId, now) => {
  const { rows } = await q("SELECT count(*)::int AS n FROM learning.mistake WHERE mistake_user_account_id=$1 AND mistake_status='open' AND mistake_next_review_at <= $2", [userId, now]);
  return rows[0].n;
};
