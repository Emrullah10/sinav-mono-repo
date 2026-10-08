// SAF modül: kullanıcının saat dilimine göre "çalışma günü" hesapları.
export const localDate = (date, timeZone = 'Europe/Istanbul') =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

export const localParts = (date, timeZone = 'Europe/Istanbul') => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(date).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24, minute: Number(parts.minute), second: Number(parts.second) };
};

export const addDays = (isoDate, n) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** ISO hafta günü 1..7 (Pzt=1). */
export const isoWeekday = (isoDate) => {
  const d = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};

export const daysBetween = (fromIso, toIso) =>
  Math.round((new Date(`${toIso}T00:00:00Z`) - new Date(`${fromIso}T00:00:00Z`)) / 86400000);

/** Kullanıcının yerel gece yarısına kalan saniye (önbellek TTL'i için). */
export const secondsUntilLocalMidnight = (date, timeZone = 'Europe/Istanbul') => {
  const p = localParts(date, timeZone);
  return Math.max(60, 86400 - (p.hour * 3600 + p.minute * 60 + p.second));
};

export const monthKey = (date, timeZone = 'Europe/Istanbul') => localDate(date, timeZone).slice(0, 7);
