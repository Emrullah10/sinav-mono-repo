import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Sesli okuma önbelleği: anahtar (model|ses|cümle özeti) → ses dosyası. Aynı cümle bir daha üretilmez (ücret bir kez).
// Arayüz: dir, read(key) → { audio: Buffer, contentType } | null, write(key, audio, contentType)
const EXT = { 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };
const TYPE = { mp3: 'audio/mpeg', wav: 'audio/wav' };

export const makeBookAudio = ({ dir = process.env.BOOK_AUDIO_DIR || path.resolve(process.cwd(), '.data/book-audio') } = {}) => {
  const fileOf = (key, ext) => path.join(dir, key.slice(0, 2), `${key}.${ext}`);
  const read = async (key) => {
    for (const ext of Object.keys(TYPE)) {
      try {
        return { audio: await readFile(fileOf(key, ext)), contentType: TYPE[ext] };
      } catch { /* yok */ }
    }
    return null;
  };
  const write = async (key, audio, contentType) => {
    const ext = EXT[String(contentType || '').split(';')[0].trim()] || 'mp3';
    const file = fileOf(key, ext);
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, audio);
    await rename(tmp, file);
  };
  return Object.freeze({ dir, read, write });
};
