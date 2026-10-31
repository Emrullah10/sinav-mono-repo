// Zamanlanmış işler: { name, schedule (cron), lockSeconds, run(container) }
export default [
  // Yapay zekâ üretim kuyruğu: tutor internal ucunu çağırır (CMS-05).
  { name: 'generation', schedule: '* * * * *', lockSeconds: 300, run: (c) => c.useCases.generation.processQueued() },
  // Her gün 00:15: sınav oturumu durumları tarihten (başvuru açık / yapıldı / sonuç açıklandı).
  // Sınav yeni yapıldıysa o sınavın planı kadar (YDS 80) soru üretimi kuyruğa girer (exam-refresh.js).
  { name: 'session-status', schedule: '15 0 * * *', lockSeconds: 300, run: (c) => c.useCases.calendar.refreshSessionStatuses() },
  // ÖSYM takvimi: yeni yıl takvimi ekim–ocakta çıkar → o aylarda her pazartesi; diğer aylar ayın 1'inde (ertelemeler için).
  // Öneriler onaya düşer, doğrudan uygulanmaz. Oturum durumları ise gece işiyle tarihten hesaplanır (dış istek yok).
  { name: 'calendar-scan', schedule: '0 6 * 1,10-12 1', lockSeconds: 900, run: (c) => c.useCases.calendar.scan() },
  { name: 'calendar-scan-monthly', schedule: '0 6 1 2-9 *', lockSeconds: 900, run: (c) => c.useCases.calendar.scan() },
  // Dokun-çevir ön-çevirisi: yayındaki içeriğin kelime/cümlelerini YALNIZ ücretsiz modelle (LEXICON_PREFILL_MODELS, ':free') önceden çevirir.
  // Env boşsa hiçbir şey yapmaz; günlük ücretsiz sınır dolunca ertesi güne kadar bekler (lexicon-prefill.js).
  { name: 'lexicon-prefill', schedule: '* * * * *', lockSeconds: 300, run: (c) => c.useCases.lexiconPrefill.tick() },
  // Gece: learning.attempt → content.item_stat (CMS-01 / CMS-09).
  { name: 'item-stats', schedule: '30 3 * * *', lockSeconds: 900, run: (c) => c.useCases.misc.refreshItemStats() },
];
