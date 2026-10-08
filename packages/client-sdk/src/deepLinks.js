// Web yolları ve mobil (expo-router) yolları aynı Türkçe slug'lar (tasarım §10.4). Tek kaynak.
export const deepLinks = {
  today: '/bugun',
  studyType: (type) => `/calis/tip/${type}`,
  note: (id) => `/not/${id}`,
  question: (id) => `/soru/${id}`,
  exam: (id) => `/deneme/${id}`,
  examResult: (id) => `/deneme/${id}/sonuc`,
  vocabReview: '/kelimeler/tekrar',
  tutor: (chat) => `/ogretmen/${chat}`,
  premium: '/premium',
  diagnostic: '/seviye-tespiti',
};
