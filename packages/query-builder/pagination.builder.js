// HTTP query string'den gelen değerler STRING'dir (`?startRow=0&endRow=20` →
// `'0'`, `'20'`). Yalnız `typeof === 'number'` kabul edilseydi auto-CRUD GET'lerde
// LIMIT hiç uygulanmaz, istemci sayfa istese bile TÜM tablo dönerdi (denetim
// #74). Tam sayıya çevrilemeyen değer (NaN, '', '1e3x') sayfalama İSTENMEMİŞ
// sayılır — SQL'e asla ham string girmez.
const toRow = (value) => {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return Number.parseInt(value, 10);
  }
  return null;
};

const buildPagination = (startRow, endRow) => {
  const start = toRow(startRow);
  const end = toRow(endRow);
  if (start !== null && end !== null) {
    // Clamp to non-negative: an inverted range (endRow < startRow) or a negative
    // startRow would otherwise emit a negative LIMIT/OFFSET, which Postgres
    // rejects with a runtime error. A 0 limit safely returns no rows instead.
    const offset = Math.max(0, start);
    const limit = Math.max(0, end - offset);
    return `LIMIT ${limit} OFFSET ${offset}`;
  }
  return '';
};

export { buildPagination };
