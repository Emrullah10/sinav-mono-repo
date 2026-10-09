// tutor servisi uçları (docs/api/tutor.md). `http` axios benzeri örnek. Dönüş: axios yanıtı; gövde { success, data }.
// Yalnız mesaj gönderme SSE'dir: axios ile okunamaz, `tutorMessageSend` fetch kullanır.

/** SSE metnini olay nesnelerine ayırır: { event, data } (data JSON'dur). */
export const parseSseChunk = (buffer) => {
  const events = [];
  let rest = buffer;
  let idx;
  while ((idx = rest.indexOf('\n\n')) >= 0) {
    const raw = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    let event = 'message';
    const data = [];
    for (const line of raw.split('\n')) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (data.length) { try { events.push({ event, data: JSON.parse(data.join('\n')) }); } catch { /* bozuk parça */ } }
  }
  return { events, rest };
};

export const createTutorApi = (http, { api = '/api' } = {}) => {
  const B = `${api}/sinav-service-tutor/v1`;
  return {
    tutorOverviewGet: (params) => http.get(`${B}/overview`, { params }),
    tutorUsageGet: () => http.get(`${B}/usage`),
    // Sohbetler
    tutorConversationCreate: (body) => http.post(`${B}/conversations`, body || {}),
    tutorConversationGet: (code) => http.get(`${B}/conversations/${code}`),
    tutorConversationUpdate: (code, body) => http.patch(`${B}/conversations/${code}`, body),
    tutorConversationDelete: (code) => http.delete(`${B}/conversations/${code}`),
    tutorConversationsDeleteAll: () => http.delete(`${B}/conversations`),
    /**
     * SSE akışı. Hata (kota, 404 …) SSE başlamadan JSON zarfı döner → fırlatılır (error.status, error.body).
     * opts: { headers (çerez oturumunda CSRF başlığı dahil), credentials, signal, onEvent({event,data}), baseUrl, fetchFn }
     * Dönüş: son `done`/`error` olayının data'sı ({ event, ...data }).
     */
    tutorMessageSend: async (code, body, opts = {}) => {
      const { headers = {}, credentials = 'include', signal, onEvent, baseUrl = '', fetchFn = globalThis.fetch } = opts;
      const res = await fetchFn(`${baseUrl}${B}/conversations/${code}/messages`, {
        method: 'POST', credentials, signal, body: JSON.stringify(body),
        headers: { 'content-type': 'application/json', accept: 'text/event-stream', ...headers },
      });
      if (!String(res.headers.get('content-type') || '').includes('text/event-stream')) {
        let parsed = null; try { parsed = await res.json(); } catch { /* gövde yok */ }
        throw Object.assign(new Error(parsed?.error?.code || `HTTP ${res.status}`), { status: res.status, body: parsed, code: parsed?.error?.code });
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = ''; let last = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const { events, rest } = parseSseChunk(buf);
        buf = rest;
        for (const ev of events) { onEvent?.(ev); if (ev.event === 'done' || ev.event === 'error') last = { event: ev.event, ...ev.data }; }
      }
      return last;
    },
    tutorMessageStop: (code) => http.post(`${B}/messages/${code}/stop`, {}),
    tutorMessageFeedback: (code, isHelpful) => http.post(`${B}/messages/${code}/feedback`, { isHelpful }),
    tutorMessageReport: (code, body) => http.post(`${B}/messages/${code}/reports`, body),
    // Çeviri koçu
    tutorTranslationPromptNext: (params) => http.get(`${B}/translation/prompts/next`, { params }),
    tutorTranslationEvaluate: (body) => http.post(`${B}/translation/evaluations`, body),
    tutorTranslationEvaluationGet: (code) => http.get(`${B}/translation/evaluations/${code}`),
    // CMS (content:report:manage)
    tutorCmsReportsList: (params) => http.get(`${B}/cms/message-reports`, { params }),
    tutorCmsReportResolve: (code, body) => http.post(`${B}/cms/message-reports/${code}/resolve`, body),
  };
};
export default createTutorApi;
