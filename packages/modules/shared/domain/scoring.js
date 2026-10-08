// SAF modül (node bağımlılığı yok): web, mobil ve backend aynı dosyayı kullanır.
// Puanlama blueprint.scoring_method + scoring_params ile veri olarak gelir; sınav adı kodda geçmez.

const round2 = (n) => Math.round(n * 100) / 100;

/** linear: puan = doğru × perCorrect − yanlış × wrongPenalty (YDS: 1.25 / 0). */
export const scoreFromCounts = ({ correct = 0, wrong = 0 }, { method = 'linear', params = {} } = {}) => {
  if (method !== 'linear') throw new Error(`Unsupported scoring method: ${method}`);
  const perCorrect = Number(params.perCorrect ?? 1);
  const wrongPenalty = Number(params.wrongPenalty ?? 0);
  return round2(Math.max(0, correct * perCorrect - wrong * wrongPenalty));
};

/** Hedef puan için gereken doğru sayısı (yanlış cezası yoksa kesin; varsa üst sınır tahmini). */
export const requiredCorrect = (targetScore, { method = 'linear', params = {} } = {}, questionCount = null) => {
  if (method !== 'linear') throw new Error(`Unsupported scoring method: ${method}`);
  const perCorrect = Number(params.perCorrect ?? 1);
  const need = Math.ceil(round2(targetScore / perCorrect) - 1e-9);
  return questionCount ? Math.min(need, questionCount) : need;
};

/** Doğru sayısından puana ve tersine tablo (araçlar sayfası). */
export const scoreTable = (questionCount, scoring) =>
  Array.from({ length: questionCount + 1 }, (_v, correct) => ({
    correct,
    score: scoreFromCounts({ correct, wrong: 0 }, scoring),
  }));

export const maxScore = (questionCount, scoring) => scoreFromCounts({ correct: questionCount }, scoring);

export const formatScoreTr = (n) => String(round2(n)).replace('.', ',');
