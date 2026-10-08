import cron from 'node-cron';
import '../../../core/service-billing/src/infrastructure/persistence/init-query-builder.js';
import datasources from 'app-datasource';
import { makeWithCronLock } from 'app-shared';
import container from './container.js';
import jobs from './jobs.js';

const withCronLock = makeWithCronLock(datasources);

export default async () => {
  // 1) PORTLAR burada kurulur (cron kapalı olsa da)
  if (typeof container.setup === 'function') await container.setup();

  // 2) ZAMANLANMIŞ İŞLER: testte ve DISABLE_CRON=true iken kapalı.
  const cronDisabled = process.env.NODE_ENV === 'test' || process.env.DISABLE_CRON === 'true';
  if (cronDisabled) return;
  for (const job of jobs) {
    cron.schedule(
      job.schedule,
      () =>
        withCronLock(`cron:billing:${job.name}`, job.lockSeconds || 50, async () => {
          try {
            const result = await job.run(container);
            if (result?.changed) console.log(`[billing-${job.name}] degisen=${result.changed}`);
          } catch (error) {
            console.error(`[service-billing] ${job.name} failed`, error);
          }
        }),
      { timezone: 'Europe/Istanbul' },
    );
  }
};
