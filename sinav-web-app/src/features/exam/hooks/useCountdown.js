import { useEffect, useState } from 'react';

// Sunucu saati otoritedir: son yanıttaki kalan saniye (clock.seconds, clock.at) üzerinden geri sayılır; sayaç yalnız görsel.
export default function useCountdown(clock, running) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  if (!clock) return null;
  if (!running) return clock.seconds;
  return Math.max(0, Math.round(clock.seconds - (now - clock.at) / 1000));
}

export const formatClock = (sec) => {
  const s = Math.max(0, sec ?? 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s % 60)}` : `${p(m)}:${p(s % 60)}`;
};
