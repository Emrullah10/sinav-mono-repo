import cron from 'node-cron';
import '../../../core/service-learning/src/infrastructure/persistence/init-query-builder.js';
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
        withCronLock(`cron:learning:${job.name}`, job.lockSeconds || 50, async () => {
          try {
            const result = await job.run(container);
            if (result?.changed) console.log(`[learning-${job.name}] degisen=${result.changed}`);
          } catch (error) {
            console.error(`[service-learning] ${job.name} failed`, error);
          }
        }),
      { timezone: 'Europe/Istanbul' },
    );
  }
};
