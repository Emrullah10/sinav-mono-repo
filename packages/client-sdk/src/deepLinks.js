// Mobile (expo-router) paths, English since 2026-11-06; web uses the same slugs where the screen exists.
// Legacy Turkish paths are mapped by the mobile app (src/shared/navigation/legacyPaths.js) and web redirects.
export const deepLinks = {
  today: '/today',
  studyType: (type) => `/study/type/${type}`,
  note: (id) => `/note/${id}`,
  question: (id) => `/question/${id}`,
  exam: (id) => `/exams/${id}`,
  examResult: (id) => `/exams/${id}/result`,
  vocabReview: '/vocabulary/review',
  vocabWord: (id) => `/vocabulary/${id}`,
  dayDone: '/today/done',
  goal: '/me/goal',
  background: '/me/background',
  support: '/support',
  help: '/help',
  helpArticle: (slug) => `/help/${slug}`,
  feedback: '/feedback', // mobile: shake / Me; on web a dialog (no route)
  tutor: (chat) => `/tutor/${chat}`,
  premium: '/premium',
  diagnostic: '/diagnostic',
  library: '/study/library',
  book: (code) => `/study/library/${code}`,
  reader: (code) => `/read/${code}`,
  readerPdf: (code) => `/read/${code}/pdf`,
  readerQuiz: (code) => `/read/${code}/quiz`,
};
