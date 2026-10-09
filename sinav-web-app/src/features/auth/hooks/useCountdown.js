import { useCallback, useEffect, useState } from 'react';

// Saniye geri sayımı: start(n) ile başlar; 0'da durur.
export default function useCountdown(initial = 0) {
  const [left, setLeft] = useState(initial);
  useEffect(() => {
    if (left <= 0) return undefined;
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  const start = useCallback((n) => setLeft(Math.max(0, Math.round(n || 0))), []);
  return [left, start];
}
