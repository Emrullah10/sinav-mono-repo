// Alt süreç (child_process.fork): PDF işlerini ana servisin bellek ve olay döngüsünden ayırır.
//   { op:'extract', file, ocrPages }           → { ok:true, result }
//   { op:'slice', file, pages:[n], outDir }    → { ok:true, result:{ files:{ [n]: yol } } }   (OCR için tek sayfalık PDF'ler)
// Hata: { ok:false, code }. Süre sınırı ve öldürme ana süreçtedir (book-worker.js).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { extractBook } from './book-extract.js';

const slice = async ({ file, pages, outDir }) => {
  const src = await PDFDocument.load(await readFile(file), { ignoreEncryption: true, updateMetadata: false });
  const files = {};
  for (const n of pages) {
    if (n < 1 || n > src.getPageCount()) continue;
    const doc = await PDFDocument.create();
    const [copy] = await doc.copyPages(src, [n - 1]);
    doc.addPage(copy);
    const to = path.join(outDir, `p${n}.pdf`);
    await writeFile(to, await doc.save());
    files[n] = to;
  }
  return { files };
};

process.once('message', async (msg) => {
  try {
    const result = msg.op === 'slice' ? await slice(msg) : await extractBook(new Uint8Array(await readFile(msg.file)), { ocrPages: msg.ocrPages || {} });
    process.send({ ok: true, result }, () => process.exit(0));
  } catch (e) {
    process.send({ ok: false, code: e.code || 'READING_PDF_INVALID', message: String(e.message || e).slice(0, 300) }, () => process.exit(0));
  }
});
