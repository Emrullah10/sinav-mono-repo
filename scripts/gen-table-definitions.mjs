// information_schema → core/service-<d>/.../table-definitions.js (şablon §5.1).
// Kullanım: node scripts/gen-table-definitions.mjs [--check]   (--check: sapmada çıkış 1)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });
const CHECK = process.argv.includes('--check');
const DB_NAME = 'sinav';

const SERVICE_SCHEMAS = {
  identity: ['identity', 'enums', 'notify', 'audit', 'storage'],
  content: ['content'],
  learning: ['learning'],
  billing: ['billing'],
  tutor: ['tutor'],
};
const SENSITIVE = new Set([
  'user_account.user_account_password_hash', 'auth_code.auth_code_code_hash',
  'external_identity.external_identity_subject', 'data_export_request.data_export_request_download_token_hash',
  'waitlist_entry.waitlist_entry_confirm_token_hash', 'device.device_push_token', 'blob.blob_data',
  'billing_profile.billing_profile_national_id', 'payment_method.payment_method_provider_token',
]);
const EXCLUDE_SCOPE = new Set([
  'content_report.content_report_reporter_organization_id',
  'message_report.message_report_reporter_organization_id',
  'contact_message.contact_message_sender_organization_id',
]);

const camel = (s) => s.replace(/_([a-z0-9])/g, (_m, c) => c.toUpperCase());
const TYPES = {
  int8: 'bigint', int4: 'integer', int2: 'smallint', varchar: 'character varying', text: 'text', bool: 'boolean',
  timestamptz: 'timestamp with time zone', date: 'date', time: 'time without time zone', numeric: 'numeric',
  jsonb: 'jsonb', uuid: 'uuid', bytea: 'bytea', _varchar: 'ARRAY',
};

const client = new pg.Client({ connectionString: process.env.CORE_APP_DB_CONNECTION_STRING });
await client.connect();

const q = async (sql, params) => (await client.query(sql, params)).rows;
const schemasAll = Object.values(SERVICE_SCHEMAS).flat();
const cols = await q(
  `SELECT c.table_schema, c.table_name, c.column_name, c.udt_name, c.data_type, c.character_maximum_length,
          c.is_nullable, c.is_identity, c.ordinal_position
     FROM information_schema.columns c
     JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
    WHERE c.table_schema = ANY($1) ORDER BY c.table_schema, c.table_name, c.ordinal_position`, [schemasAll]);
const cons = await q(
  `SELECT con.contype, ns.nspname AS schema, cl.relname AS tbl, array_agg(a.attname ORDER BY k.ord) AS cols,
          fns.nspname AS fschema, fcl.relname AS ftbl,
          (SELECT a2.attname FROM pg_attribute a2 WHERE a2.attrelid=con.confrelid AND a2.attnum=con.confkey[1]) AS fcol
     FROM pg_constraint con
     JOIN pg_class cl ON cl.oid=con.conrelid JOIN pg_namespace ns ON ns.oid=cl.relnamespace
     CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
     JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum
     LEFT JOIN pg_class fcl ON fcl.oid=con.confrelid LEFT JOIN pg_namespace fns ON fns.oid=fcl.relnamespace
    WHERE ns.nspname = ANY($1) AND con.contype IN ('p','u','f')
    GROUP BY con.oid, con.contype, ns.nspname, cl.relname, fns.nspname, fcl.relname, con.confrelid, con.confkey`, [schemasAll]);

const idx = new Map();
for (const c of cons) {
  if (c.cols.length !== 1) continue;
  const key = `${c.schema}.${c.tbl}.${c.cols[0]}`;
  const e = idx.get(key) || {};
  if (c.contype === 'p') e.pk = true;
  if (c.contype === 'u') e.unique = true;
  if (c.contype === 'f') e.fk = { schema: c.fschema, table: c.ftbl, column: c.fcol };
  idx.set(key, e);
}

const byTable = new Map();
for (const c of cols) {
  const k = `${c.table_schema}.${c.table_name}`;
  if (!byTable.has(k)) byTable.set(k, []);
  byTable.get(k).push(c);
}

const names = new Map();
const out = {};
for (const [svc, schemas] of Object.entries(SERVICE_SCHEMAS)) out[svc] = [];
for (const [k, columns] of byTable) {
  const [schema, table] = k.split('.');
  const svc = Object.entries(SERVICE_SCHEMAS).find(([, s]) => s.includes(schema))[0];
  const obj = camel(table);
  if (names.has(obj)) throw new Error(`tablo adı çakışması: ${obj} (${names.get(obj)} / ${k})`);
  names.set(obj, k);
  const sorted = columns
    .map((c) => ({ c, cc: camel(c.column_name) }))
    .sort((a, b) => (a.cc < b.cc ? -1 : a.cc > b.cc ? 1 : 0));
  let body = '';
  for (const { c, cc } of sorted) {
    const e = idx.get(`${schema}.${table}.${c.column_name}`) || {};
    const lines = [
      `      original: '${c.column_name}',`,
      ...(SENSITIVE.has(`${table}.${c.column_name}`) ? ['      sensitive: true,'] : []),
      ...(EXCLUDE_SCOPE.has(`${table}.${c.column_name}`) ? ['      excludeFromCallerScope: true,'] : []),
      `      camelCase: '${cc}',`,
      `      udtName: '${c.udt_name}',`,
      `      dataType: '${TYPES[c.udt_name] || c.data_type}',`,
      `      characterMaximumLength: ${c.character_maximum_length ?? 'null'},`,
      `      isIdentity: ${c.is_identity === 'YES'},`,
      `      isNullable: ${c.is_nullable === 'YES'},`,
      `      isPrimaryKey: ${!!e.pk},`,
      `      isForeignKey: ${!!e.fk},`,
      ...(e.fk ? [`      foreignTableSchema: '${e.fk.schema}',`, `      foreignTableName: '${e.fk.table}',`, `      foreignColumnName: '${e.fk.column}',`] : []),
      `      isUnique: ${!!e.unique},`,
      `      isIndex: false,`,
    ];
    body += `    ${cc}: {\n${lines.join('\n')}\n    },\n`;
  }
  out[svc].push({ obj, text: `const ${obj} = {\n  table: {\n    dbName: '${DB_NAME}',\n    schemaName: '${schema}',\n    tableName: '${table}',\n    tableNameWithSchema: '${schema}.${table}',\n  },\n  ${obj}: {\n${body}  },\n};\n` });
}
await client.end();

let drift = false;
for (const [svc, tables] of Object.entries(out)) {
  tables.sort((a, b) => (a.obj < b.obj ? -1 : 1));
  const text = `// ÜRETİLDİ: node scripts/gen-table-definitions.mjs — elle düzenleme (bayraklar betikte).\nimport { applyDefaultPermissions } from 'example-builder';\n\n${tables.map((t) => t.text).join('\n')}\nexport default applyDefaultPermissions({\n${tables.map((t) => `  ${t.obj},`).join('\n')}\n});\n`;
  const file = path.join(ROOT, `core/service-${svc}/src/infrastructure/persistence/schemas/table-definitions.js`);
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (cur !== text) {
    drift = true;
    if (!CHECK) fs.writeFileSync(file, text);
  }
  console.log(`${svc}: ${tables.length} tablo${cur !== text ? (CHECK ? ' (SAPMA)' : ' (yazıldı)') : ''}`);
}
if (CHECK && drift) process.exit(1);
