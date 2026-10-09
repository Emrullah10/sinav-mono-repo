import { useCallback, useRef, useState } from 'react';
import api from '@api';

const csrfToken = () => {
  const m = document.cookie.match(/(?:^|; )sinav_xsrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};

// SSE akışı: meta → token* → block* → done | error. Hata SSE başlamadan gelirse fırlatılır (error.code, error.status).
export default function useTutorStream() {
  const [state, setState] = useState({ streaming: false, text: '', blocks: [], messageCode: null, userMessageCode: null, remaining: null });
  const abortRef = useRef(null);
  const messageRef = useRef(null);

  const open = useCallback(async (code, body, onEvent) => {
    const headers = { 'X-Client': 'sinav-web' };
    const token = csrfToken();
    if (token) headers['X-XSRF-TOKEN'] = token;
    return api.tutorMessageSend(code, body, { headers, signal: abortRef.current.signal, onEvent });
  }, []);

  const send = useCallback(async (code, body) => {
    abortRef.current = new AbortController();
    messageRef.current = null;
    setState({ streaming: true, text: '', blocks: [], messageCode: null, userMessageCode: null, remaining: null });
    const onEvent = ({ event, data }) => {
      if (event === 'meta') { messageRef.current = data.messageCode; setState((s) => ({ ...s, messageCode: data.messageCode, userMessageCode: data.userMessageCode, remaining: data.remaining })); }
      else if (event === 'token') setState((s) => ({ ...s, text: s.text + data.text }));
      else if (event === 'block') setState((s) => ({ ...s, blocks: [...s.blocks, data.block] }));
      else if (event === 'done') setState((s) => ({ ...s, text: data.content ?? s.text, remaining: data.remaining ?? s.remaining }));
    };
    try {
      let result;
      try {
        result = await open(code, body, onEvent);
      } catch (e) {
        if (e.status !== 401) throw e;
        await api.gatewayRefresh(); // süresi dolan erişim jetonunu yenile, bir kez yeniden dene
        result = await open(code, body, onEvent);
      }
      return result;
    } finally {
      setState((s) => ({ ...s, streaming: false }));
    }
  }, [open]);

  const stop = useCallback(async () => {
    if (messageRef.current) {
      try { await api.tutorMessageStop(messageRef.current); } catch { /* akış zaten bitmiş olabilir */ }
    }
  }, []);

  const reset = useCallback(() => setState({ streaming: false, text: '', blocks: [], messageCode: null, userMessageCode: null, remaining: null }), []);
  return { ...state, send, stop, reset };
}
