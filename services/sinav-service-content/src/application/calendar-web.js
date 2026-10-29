// ÖSYM takvim PDF'i otomatik indirilemediğinde ikincil kaynak: takvimi yeniden yayımlayan haber/eğitim siteleri.
// Model (web aramalı) oturumları ve kaynak bağlantılarını döner; modele güvenilmez — her tarih, kaynak sayfa
// kodla açılıp sınav adının yakınında gerçekten yazıyor mu diye denetlenir. En az MIN_DOMAINS farklı alan adında
// görülen alan kabul edilir; sınav tarihi doğrulanmayan oturum hiç önerilmez.

export const MIN_DOMAINS = 2;
const WINDOW_BEFORE = 250;
const WINDOW_AFTER = 600;
const MONTHS = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
const DATE_FIELDS = ['date', 'applicationStart', 'applicationEnd', 'lateApplicationEnd', 'resultDate'];

const ENTITIES = { amp: '&', nbsp: ' ', quot: '"', apos: "'", lt: '<', gt: '>' };
/** HTML → düz metin (script/style atılır, etiketler boşluk olur). Küçük harf, Türkçe yerel ayarıyla. */
export const htmlToText = (html) => String(html || '')
  .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m))
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('tr');

export const domainOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; } };

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** YYYY-MM-DD → metinde arama desenleri: "28 mart 2027", "28.03.2027", "28/03/2027"; yıl yazılmamış "28 mart" da (pencere içinde). */
export const datePatterns = (isoDate) => {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  if (!y || !m || !d) return [];
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return [
    new RegExp(`(^|[^0-9])0?${d}\\s+${esc(MONTHS[m - 1])}(\\s+${y})?(?![0-9a-zçğıöşü])`),
    new RegExp(`(^|[^0-9])(${dd}|${d})[./-](${mm}|${m})[./-]${y}(?![0-9])`),
  ];
};

/** Oturum anahtarı → metinde sınav adı desenleri (küçük harf metin üzerinde). */
export const labelPatterns = (key) => {
  let m = /^(\d{4})-YDS\/(\d+)$/.exec(key);
  if (m) return [new RegExp(`(?<!e-|e )yds\\s*/\\s*${m[2]}(?![0-9])`), new RegExp(`(?<!e-|e )yds\\s*${m[1]}\\s*/\\s*${m[2]}(?![0-9])`)];
  m = /^(\d{4})-eYDS\/(\d+)$/.exec(key);
  if (m) return [new RegExp(`e-?\\s?yds\\s*(${m[1]}\\s*/\\s*)?${m[2]}(?![0-9])`), new RegExp(`e-?\\s?yds\\s*/\\s*${m[2]}(?![0-9])`)];
  m = /^(\d{4})-YOKDIL\/(\d+)$/.exec(key);
  if (m) return [new RegExp(`(?<!e-|e )y[öo]kd[iİı]l\\s*/\\s*${m[2]}(?![0-9])`), new RegExp(`(?<!e-|e )y[öo]kd[iİı]l\\s*${m[1]}\\s*/\\s*${m[2]}(?![0-9])`)];
  m = /^(\d{4})-eYOKDIL\/(\d+)$/.exec(key);
  if (m) return [new RegExp(`e-?\\s?y[öo]kd[iİı]l\\s*(${m[1]}\\s*/\\s*)?${m[2]}(?![0-9])`)];
  return [];
};

/** Metindeki her sınav adı geçişinin çevresi (önce/sonra pencere). */
const windowsFor = (text, key) => {
  const out = [];
  for (const re of labelPatterns(key)) {
    const g = new RegExp(re.source, 'g');
    for (const hit of text.matchAll(g)) out.push(text.slice(Math.max(0, hit.index - WINDOW_BEFORE), hit.index + hit[0].length + WINDOW_AFTER));
  }
  return out;
};

/**
 * Model önerilerini sayfa metinleriyle doğrular.
 * @param sessions  [{ key, ...dateFields }] (matchCode ile kimliklendirilmiş)
 * @param pages     [{ url, domain, text }] (htmlToText sonrası)
 * @returns { sessions: [{...kimlik, alanlar (doğrulanmayan alan undefined), confirmations }], rejected: [{ key, reason }] }
 */
export const confirmSessions = (sessions, pages, { minDomains = MIN_DOMAINS } = {}) => {
  const accepted = [];
  const rejected = [];
  for (const s of sessions) {
    const wins = pages.map((p) => ({ domain: p.domain, url: p.url, windows: windowsFor(p.text, s.key) })).filter((p) => p.windows.length);
    const confirmations = {};
    const out = { ...s };
    for (const f of DATE_FIELDS) {
      if (!s[f]) { out[f] = undefined; continue; }
      const pats = datePatterns(s[f]);
      const domains = [...new Set(wins.filter((p) => p.windows.some((w) => pats.some((re) => re.test(w)))).map((p) => p.domain))];
      confirmations[f] = domains;
      out[f] = domains.length >= minDomains ? s[f] : undefined;
    }
    if (!out.date) { rejected.push({ key: s.key, reason: `sınav tarihi ${minDomains} kaynakta doğrulanamadı`, seenIn: confirmations.date || [] }); continue; }
    accepted.push({ ...out, confirmations });
  }
  return { sessions: accepted, rejected };
};
