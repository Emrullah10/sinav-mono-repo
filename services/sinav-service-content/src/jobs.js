// Zamanlanmış işler: { name, schedule (cron), lockSeconds, run(container) }
export default [
  // Yapay zekâ üretim kuyruğu: tutor internal ucunu çağırır (CMS-05).
  { name: 'generation', schedule: '* * * * *', lockSeconds: 300, run: (c) => c.useCases.generation.processQueued() },
  // Gece: learning.attempt → content.item_stat (CMS-01 / CMS-09).
  { name: 'item-stats', schedule: '30 3 * * *', lockSeconds: 900, run: (c) => c.useCases.misc.refreshItemStats() },
];
