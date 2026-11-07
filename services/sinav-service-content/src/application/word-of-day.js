// Günün kelimesi: her gün için tarihe bağlı, herkese aynı bir kelime / bağlaç / phrasal verb (destelerden).
// Mobil uygulama önümüzdeki günlerinkini alıp yerel bildirim olarak kurar (sunucu push'u yok, ücret yok).
// Sıra 4 günlük döngü: kelime (YDS'de sık çıkanlar), bağlaç/geçiş ifadesi (connectors), kelime, phrasal verb.

const CYCLE = ['yds-frequent', 'connectors', 'yds-frequent', 'phrasal-verbs'];
const MAX_DAYS = 14;
const DAY_MS = 86400000;

const dayNumber = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const isoOf = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
// Aynı destede ardışık günler birbirine yakın kelimeler seçmesin: gün numarası karıştırılır (FNV-1a).
const mix = (n) => {
  let h = 2166136261;
  for (const ch of String(n)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const kindOf = (deckKey, pos) => {
  if (deckKey === 'phrasal-verbs' || pos === 'phrasal_verb') return 'phrasal';
  if (pos === 'conjunction') return 'conjunction';
  if (pos === 'preposition') return 'preposition';
  if (deckKey === 'connectors') return 'connector';
  return 'word';
};

export const makeWordOfDay = ({ rawQuery }) => {
  const cache = new Map();
  /** Destenin yayımlanmış kelimeleri (kimlik sırasıyla; 10 dk bellekte). */
  const entriesOf = async (deckKey) => {
    const hit = cache.get(deckKey);
    if (hit && hit.at > Date.now() - 10 * 60 * 1000) return hit.rows;
    const { rows } = await rawQuery(
      `SELECT i.item_code AS "itemCode", v.vocab_entry_headword AS headword, v.vocab_entry_part_of_speech AS pos,
              v.vocab_entry_meanings AS meanings, v.vocab_entry_examples AS examples
         FROM content.deck d
         JOIN content.deck_entry e ON e.deck_entry_deck_id = d.deck_id
         JOIN content.item i ON i.item_id = e.deck_entry_vocab_item_id AND i.item_status = 'published'
         JOIN content.vocab_entry v ON v.vocab_entry_item_revision_id = i.item_published_revision_id
        WHERE d.deck_key = $1 AND d.deck_status = 'published'
        ORDER BY i.item_id`, [deckKey]);
    cache.set(deckKey, { at: Date.now(), rows });
    return rows;
  };

  /**
   * from: 'YYYY-MM-DD' (cihazın yerel günü), days ≤ 14.
   * → [{ date, kind: word|conjunction|preposition|connector|phrasal, itemCode, headword, partOfSpeech, meaning, example: { en, tr } | null }]
   */
  const daily = async ({ from, days }) => {
    const start = /^\d{4}-\d{2}-\d{2}$/.test(String(from || '')) ? dayNumber(from) : Math.floor(Date.now() / DAY_MS);
    const n = Math.min(MAX_DAYS, Math.max(1, Number(days) || 7));
    const out = [];
    for (let k = 0; k < n; k += 1) {
      const day = start + k;
      let deckKey = CYCLE[((day % CYCLE.length) + CYCLE.length) % CYCLE.length];
      let rows = await entriesOf(deckKey);
      if (!rows.length) { deckKey = 'yds-frequent'; rows = await entriesOf(deckKey); }
      if (!rows.length) continue;
      const r = rows[mix(day) % rows.length];
      const meanings = Array.isArray(r.meanings) ? r.meanings : [];
      const examples = Array.isArray(r.examples) ? r.examples : [];
      const ex = examples.find((e) => e?.en && e.en.length <= 140) || examples[0] || null;
      out.push({
        date: isoOf(day), kind: kindOf(deckKey, r.pos), itemCode: Number(r.itemCode), headword: r.headword, partOfSpeech: r.pos,
        meaning: meanings.slice(0, 2).map((m) => (typeof m === 'string' ? m : m?.tr)).filter(Boolean).join(', ') || null,
        example: ex?.en ? { en: ex.en, tr: ex.tr || null } : null,
      });
    }
    return out;
  };
  return Object.freeze({ daily });
};
