export default [
  { name: 'deliveries', schedule: '* * * * *', lockSeconds: 55, run: (c) => c.useCases.notify.processDeliveries() },
  { name: 'data-exports', schedule: '*/2 * * * *', lockSeconds: 110, run: (c) => c.useCases.account.processDataExports() },
  { name: 'purge-accounts', schedule: '10 3 * * *', lockSeconds: 3000, run: (c) => c.useCases.account.purgeAccounts() },
];
