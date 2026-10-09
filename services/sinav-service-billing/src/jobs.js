// Zamanlanmış işler: { name, schedule (cron), lockSeconds, run(container) }  (boot.js cron kilidiyle çalıştırır; hepsi idempotent)
export default [
  { name: 'sweep', schedule: '* * * * *', lockSeconds: 55, run: (c) => c.useCases.lifecycle.sweep() },
  { name: 'renewals', schedule: '*/5 * * * *', lockSeconds: 280, run: (c) => c.useCases.lifecycle.renewals() },
  { name: 'trial-ending', schedule: '0 10 * * *', lockSeconds: 600, run: (c) => c.useCases.lifecycle.trialEnding() },
  { name: 'daily-expire', schedule: '30 3 * * *', lockSeconds: 1800, run: (c) => c.useCases.lifecycle.dailyExpire() },
  { name: 'campaign-reconcile', schedule: '*/30 * * * *', lockSeconds: 120, run: (c) => c.useCases.lifecycle.reconcileCampaigns() },
];
