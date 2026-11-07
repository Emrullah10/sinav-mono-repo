import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { DomainError, fetchInternal, internalHeaders, getEntitlements, splitSentences } from 'app-shared';

// Sesli okuma: kitap cümlesi → yapay zekâ sesi (OpenRouter, tutor servisi üzerinden).
// 1) Okuyucu bölüm başına süreli imzalı bir taban adres alır (erişim + read_aloud hakkı burada denetlenir).
// 2) Oynatıcı her cümleyi `<taban>/<blok>/<cümle>` adresinden ister: başlık taşımayan <audio>/AVPlayer da çalar.
// Metin istemciden gelmez; sunucu bölümden aynı cümle bölücüyle (splitSentences) bulur. Üretilen ses diske yazılır,
// aynı cümle (aynı model + ses) bir daha üretilmez: hazır kitaplarda ücret bir kez ödenir.
// Ücret tavanları (yalnız yeni üretimi durdurur, önbellek her zaman çalar):
//   READ_ALOUD_USER_MONTHLY_USD  kullanıcı başı aylık (varsayılan 1; ≈ 12 saat yeni ses)
//   READ_ALOUD_DAILY_USD         sunucu toplamı günlük (varsayılan 2; 0: yeni üretim kapalı)
// Model tek sağlayıcılı seçilir: ses isteklerinde OpenRouter sağlayıcı seçimini uygulamaz, fiyat ancak böyle sabit kalır.

const tutorUrl = () => `${(process.env.SERVICE_TUTOR_REST_URL || process.env.TUTOR_REST_URL || 'http://127.0.0.1:2005').replace(/\/$/, '')}/api/sinav-service-tutor/v1`;
const TOKEN_TTL_SEC = 6 * 3600;
const TIMEOUT_MS = 90000;
const MAX_INFLIGHT = 8;
const SECTION_TTL_MS = 10 * 60 * 1000;

export const readAloudModel = () => process.env.READ_ALOUD_MODEL || 'fish-audio/drama-3';
// Fish Audio ses kütüphanesi: "Abby: English Woman (US) - Audiobook" (yetişkin kadın, sesli kitap). Boş bırakılırsa modelin varsayılan sesi.
export const readAloudVoice = () => (process.env.READ_ALOUD_VOICE === undefined ? 'f6a19fe5ab494e1fa51bb1476d583a44' : process.env.READ_ALOUD_VOICE);
const capMicros = (name, def) => {
  const v = process.env[name];
  const n = v === undefined || v === '' ? def : Number(v);
  return Math.round((Number.isFinite(n) && n >= 0 ? n : def) * 1e6);
};

const secretKey = () => {
  const k = process.env.BOOK_FILE_SECRET || process.env.INTERNAL_API_KEY;
  if (!k) throw new DomainError('READING_FILE_UNAVAILABLE', 'File access is not configured', undefined, 503);
  return k;
};
const sign = (payload) => createHmac('sha256', secretKey()).update(`book-speech|${payload}`).digest('base64url');
const invalid = () => new DomainError('READING_ALOUD_LINK_INVALID', 'Speech link is invalid or expired', undefined, 404);

