// Returned as a SQL fragment (not a JS string literal) so processColumnValues
// can inline it as `NOW()` in the VALUES/SET clause without producing the
// un-quoted ISO string that a raw Date.toISOString() would emit.
const utcNow = () => 'NOW()';

let tableDefinitions = {};
let allColumns = {};

export const initQueryBuilder = (definitions) => {
  tableDefinitions = definitions;
  allColumns = {};
  for (const [tName, tObj] of Object.entries(definitions)) {
    for (const [key, col] of Object.entries(tObj[tName] || {})) {
      allColumns[key] = col.original;
    }
  }
};

const getTableObject = (tableName) => {
  let dbObject = tableDefinitions[tableName];
  if (!dbObject) {
    throw new Error(`${tableName.toUpperCase()}_TABLE_NOT_FOUND_ON_MAPPING`);
  }
  return dbObject;
};

const getColumnName = (key) => {
  const original = allColumns[key];
  if (!original) {
    throw new Error(`${key.toUpperCase()}_NOT_FOUND`);
  }
  return original;
};

const getCreatedColumns = (tableName) => {
  let dbObject = getTableObject(tableName);
  let createdList = Object.values(dbObject[tableName])
    .filter((item) => item.camelCase.toLowerCase().includes('created'))
    .map((item) => item.camelCase);
  return createdList;
};
const getUpdatedColumns = (tableName) => {
  let dbObject = getTableObject(tableName);
  let updatedList = Object.values(dbObject[tableName])
    .filter((item) => item.camelCase.toLowerCase().includes('updated'))
    .map((item) => item.camelCase);
  return updatedList;
};
// Caller kapsamini (tenant/organization) belirleyen kolonlar. Tespit ADA
// dayalidir: `...TenantCode` / `...OrganizationId` ile biten kolonlar hem READ
// filtresine hem INSERT varsayilanina girer.
//
// ⚠️ `excludeFromCallerScope: true` — ada gore YAKALANAN ama kapsam ANLAMI
// TASIMAYAN kolonlar icin cikis kapisi (2026-08-05).
//
// Neden gerekti: `reference.shipping_line` PLATFORM referans verisidir (Maersk,
// Turkish Cargo...) ve `shipping_line_organization_id` kolonu tasir ama TUM
// satirlarda NULL'dur. Ada dayali tespit bunu kapsam kolonu sanip her okumaya
// `organization_id = <caller>` kosulu ekliyordu; NULL hicbir organizasyonla
// eslesmedigi icin `/v1/shipping-lines` HER cagirana BOS dizi donuyordu.
// Sonuc: teklif formundaki tasiyici secicisi hep bostu ve `lineId` ZORUNLU
// oldugu icin formdan hic teklif gonderilemiyordu — hata da vermiyordu,
// yalnizca "secenek yok".
const getTenantAndOrganizationColumns = (tableName) => {
  let dbObject = getTableObject(tableName);
  let list = Object.values(dbObject[tableName])
    .filter(
      (item) =>
        item.excludeFromCallerScope !== true &&
        (item.camelCase.toLowerCase().endsWith('tenantcode') ||
          item.camelCase.toLowerCase().endsWith('organizationid')),
    )
    .map((item) => item.camelCase);
  return list;
};
const getIdentityColumnCC = (tableName) => {
  let dbObject = getTableObject(tableName);
  let identityColumn = Object.values(dbObject[tableName])
    .filter((item) => item.isIdentity)
    .map((item) => item.camelCase);
  return identityColumn.length ? identityColumn[0] : '';
};
const getIdentityColumn = (tableName) => {
  let dbObject = getTableObject(tableName);
  let identityColumn = Object.values(dbObject[tableName])
    .filter((item) => item.isIdentity)
    .map((item) => item.original);
  return identityColumn.length ? identityColumn[0] : '';
};
const getUniqueColumns = (tableName) => {
  let dbObject = getTableObject(tableName);
  let uniqueColumns = Object.values(dbObject[tableName])
    .filter((item) => item.isUnique)
    .map((item) => item.camelCase);
  return uniqueColumns;
};

// `'none'` is a sentinel a caller can pass for a field it legitimately can't
// supply (e.g. the public self-registration flow has no userId yet). When
// we see it, we skip injecting the corresponding column — `created_at`/
// `updated_at` still get `NOW()` because they don't depend on the caller.
// Truly-undefined (missing) fields still throw, since those are almost
// always bugs — the sentinel must be explicit.
const SKIP = 'none';

