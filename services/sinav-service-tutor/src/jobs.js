// Zamanlanmış işler: { name, schedule (cron), lockSeconds, run(container) }
export default [
  // Süreç çökmesinden kalan yarım akışları kapatır (Redis 23/24 anahtarları zaten TTL'li).
  { name: 'sweep-stale-streams', schedule: '*/5 * * * *', lockSeconds: 50, run: (c) => c.useCases.chat.sweepStale() },
];
