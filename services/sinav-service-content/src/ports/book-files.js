import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

// Yüklenen PDF'lerin deposu: disk (BOOK_FILES_DIR). Postgres değil: sunucudaki PG başka projelerle paylaşımlı, onlarca MB'lık bytea ona yük olur.
// Arayüz: dir, tmpDir, pathOf(code), put(code, geciciYol), remove(code), size(code), stream(code, { start, end }), codes(), totalBytes(), pruneTmp()
// S3/R2 adaptörü aynı arayüzü uygular.
export const makeBookFiles = ({ dir = process.env.BOOK_FILES_DIR || path.resolve(process.cwd(), '.data/book-files') } = {}) => {
  const tmpDir = path.join(dir, 'tmp');
  const pathOf = (code) => path.join(dir, `${Number(code)}.pdf`);
  const ready = (async () => { await mkdir(tmpDir, { recursive: true }); })();

  const put = async (code, from) => {
    await ready;
    try {
      await rename(from, pathOf(code));
    } catch (e) {
      if (e.code !== 'EXDEV') throw e;
      await copyFile(from, pathOf(code));
      await rm(from, { force: true });
    }
  };
  const remove = async (code) => { await rm(pathOf(code), { force: true }); };
  const size = async (code) => {
    try { return (await stat(pathOf(code))).size; } catch { return null; }
  };
  const codes = async () => {
    await ready;
    return (await readdir(dir)).map((f) => /^(\d+)\.pdf$/.exec(f)?.[1]).filter(Boolean).map(Number);
  };
  const totalBytes = async () => {
    let total = 0;
    for (const c of await codes()) total += (await size(c)) || 0;
    return total;
  };
  const stream = (code, range) => createReadStream(pathOf(code), range);
  /** Süreç yükleme ortasında durursa geçici dosya kalır; günlük temizlikte silinir. */
  const pruneTmp = async (olderThanMs = 24 * 3600 * 1000) => {
    await ready;
    let n = 0;
    for (const f of await readdir(tmpDir)) {
      const p = path.join(tmpDir, f);
      const st = await stat(p).catch(() => null);
      if (st && Date.now() - st.mtimeMs > olderThanMs) { await rm(p, { force: true }); n += 1; }
    }
    return n;
  };
  return Object.freeze({ dir, tmpDir, ready, pathOf, put, remove, size, stream, codes, totalBytes, pruneTmp });
};
