// learning servisi uçları (docs/api/learning.md). `http` axios benzeri örnek. Gövde: { success, data }.
export const createLearningApi = (http, { api = '/api' } = {}) => {
  const B = `${api}/sinav-service-learning/v1`;
  return {
    // ── Hedef sınav, müsaitlik, ayarlar ──
    learningEnrollmentCreate: (body) => http.post(`${B}/enrollments`, body),
    learningEnrollmentActiveGet: () => http.get(`${B}/enrollments/active`),
    learningEnrollmentUpdate: (code, body) => http.patch(`${B}/enrollments/${code}`, body),
    learningAvailabilityGet: () => http.get(`${B}/availability`),
    learningAvailabilitySave: (days) => http.put(`${B}/availability`, { days }),
    learningSettingsGet: () => http.get(`${B}/learner-settings`),
    learningSettingsUpdate: (body) => http.patch(`${B}/learner-settings`, body),
    // ── Seviye tespiti ──
    learningDiagnosticStart: () => http.post(`${B}/diagnostics`, {}),
    learningDiagnosticSkip: () => http.post(`${B}/diagnostics/skip`, {}),
    learningDiagnosticGet: (code, params) => http.get(`${B}/diagnostics/${code}`, { params }),
    /** body: { position, selectedLabel|null, timeMs, clientRef (uuid) } */
    learningDiagnosticAnswer: (code, body) => http.post(`${B}/diagnostics/${code}/answers`, body),
    learningDiagnosticPause: (code) => http.post(`${B}/diagnostics/${code}/pause`, {}),
    learningDiagnosticComplete: (code) => http.post(`${B}/diagnostics/${code}/complete`, {}),
    learningDiagnosticResultGet: (code) => http.get(`${B}/diagnostics/${code}/result`),
    learningPlanPreviewGet: (days = 7) => http.get(`${B}/plan/preview`, { params: { days } }),
    // ── Ana sayfa ve plan ──
    learningTodayGet: () => http.get(`${B}/today`),
    learningDaySummaryGet: (date) => http.get(`${B}/day-summary`, { params: date ? { date } : undefined }),
    learningPlanTaskStart: (code) => http.post(`${B}/plan-tasks/${code}/start`, {}),
    learningPlanTaskPostpone: (code) => http.post(`${B}/plan-tasks/${code}/postpone`, {}),
    learningPlanTaskSkip: (code) => http.post(`${B}/plan-tasks/${code}/skip`, {}),
    /** body: tam olarak biri → { shortDay: { minutes } } | { skipDay: true } | { reset: true } | { focus: { questionTypeKey } } */
    learningPlanAdjust: (body) => http.post(`${B}/plan/adjust`, body),
    learningActivityHeartbeat: (body) => http.post(`${B}/activity/heartbeat`, body),
    learningProgressOverviewGet: (range) => http.get(`${B}/progress/overview`, { params: range ? { range } : undefined }),
    learningUsageTodayGet: () => http.get(`${B}/usage/today`),
    // ── Çalış merkezi ──
    learningStudyOverviewGet: () => http.get(`${B}/study/overview`),
    learningStudyQuestionTypeGet: (key) => http.get(`${B}/study/question-types/${key}`),
    learningStudySkillGet: (key) => http.get(`${B}/study/skills/${key}`),
    learningPracticeOptionsGet: () => http.get(`${B}/practice/options`),
    learningPracticeSessionCreate: (body) => http.post(`${B}/practice-sessions`, body),
    // ── Oturum (alıştırma, not kontrolü, hata tekrarı) ──
    learningSessionsCurrentList: () => http.get(`${B}/sessions/current`),
    learningSessionGet: (code) => http.get(`${B}/sessions/${code}`),
    learningSessionItemGet: (code, n) => http.get(`${B}/sessions/${code}/items/${n}`),
    /** body: { selectedLabel|null, timeMs, clientRef (uuid) } */
    learningSessionAnswer: (code, n, body) => http.post(`${B}/sessions/${code}/items/${n}/answer`, body),
    learningSessionItemFlag: (code, n, flagged = true) => http.post(`${B}/sessions/${code}/items/${n}/flag`, { flagged }),
    learningSessionItemEliminate: (code, n, labels) => http.post(`${B}/sessions/${code}/items/${n}/eliminate`, { labels }),
    learningSessionHintReveal: (code, n) => http.post(`${B}/sessions/${code}/items/${n}/hints`, {}),
    learningSessionSolutionReveal: (code, n) => http.post(`${B}/sessions/${code}/items/${n}/solution`, {}),
    learningSessionMistakeTypeSet: (code, n, mistakeType) => http.post(`${B}/sessions/${code}/items/${n}/mistake-type`, { mistakeType }),
    learningSessionPause: (code) => http.post(`${B}/sessions/${code}/pause`, {}),
    learningSessionResume: (code) => http.post(`${B}/sessions/${code}/resume`, {}),
    learningSessionComplete: (code) => http.post(`${B}/sessions/${code}/complete`, {}),
    learningSessionResultGet: (code) => http.get(`${B}/sessions/${code}/result`),
    // ── Hap not ve yer imleri ──
    learningNoteRead: (itemCode, understood = false) => http.post(`${B}/notes/${itemCode}/read`, { understood }),
    learningNoteCheckStart: (itemCode) => http.post(`${B}/notes/${itemCode}/checks`, {}),
    learningBookmarkCreate: (body) => http.post(`${B}/bookmarks`, body),
    learningBookmarksList: (params) => http.get(`${B}/bookmarks`, { params }),
    learningBookmarkRemove: (code) => http.delete(`${B}/bookmarks/${code}`),
    // ── Kelime (FSRS) ──
    learningVocabOverviewGet: () => http.get(`${B}/vocab/overview`),
    learningVocabDeckSubscribe: (key, body) => http.put(`${B}/vocab/decks/${key}/subscription`, body || {}),
    learningVocabReviewStart: (body) => http.post(`${B}/vocab/review-sessions`, body || {}),
    learningVocabReviewNext: (code) => http.get(`${B}/vocab/review-sessions/${code}/next`),
    /** body: { rating: 'again'|'hard'|'good'|'easy', durationMs, sessionCode, clientRef } */
    learningVocabCardReview: (cardCode, body) => http.post(`${B}/vocab/cards/${cardCode}/reviews`, body),
    learningVocabReviewUndo: (code) => http.post(`${B}/vocab/review-sessions/${code}/undo`, {}),
    learningVocabReviewComplete: (code) => http.post(`${B}/vocab/review-sessions/${code}/complete`, {}),
    learningVocabCardByItemGet: (itemCode) => http.get(`${B}/vocab/cards/by-item/${itemCode}`),
    learningVocabCardAdd: (itemCode) => http.post(`${B}/vocab/cards`, { itemCode }),
    // ── Hata defteri ──
    learningMistakesList: (params) => http.get(`${B}/mistakes`, { params }),
    learningMistakeUpdate: (code, body) => http.patch(`${B}/mistakes/${code}`, body),
    learningMistakeReviewStart: (body) => http.post(`${B}/mistake-reviews`, body || {}),
    // ── Deneme sınavı ──
    learningExamsOverviewGet: () => http.get(`${B}/exams/overview`),
    learningExamFormGet: (code) => http.get(`${B}/exam-forms/${code}`),
    learningExamStart: (formCode, mode) => http.post(`${B}/exam-sittings`, { formCode, ...(mode ? { mode } : {}) }),
    learningExamSittingGet: (code) => http.get(`${B}/exam-sittings/${code}`),
    learningExamQuestionsGet: (code, params) => http.get(`${B}/exam-sittings/${code}/questions`, { params }),
    /** body: { selectedLabel|null, timeMs, flagged?, eliminatedLabels? } */
    learningExamAnswerPut: (code, n, body) => http.put(`${B}/exam-sittings/${code}/answers/${n}`, body),
    learningExamPause: (code) => http.post(`${B}/exam-sittings/${code}/pause`, {}),
    learningExamResume: (code) => http.post(`${B}/exam-sittings/${code}/resume`, {}),
    learningExamSubmit: (code) => http.post(`${B}/exam-sittings/${code}/submit`, {}),
    learningExamResultGet: (code) => http.get(`${B}/exam-sittings/${code}/result`),
    learningExamAnalysisGet: (code) => http.get(`${B}/exam-sittings/${code}/analysis`),
    learningExamReviewList: (code, filter) => http.get(`${B}/exam-sittings/${code}/review`, { params: filter ? { filter } : undefined }),
    learningExamReviewItemGet: (code, n) => http.get(`${B}/exam-sittings/${code}/review/${n}`),
  };
};
