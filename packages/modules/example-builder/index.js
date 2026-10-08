import { faker } from '@faker-js/faker';

const hashSeed = (s) => {
  const str = String(s || 'default');
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
};

const truncate = (s, n) => {
  if (typeof s !== 'string' || !n || s.length <= n) return s;
  return s.substring(0, n);
};

// Pinned refDate so faker.date.* methods are fully deterministic when
// seeded. Without this, date methods fall back to `new Date()` as refDate
// and leak Date.now() non-determinism through to the output.
const REF_DATE = new Date('2024-01-01T00:00:00.000Z');

const pickValue = (col, seededFaker) => {
  const t = (col.udtName || col.dataType || '').toLowerCase();
  const maxLen = col.characterMaximumLength;
  if (t.includes('char') || t.includes('text')) {
    return truncate(seededFaker.lorem.sentence(), maxLen);
  }
  if (t.includes('int')) {
    return seededFaker.number.int({ min: 1, max: maxLen || 2 });
  }
  if (
    t.includes('numeric') ||
    t.includes('decimal') ||
    t.includes('float') ||
    t.includes('double')
  ) {
    return seededFaker.number.float({ min: 0, max: 1000, precision: 0.01 });
  }
  if (t.includes('bool')) {
    return seededFaker.datatype.boolean();
  }
  if (t === 'date') {
    return seededFaker.date.past({ refDate: REF_DATE }).toISOString();
  }
  if (t.includes('time') || t.includes('timestamp')) {
    return seededFaker.date.recent({ refDate: REF_DATE }).toISOString();
  }
  if (t.includes('json')) {
    return {};
  }
  return truncate(seededFaker.lorem.word(), maxLen);
};

export const buildExample = (columns, seed) => {
  faker.seed(hashSeed(seed));
  const out = {};
  for (const [key, col] of Object.entries(columns)) {
    out[key] = pickValue(col, faker);
  }
  return out;
};

// Seeded-faker payload for unit tests. Identity + audit (created/updated)
// columns excluded — validate() already ignores them. Tenant/organization
// kept since validate() expects them filled (auto-injected in prod; tests
// supply them explicitly). Use `overrides` to pin specific values.
export const buildTestPayload = (schema, overrides = {}) => {
  const columnsKey = Object.keys(schema).find((k) => k !== 'table');
  const columns = schema[columnsKey];
  const tableName = schema.table.tableName;
  faker.seed(hashSeed(`${tableName}:test`));

  const isExcluded = (k, c) => {
    if (c.isIdentity) return true;
    const lc = k.toLowerCase();
    return lc.includes('created') || lc.includes('updated');
  };

  const out = {};
  for (const [key, col] of Object.entries(columns)) {
    if (isExcluded(key, col)) continue;
    out[key] = pickValue(col, faker);
  }
  return { ...out, ...overrides };
};

const toKebabCase = (snake) => snake.replace(/_/g, '-');
const pluralize = (s) => (s.endsWith('s') ? s : `${s}s`);

const headerParams = [
  { in: 'header', name: 'userid', schema: { type: 'string' } },
  { in: 'header', name: 'tenantcode', schema: { type: 'string' } },
  { in: 'header', name: 'organizationid', schema: { type: 'string' } },
];

// Schema-bazlı default permission policy. Tablo `table.permissions` deklare
// etmezse `applyDefaultPermissions` bu mapping'ten okur. Domain tabloları
// için write: false (auto-CRUD POST kapalı; mutation custom use-case'lerden).
// Anti-escalation: identity.user_account/role_permission gibi tablolarda
// direct POST imkânsız.
const SCHEMA_DEFAULT_PERMISSIONS = {
  enums:    { read: '*',                    write: false },
  reference:{ read: '*',                    write: false },
  identity: { read: 'platform:user:read',   write: false },
  audit:    { read: 'platform:audit:read',  write: false },
  content:  { read: 'content:read',         write: false },
  notify:   { read: false,                  write: false },
  storage:  { read: false,                  write: false },
  learning: { read: false,                  write: false },
  billing:  { read: false,                  write: false },
  tutor:    { read: false,                  write: false },
};

// Kapsam kolonu olmadan da okunabilecek şemalar (platform geneli referans veri).
const UNSCOPED_READ_SCHEMAS = new Set(['enums', 'reference']);