const getDefaultCreatedColumns = (tableName, { callerUserId }) => {
  if (callerUserId !== SKIP && !callerUserId)
    throw new Error('callerUserId is undefined');
  let columns = {};
  let createdColumns = getCreatedColumns(tableName);
  let createdByColumn = createdColumns.find((item) =>
    item.toLowerCase().includes('createdby'),
  );
  let createdAtColumn = createdColumns.find((item) =>
    item.toLowerCase().includes('createdat'),
  );
  if (createdAtColumn) {
    columns[createdAtColumn] = utcNow;
  }
  if (createdByColumn && callerUserId !== SKIP) {
    columns[createdByColumn] = callerUserId;
  }
  return columns;
};

const getDefaultUpdatedColumns = (tableName, { callerUserId }) => {
  if (callerUserId !== SKIP && !callerUserId)
    throw new Error('callerUserId is undefined');
  let columns = {};
  let updatedColumns = getUpdatedColumns(tableName);
  let updatedByColumn = updatedColumns.find((item) =>
    item.toLowerCase().includes('updatedby'),
  );
  let updatedAtColumn = updatedColumns.find((item) =>
    item.toLowerCase().includes('updatedat'),
  );
  if (updatedAtColumn) {
    columns[updatedAtColumn] = utcNow;
  }
  if (updatedByColumn && callerUserId !== SKIP) {
    columns[updatedByColumn] = callerUserId;
  }
  return columns;
};

const getDefaultTenantAndOrganizationColumns = (
  tableName,
  { callerTenantCode, callerOrganizationId },
) => {
  if (callerTenantCode !== SKIP && !callerTenantCode)
    throw new Error('callerTenantCode is undefined');
  if (callerOrganizationId !== SKIP && !callerOrganizationId)
    throw new Error('callerOrganizationId is undefined');
  let columns = {};
  let tenantOrganizationColumns = getTenantAndOrganizationColumns(tableName);
  // Denetim #72: birden çok kapsam kolonu varsa "ilki" nesne anahtar sırasına
  // bağlı sessiz bir seçimdi (saved_carrier'da yük sahibinin favorileri
  // TAŞIYICI kolonuyla süzülüyordu). Karşı taraf kolonları tanımda
  // `excludeFromCallerScope: true` olmalı; aksi hâlde yüksek sesle patla.
  const orgScopeCols = tenantOrganizationColumns.filter((c) =>
    c.toLowerCase().endsWith('organizationid'),
  );
  const tenantScopeCols = tenantOrganizationColumns.filter((c) =>
    c.toLowerCase().endsWith('tenantcode'),
  );
  if (orgScopeCols.length > 1 || tenantScopeCols.length > 1) {
    throw new Error(
      `query-builder: ${tableName} has ambiguous caller scope columns (${[
        ...orgScopeCols,
        ...tenantScopeCols,
      ].join(', ')}); mark counterparty columns excludeFromCallerScope`,
    );
  }
  let tenantColumn = tenantOrganizationColumns.find((item) =>
    item.toLowerCase().endsWith('tenantcode'),
  );
  let organizationColumn = tenantOrganizationColumns.find((item) =>
    item.toLowerCase().endsWith('organizationid'),
  );
  if (tenantColumn && callerTenantCode !== SKIP) {
    columns[tenantColumn] = callerTenantCode;
  }
  if (organizationColumn && callerOrganizationId !== SKIP) {
    columns[organizationColumn] = callerOrganizationId;
  }
  return columns;
};

const processColumnValues = (columns, data, defaultColumns) => {
  const parameters = [];
  const columnNames = [];
  const placeholders = [];

  columns.forEach((key) => {
    // `key in data` preserves explicit falsy values (false, 0, '', null) from
    // the caller; `data[key] || default` would silently drop them.
    const value = key in data ? data[key] : defaultColumns[key];
    const columnName = getColumnName(key);

    columnNames.push(columnName);

    if (typeof value === 'function') {
      placeholders.push(value());
      // parameters.push(value());
    } else {
      placeholders.push(`$${parameters.length + 1}`);
      parameters.push(value);
    }
  });

  return { parameters, columnNames, placeholders };
};

export {
  getTableObject,
  getColumnName,
  getCreatedColumns,
  getUpdatedColumns,
  getTenantAndOrganizationColumns,
  getIdentityColumnCC,
  getIdentityColumn,
  getUniqueColumns,
  getDefaultCreatedColumns,
  getDefaultUpdatedColumns,
  getDefaultTenantAndOrganizationColumns,
  processColumnValues,
};
