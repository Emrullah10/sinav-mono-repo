// Zamanlanmış işler: { name, schedule (cron), lockSeconds, run(container) }
export default [
  // Süresi dolan deneme sınavlarını otomatik teslim et (sunucu süre otoritesi).
  { name: 'exam-timeouts', schedule: '* * * * *', lockSeconds: 55, run: (c) => c.useCases.exams.autoSubmitExpired() },
];
