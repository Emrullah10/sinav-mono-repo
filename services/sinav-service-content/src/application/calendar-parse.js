// ÖSYM yıllık sınav takvimi PDF'i → yabancı dil oturumları (YDS, e-YDS, YÖKDİL, e-YÖKDİL).
// PDF'te her sınav üç satırlık bir bloktur:
//   1) tam ad ............................ başvuru başlangıcı
//   2)          sınav tarihi   geç başvuru (ya da -----)   sonuç tarihi
//   3) kısa kod (2025-YDS/1) ............. başvuru bitişi
// Satırlar metin parçalarının y koordinatına göre kurulur; sütun konumlarına güvenilmez, tarihler sırayla okunur.
import { getDocumentProxy } from 'unpdf';

const DATE = /(\d{2})\.(\d{2})\.(\d{4})/g;
const iso = ([, d, m, y]) => `${y}-${m}-${d}`;
const datesIn = (s) => [...String(s).matchAll(DATE)].map(iso);

/** PDF → satır metinleri (yukarıdan aşağı, soldan sağa). */
export const pdfToRows = async (buffer) => {
  const pdf = await getDocumentProxy(new Uint8Array(buffer), { verbosity: 0 });
  const rows = [];
  for (let p = 1; p <= pdf.numPages; p += 1) {
    const page = await pdf.getPage(p);
    const { items } = await page.getTextContent();
    const byY = new Map();
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      // Aynı satırın parçaları 1-2 birim kayabilir; yakın y'leri birleştir.
      const key = [...byY.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      if (!byY.has(key)) byY.set(key, []);
      byY.get(key).push({ x: it.transform[4], s: it.str });
    }
    for (const y of [...byY.keys()].sort((a, b) => b - a)) {
      rows.push(byY.get(y).sort((a, b) => a.x - b.x).map((i) => i.s.trim()).join('  '));
    }
  }
  return rows;
};

/** Kod satırı → oturum kimliği. İngilizce içermeyen e-YDS dilleri atlanır (yalnız İngilizce izimiz var). */
export const matchCode = (line) => {
  let m = /\b(\d{4})-YDS\/(\d+)/.exec(line);
  if (m) return { key: `${m[1]}-YDS/${m[2]}`, exam: 'yds', deliveryMode: 'paper', name: `${m[1]} YDS/${m[2]}`, year: Number(m[1]) };
  m = /\be-YDS\s+(\d{4})\/(\d+)\s+([^)*]+)/.exec(line);
  if (m) {
    if (!/İngilizce|Ingilizce/i.test(m[3])) return { skip: true };
    return { key: `${m[1]}-eYDS/${m[2]}`, exam: 'yds', deliveryMode: 'computer', name: `${m[1]} e-YDS/${m[2]}`, year: Number(m[1]) };
  }
  m = /\b(\d{4})-YÖKDİL\/(\d+)/i.exec(line);
  if (m) return { key: `${m[1]}-YOKDIL/${m[2]}`, exam: 'yokdil', deliveryMode: 'paper', name: `${m[1]} YÖKDİL/${m[2]}`, year: Number(m[1]) };
  m = /\be-YÖKDİL\s+(\d{4})\/(\d+)\s+([^)*]+)/i.exec(line);
  if (m) return { key: `${m[1]}-eYOKDIL/${m[2]}`, exam: 'yokdil', deliveryMode: 'computer', name: `${m[1]} e-YÖKDİL/${m[2]} (${m[3].trim()})`.slice(0, 120), year: Number(m[1]) };
  return null;
};

/** Tarih sırası mantıklı mı? (başvuru ≤ bitiş ≤ geç ≤ sınav ≤ sonuç) */
export const sessionProblems = (s) => {
  const e = [];
  if (!s.date) e.push('sınav tarihi yok');
  if (s.applicationStart && s.applicationEnd && s.applicationEnd < s.applicationStart) e.push('başvuru bitişi başlangıçtan önce');
  if (s.applicationEnd && s.date && s.applicationEnd > s.date) e.push('başvuru bitişi sınavdan sonra');
  if (s.lateApplicationEnd && s.applicationEnd && s.lateApplicationEnd < s.applicationEnd) e.push('geç başvuru normal bitişten önce');
  if (s.resultDate && s.date && s.resultDate < s.date) e.push('sonuç sınavdan önce');
  return e;
};

/** Satırlar → oturumlar. Dönüş: { sessions, problems } (problems: ayrıştırılamayan kod satırları). */
export const parseCalendarRows = (rows) => {
  const sessions = [];
  const problems = [];
  rows.forEach((line, i) => {
    const id = matchCode(line);
    if (!id || id.skip) return;
    const mid = datesIn(rows[i - 1] || '');
    const top = datesIn(rows[i - 2] || '');
    const own = datesIn(line);
    const lateMissing = /-{3,}/.test(rows[i - 1] || '');
    const s = {
      ...id,
      applicationStart: top.at(-1) || null,
      applicationEnd: own.at(-1) || null,
      date: mid[0] || null,
      lateApplicationEnd: lateMissing ? null : (mid.length >= 3 ? mid[1] : null),
      resultDate: mid.length >= 2 ? mid.at(-1) : null,
    };
    const errs = sessionProblems(s);
    if (errs.length) problems.push({ line: line.trim().slice(0, 120), errors: errs });
    else sessions.push(s);
  });
  return { sessions, problems };
};

/** Takvim metninde yabancı dil sınavı geçiyor mu? (kural ayrıştırıcı hiçbir şey bulamazsa LLM'e düşmek için) */
export const mentionsLanguageExams = (rows) => rows.some((r) => /YDS|YÖKDİL/i.test(r));
