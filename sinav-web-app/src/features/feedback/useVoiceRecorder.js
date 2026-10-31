import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_RECORD_MS, blobToBase64, recorderMime } from './media';

/**
 * Mikrofon kaydı (MediaRecorder). Bitince onDone({ data(base64), url, durationMs }).
 * error: 'denied' (izin yok) | 'unsupported' (tarayıcı kaydedemiyor) | null. En çok 2 dakika; süre dolunca kendiliğinden biter.
 */
export default function useVoiceRecorder(onDone) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const ref = useRef(null); // { rec, stream, timer, startedAt, discard }
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  const stop = useCallback((discard = false) => {
    const cur = ref.current;
    if (!cur) return;
    cur.discard = discard;
    clearInterval(cur.timer);
    if (cur.rec.state !== 'inactive') cur.rec.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const mime = recorderMime();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) {
      setError('unsupported');
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setError(e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'denied' : 'unsupported');
      return;
    }
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
    const chunks = [];
    const cur = { rec, stream, startedAt: Date.now(), discard: false };
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((tr) => tr.stop());
      ref.current = null;
      setRecording(false);
      if (cur.discard || !chunks.length) return;
      const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
      const durationMs = Math.min(MAX_RECORD_MS, Date.now() - cur.startedAt);
      done.current?.({ data: await blobToBase64(blob), url: URL.createObjectURL(blob), durationMs });
    };
    cur.timer = setInterval(() => {
      const ms = Date.now() - cur.startedAt;
      setElapsed(ms);
      if (ms >= MAX_RECORD_MS) stop();
    }, 250);
    ref.current = cur;
    setElapsed(0);
    setRecording(true);
    rec.start(1000);
  }, [stop]);

  // Pencere kapanırken süren kayıt atılır, mikrofon bırakılır.
  useEffect(() => () => stop(true), [stop]);

  return { recording, elapsed, error, start, stop: () => stop(false) };
}
