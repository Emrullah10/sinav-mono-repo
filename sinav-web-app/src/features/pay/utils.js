// Para: "1.490 TL" / "314,10 TL" (KDV dahil). Tarih ve sayı biçimleri tr-TR.
export const money = (amount, currency = 'TRY') => {
  const n = Number(amount ?? 0);
  const digits = Number.isInteger(n) ? 0 : 2;
  return `${n.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: 2 })} ${currency === 'TRY' ? 'TL' : currency}`;
};

export const FEATURES = ['questions_per_day', 'tutor_messages_per_day', 'flashcard_reviews_per_day', 'translation_evals_per_day', 'mini_exams_per_month', 'full_exams_per_month', 'detailed_analysis', 'score_estimate'];
export const BOOLEAN_FEATURES = ['detailed_analysis', 'score_estimate'];

// Özellik değeri: { kind: 'yes'|'no'|'unlimited'|'limit', limit, period }
export const featureValue = (f) => {
  if (!f || !f.enabled) return { kind: 'no' };
  if (BOOLEAN_FEATURES.includes(f.feature)) return { kind: 'yes' };
  if (f.limit == null) return { kind: 'unlimited' };
  return { kind: 'limit', limit: f.limit, period: f.period };
};

export const newKey = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
