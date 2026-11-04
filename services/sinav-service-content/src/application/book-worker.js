import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WORKER = fileURLToPath(new URL('./book-extract-worker.js', import.meta.url));
const TIMEOUT_MS = 5 * 60 * 1000;

/** PDF işini alt süreçte çalıştırır; süre ya da bellek aşılırsa süreç ölür, READING_PDF_TIMEOUT döner. */
export const runBookWorker = (message, { timeoutMs = TIMEOUT_MS } = {}) => new Promise((resolve, reject) => {
  const child = fork(WORKER, [], { execArgv: ['--max-old-space-size=900'], serialization: 'advanced', stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let done = false;
  const finish = (fn, v) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    fn(v);
  };
  const timer = setTimeout(() => {
    child.kill('SIGKILL');
    finish(reject, Object.assign(new Error('PDF worker timed out'), { code: 'READING_PDF_TIMEOUT' }));
  }, timeoutMs);
  child.stderr?.on('data', () => {}); // pdf.js uyarıları loga düşmez
  child.once('message', (m) => {
    if (m?.ok) finish(resolve, m.result);
    else finish(reject, Object.assign(new Error(m?.message || 'PDF worker failed'), { code: m?.code || 'READING_PDF_INVALID' }));
  });
  child.once('error', (e) => finish(reject, Object.assign(e, { code: 'READING_PDF_TIMEOUT' })));
  child.once('exit', (code) => finish(reject, Object.assign(new Error(`PDF worker exited (${code})`), { code: 'READING_PDF_TIMEOUT' })));
  child.send(message);
});
