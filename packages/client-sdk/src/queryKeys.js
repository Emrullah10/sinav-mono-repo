// React Query anahtarları: kararlı diziler ['<alan>', '<eylem>', params].
export const queryKeys = {
  auth: { me: () => ['auth', 'me'] },
  account: { get: () => ['account', 'get'], prefs: () => ['account', 'prefs'], notif: () => ['account', 'notificationPrefs'], consents: () => ['account', 'consents'] },
  billing: {
    products: () => ['billing', 'products'], campaign: (key) => ['billing', 'campaign', key], entitlements: () => ['billing', 'entitlements'],
    profile: () => ['billing', 'profile'], subscription: () => ['billing', 'subscription'], cancelOffers: (reason) => ['billing', 'cancelOffers', reason],
    payment: (code) => ['billing', 'payment', code], paymentMethods: () => ['billing', 'paymentMethods'], invoices: () => ['billing', 'invoices'],
    installments: (priceKey, bin) => ['billing', 'installments', priceKey, bin],
  },
  content: {
    exams: () => ['content', 'exams'], track: (key) => ['content', 'track', key], featured: (placement) => ['content', 'featured', placement],
    articles: (params) => ['content', 'articles', params], article: (type, slug) => ['content', 'article', type, slug], articleCategories: (params) => ['content', 'articleCategories', params],
    vocabLookup: (word) => ['content', 'vocabLookup', word], vocab: (itemCode) => ['content', 'vocab', itemCode], note: (itemCode) => ['content', 'note', itemCode],
    cms: {
      items: (params) => ['content', 'cms', 'items', params], item: (code) => ['content', 'cms', 'item', code], taxonomy: () => ['content', 'cms', 'taxonomy'],
      reviewQueue: (params) => ['content', 'cms', 'reviewQueue', params], revision: (code) => ['content', 'cms', 'revision', code], comments: (code) => ['content', 'cms', 'comments', code],
      reports: (params) => ['content', 'cms', 'reports', params], report: (code) => ['content', 'cms', 'report', code],
      jobs: (params) => ['content', 'cms', 'jobs', params], job: (code) => ['content', 'cms', 'job', code],
    },
  },
  learning: {
    enrollment: () => ['learning', 'enrollment'], availability: () => ['learning', 'availability'], settings: () => ['learning', 'settings'],
    diagnostic: (code) => ['learning', 'diagnostic', code], diagnosticResult: (code) => ['learning', 'diagnosticResult', code], planPreview: (days) => ['learning', 'planPreview', days],
    today: () => ['learning', 'today'], daySummary: (date) => ['learning', 'daySummary', date], progress: (range) => ['learning', 'progress', range], usage: () => ['learning', 'usage'],
    studyOverview: () => ['learning', 'studyOverview'], questionType: (key) => ['learning', 'questionType', key], skill: (key) => ['learning', 'skill', key], practiceOptions: () => ['learning', 'practiceOptions'],
    session: (code) => ['learning', 'session', code], sessionItem: (code, n) => ['learning', 'sessionItem', code, n], sessionResult: (code) => ['learning', 'sessionResult', code], sessionsCurrent: () => ['learning', 'sessionsCurrent'],
    bookmarks: (params) => ['learning', 'bookmarks', params],
    vocabOverview: () => ['learning', 'vocabOverview'], vocabNext: (code) => ['learning', 'vocabNext', code], vocabCardByItem: (itemCode) => ['learning', 'vocabCardByItem', itemCode],
    mistakes: (params) => ['learning', 'mistakes', params],
    exams: () => ['learning', 'exams'], examForm: (code) => ['learning', 'examForm', code], examSitting: (code) => ['learning', 'examSitting', code], examQuestions: (code, from, to) => ['learning', 'examQuestions', code, from, to],
    examResult: (code) => ['learning', 'examResult', code], examAnalysis: (code) => ['learning', 'examAnalysis', code], examReview: (code, filter) => ['learning', 'examReview', code, filter], examReviewItem: (code, n) => ['learning', 'examReviewItem', code, n],
  },
  tutor: {
    overview: () => ['tutor', 'overview'], usage: () => ['tutor', 'usage'], conversation: (code) => ['tutor', 'conversation', code],
    translationPrompt: (params) => ['tutor', 'translationPrompt', params], evaluation: (code) => ['tutor', 'evaluation', code],
    cmsReports: (params) => ['tutor', 'cmsReports', params],
  },
};
