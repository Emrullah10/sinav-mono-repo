import { useEffect, useState } from 'react';

export default function useNow(active = true, step = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), step);
    return () => clearInterval(id);
  }, [active, step]);
  return now;
}
