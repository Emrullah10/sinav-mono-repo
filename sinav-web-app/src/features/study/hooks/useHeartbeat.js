import { useEffect } from 'react';
import api from '@api';

// Ekran açıkken ~30 sn'de bir etkin süre gönderir (POST /activity/heartbeat). Hatalar sessizce yutulur.
export default function useHeartbeat(sessionCode, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      api.learningActivityHeartbeat({ seconds: 30, ...(sessionCode ? { sessionCode } : {}) }).catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, [sessionCode, enabled]);
}