// Auto-CRUD okuması satırları çağıranın ORGANİZASYONUNA göre süzer
// (query-builder `getTenantAndOrganizationColumns`). Tenant kolonu tek başına
// kapsam SAYILMAZ: platform tek-tenant (identity `tenant/index.js`), yani
// yalnız tenant'a göre süzülen bir tablo her oturumlu kullanıcıya TÜM
// satırlarını döner. `phone_otp` böyleydi: `user:read` sahibi her kullanıcı
// platformdaki tüm telefon numaralarını, IP ve UA'ları görüyordu (denetim #4).
const hasOrganizationScope = (schema) => {
  const columnsKey = Object.keys(schema).find((k) => k !== 'table');
  return Object.values(schema[columnsKey] || {}).some(
    (c) =>
      c?.excludeFromCallerScope !== true &&
      typeof c?.camelCase === 'string' &&
      c.camelCase.toLowerCase().endsWith('organizationid'),
  );
};

// Helper: tablo entry'lerini iterate eder, eksik permissions'ı schema bazlı
// default'tan ekler. Servisler `table-definitions.js`'in en sonunda çağırır:
//   export default applyDefaultPermissions(tableDefs)
// Override için: tabloya elle `table.permissions` ekle, helper o tabloyu
// olduğu gibi bırakır.
//
// ⚠️ FAIL-CLOSED: organizasyon kolonu olmayan (enums/reference dışı) tabloda
// varsayılan okuma KAPALIDIR (`read: false`). Böyle bir tabloyu HTTP'den açmak
// bilinçli bir karar olmalı: tabloya açık `table.permissions` yaz. Servis içi
// `coreUseCases.X.read` bundan etkilenmez — izin yalnız auto-CRUD GET ucunu
// üretir.
export const applyDefaultPermissions = (tableDefs) => {
  const out = {};
  for (const [key, schema] of Object.entries(tableDefs)) {
    if (!schema?.table) {
      out[key] = schema;
      continue;
    }
    if (schema.table.permissions) {
      out[key] = schema;
      continue;
    }
    const schemaName = schema.table.schemaName;
    const policy = SCHEMA_DEFAULT_PERMISSIONS[schemaName];
    if (!policy) {
      throw new Error(
        `applyDefaultPermissions: unknown schema '${schemaName}' for table '${schema.table.tableName}'. Add explicit 'permissions' or extend SCHEMA_DEFAULT_PERMISSIONS in example-builder.`,
      );
    }
    const permissions =
      UNSCOPED_READ_SCHEMAS.has(schemaName) || hasOrganizationScope(schema)
        ? { ...policy }
        : { ...policy, read: false };
    out[key] = {
      ...schema,
      table: { ...schema.table, permissions },
    };
  }
  return out;
};