export const makeBookSpeech = ({ rawQuery, nowFn, fetchFn, books, audio }) => {
  const sections = new Map();
  const inflight = new Map();

  /** Bölümün sesli okuma taban adresi. Kilitli kitap 402, read_aloud kapalı 402 (READING_ALOUD_LOCKED). */
  const speechUrl = async ({ caller, code, position }) => {
    await books.getSection({ caller, code, position });
    const uid = Number(caller.callerUserId);
    const ent = await getEntitlements(uid).catch(() => null);
    if (!ent?.features?.read_aloud?.enabled) throw new DomainError('READING_ALOUD_LOCKED', 'Read aloud requires a paid plan', undefined, 402);
    const exp = Math.floor(nowFn().getTime() / 1000) + TOKEN_TTL_SEC;
    const payload = `${Number(code)}.${Number(position)}.${uid}.${exp}`;
    return { url: `/api/sinav-service-content/v1/public/book-speech/${payload}.${sign(payload)}`, expiresAt: new Date(exp * 1000).toISOString() };
  };

  const verify = (token) => {
    const parts = String(token || '').split('.');
    if (parts.length !== 5) throw invalid();
    const [code, position, uid, exp, sig] = parts;
    const expected = Buffer.from(sign(`${code}.${position}.${uid}.${exp}`));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw invalid();
    if (Number(exp) < Math.floor(nowFn().getTime() / 1000)) throw invalid();
    return { code: Number(code), position: Number(position), uid: Number(uid) };
  };

  // Bölüm blokları kısa süre bellekte tutulur: cümle başına veritabanına gidilmez.
  const blocksOf = async (code, position) => {
    const k = `${code}:${position}`;
    const hit = sections.get(k);
    if (hit && hit.at > Date.now() - SECTION_TTL_MS) return hit.blocks;
    const { rows } = await rawQuery(
      `SELECT s.book_section_blocks AS blocks FROM content.book_section s JOIN content.book b ON b.book_id = s.book_section_book_id
        WHERE b.book_code = $1 AND s.book_section_position = $2`, [code, position]);
    if (!rows[0]) throw invalid();
    const blocks = Array.isArray(rows[0].blocks) ? rows[0].blocks : [];
    if (sections.size > 200) sections.clear();
    sections.set(k, { at: Date.now(), blocks });
    return blocks;
  };

  const spentMicros = async (uid) => {
    const { rows } = await rawQuery(
      `SELECT coalesce(sum(ai_usage_cost_micros) FILTER (WHERE ai_usage_created_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul'), 0)::bigint AS day,
              coalesce(sum(ai_usage_cost_micros) FILTER (WHERE ai_usage_user_account_id = $1), 0)::bigint AS month
         FROM tutor.ai_usage
        WHERE ai_usage_feature = 'read_aloud' AND ai_usage_created_at >= date_trunc('month', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul'`, [uid]);
    return { day: Number(rows[0].day) || 0, month: Number(rows[0].month) || 0 };
  };

  const generate = async (key, text, uid) => {
    const daily = capMicros('READ_ALOUD_DAILY_USD', 2);
    const monthly = capMicros('READ_ALOUD_USER_MONTHLY_USD', 1);
    const spent = await spentMicros(uid);
    if (!daily || spent.day >= daily || spent.month >= monthly) {
      throw new DomainError('READING_ALOUD_QUOTA', 'Read aloud limit reached', { scope: spent.month >= monthly ? 'user' : 'daily' }, 429);
    }
    let res;
    try {
      res = await fetchInternal(`${tutorUrl()}/internal/ai/speech`, {
        method: 'POST', headers: internalHeaders({ callerUserId: uid }), timeoutMs: TIMEOUT_MS, fetchFn, body: { text, model: readAloudModel(), voice: readAloudVoice() || null },
      });
    } catch {
      throw new DomainError('READING_ALOUD_UNAVAILABLE', 'Speech service is unreachable', undefined, 503);
    }
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok || body?.success === false) {
      console.warn(`[book-speech] ${res.status} ${body?.error?.code || ''}`);
      throw new DomainError('READING_ALOUD_UNAVAILABLE', 'Speech could not be generated', { status: res.status }, res.status === 429 ? 429 : 503);
    }
    const data = body?.data ?? body;
    const buf = Buffer.from(String(data?.audioBase64 || ''), 'base64');
    if (!buf.length) throw new DomainError('READING_ALOUD_UNAVAILABLE', 'Speech could not be generated', undefined, 503);
    const contentType = String(data?.contentType || 'audio/mpeg');
    await audio.write(key, buf, contentType).catch((e) => console.warn('[book-speech] önbelleğe yazılamadı', e.message));
    return { audio: buf, contentType };
  };

  /** Tek cümlenin sesi (Range destekli; iOS AVPlayer önce küçük bir aralık ister). */
  const streamSpeech = async ({ token, block, sentence, req, res }) => {
    const t = verify(token);
    const blocks = await blocksOf(t.code, t.position);
    const b = blocks[Number(block)];
    const s = b ? splitSentences(String(b.x || ''))[Number(sentence)] : null;
    const text = s?.text?.trim();
    if (!text || !/[\p{L}\p{N}]/u.test(text)) throw new DomainError('READING_ALOUD_NOT_FOUND', 'Sentence not found', undefined, 404);
    const key = createHash('sha256').update(`${readAloudModel()}|${readAloudVoice()}|${text}`).digest('hex');
    let out = await audio.read(key);
    if (!out) {
      if (!inflight.has(key)) {
        if (inflight.size >= MAX_INFLIGHT) throw new DomainError('READING_ALOUD_BUSY', 'Speech service is busy', undefined, 503);
        inflight.set(key, generate(key, text, t.uid).finally(() => inflight.delete(key)));
      }
      out = await inflight.get(key);
    }
    const size = out.audio.length;
    const base = { 'Content-Type': out.contentType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
    if (m && (m[1] || m[2])) {
      let start = 0;
      let end = size - 1;
      if (m[1]) { start = Number(m[1]); if (m[2]) end = Math.min(Number(m[2]), size - 1); } else { start = Math.max(0, size - Number(m[2])); }
      if (start > end || start >= size) {
        res.status(416).set({ ...base, 'Content-Range': `bytes */${size}` }).end();
        return;
      }
      res.status(206).set({ ...base, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` }).end(out.audio.subarray(start, end + 1));
      return;
    }
    res.status(200).set({ ...base, 'Content-Length': String(size) }).end(out.audio);
  };

  return Object.freeze({ speechUrl, streamSpeech });
};
