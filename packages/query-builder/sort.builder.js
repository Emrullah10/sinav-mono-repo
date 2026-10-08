import { getColumnName } from './index.js';

const buildSort = (sortModel = []) => {
  // The `extended` (qs) query parser can deserialize a bracketed sortModel into
  // a plain object ({0:{...}}) instead of an array when indices are sparse or
  // exceed qs `arrayLimit`. Normalize to an array so `.map` can't throw — same
  // protection the custom list use-cases apply with normalizeSortModel.
  const items = Array.isArray(sortModel)
    ? sortModel
    : Object.values(sortModel || {});
  let sortClauses = items.map((sortItem) => {
    let { colId, sort } = sortItem || {};
    if (!sort || !colId) {
      throw new Error(`WRONG_SORT_PARAMETERS`);
    }
    let columnOrginalName = getColumnName(colId);
    // `sort` is client-supplied (AG-Grid params.sortModel) and must never be
    // interpolated raw into ORDER BY. Collapse anything but an explicit 'desc'
    // to ASC so a crafted direction can't inject SQL.
    const direction = String(sort).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    return `${columnOrginalName} ${direction}`;
  });
  return sortClauses.length ? `ORDER BY ${sortClauses.join(', ')}` : '';
};

export { buildSort };