// Build a full OpenAPI shard (schemas + paths) from a table-definitions.js
// entry. Nothing about the shard is static — every key, summary, and example
// is derived from the schema object so table-definitions is the single source
// of truth.
//
// Permission policy (fail-closed):
//   `schema.table.permissions = { read, write }` ZORUNLU.
//   - `read`: gateway permission code; '*' (any-authenticated) veya
//     `PERMISSIONS.X` value (örn. 'rfq:read').
//   - `write`: aynı format VEYA `false` (POST endpoint hiç üretilmez —
//     domain tabloları için tercih edilen).
// Permissions deklare edilmemiş tablo boot'ta throw eder; auto-CRUD sessizce
// açık kalmaz.
export const buildShard = (schema) => {
  const columnsKey = Object.keys(schema).find((k) => k !== 'table');
  if (!columnsKey) {
    throw new Error(
      'buildShard: schema must have a columns key beside "table"',
    );
  }
  const tableName = schema.table.tableName;
  const tablePermissions = schema.table?.permissions;
  if (
    !tablePermissions ||
    typeof tablePermissions.read === 'undefined' ||
    typeof tablePermissions.write === 'undefined'
  ) {
    throw new Error(
      `buildShard: table '${tableName}' missing 'permissions: { read, write }' — auto-CRUD requires explicit permission declaration (fail-closed). 'write: false' to disable POST endpoint.`,
    );
  }

  const columns = schema[columnsKey];
  const camel = columnsKey;
  const pascal = camel[0].toUpperCase() + camel.slice(1);
  const apiName = pluralize(toKebabCase(tableName));

  const props = Object.fromEntries(
    Object.entries(columns).map(([k, c]) => [k, getOpenApiType(c)]),
  );
  const examplePost = buildExample(columns, `${tableName}:post`);
  const exampleGet = buildExample(columns, `${tableName}:get`);

  const pathDef = { [`/v1/${apiName}`]: {} };

  // GET endpoint sadece read !== false ise üretilir.
  //
  // `read: false` YANILTICI auto-CRUD okumalarını kapatmak için: query-builder
  // (`getTenantAndOrganizationColumns`) org kolonunu `endsWith('organizationid')`
  // + `.find()` ile seçiyor, yani İKİ org kolonu olan tabloda alfabetik olarak
  // ilkini alıyor. `shipment.shipment` böyle bir tablo (carrier + shipper):
  // auto-CRUD GET taşıyıcıya doğru, YÜK SAHİBİNE her zaman 0 satır dönüyordu.
  // Sızıntı değil (filtre fazla kısıtlayıcı) ama uç yanlış cevap veriyor —
  // kapatmak, dokümante edip açık bırakmaktan güvenli.
  if (tablePermissions.read !== false) {
    pathDef[`/v1/${apiName}`].get = {
      summary: `Get all rows from ${tableName}`,
      'x-functionName': `get${pascal}`,
      tags: [pascal],
      'x-serviceDiscovery': [{ permissionList: tablePermissions.read }],
      parameters: [
        ...headerParams,
        {
          in: 'query',
          name: 'queryParams',
          schema: { $ref: '#/components/schemas/QueryParameters' },
        },
      ],
      responses: {
        200: {
          description: 'Get the list',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/responseGet' },
            },
          },
        },
      },
    };
  }

  // POST endpoint sadece write !== false ise üretilir.
  if (tablePermissions.write !== false) {
    pathDef[`/v1/${apiName}`].post = {
      summary: `Insert or update rows in ${tableName}`,
      'x-functionName': `post${pascal}`,
      tags: [pascal],
      'x-serviceDiscovery': [{ permissionList: tablePermissions.write }],
      parameters: headerParams,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: `#/components/schemas/post${pascal}` },
          },
        },
      },
      responses: {
        200: {
          description: 'Upserted',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/responsePost' },
            },
          },
        },
      },
    };
  }

  return {
    schemas: {
      [`post${pascal}`]: { type: 'object', properties: props },
      [`post${pascal}Response`]: {
        type: 'object',
        properties: {
          code: { type: 'string', example: 'success' },
          message: { type: 'string', example: 'Success' },
          item: { type: 'object', example: examplePost },
        },
      },
      [`get${pascal}Response`]: {
        type: 'object',
        properties: {
          code: { type: 'string', example: 'success' },
          message: { type: 'string', example: 'Success' },
          list: { type: 'array', example: [exampleGet] },
        },
      },
    },
    // Hiç operasyon üretilmediyse (read:false + write:false) yolu HİÇ ekleme —
    // OpenAPI'de boş bir path nesnesi bırakmak service-discovery'yi ve şema
    // doğrulayıcılarını gereksiz yere meşgul eder.
    paths: Object.keys(pathDef[`/v1/${apiName}`]).length ? pathDef : {},
  };
};

export const getOpenApiType = (col) => {
  const t = (col.udtName || col.dataType || '').toLowerCase();
  if (t.includes('int8') || t.includes('bigint')) {
    return { type: 'integer', format: 'int64' };
  }
  if (t.includes('int')) {
    return { type: 'integer', format: 'int32' };
  }
  if (
    t.includes('numeric') ||
    t.includes('decimal') ||
    t.includes('float') ||
    t.includes('double')
  ) {
    return { type: 'number', format: 'double' };
  }
  if (t.includes('bool')) {
    return { type: 'boolean' };
  }
  if (t.includes('json')) {
    return { type: 'object' };
  }
  if (t === 'date') {
    return { type: 'string', format: 'date' };
  }
  if (t.includes('time') || t.includes('timestamp')) {
    return { type: 'string', format: 'date-time' };
  }
  return { type: 'string' };
};
