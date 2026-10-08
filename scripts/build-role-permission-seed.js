#!/usr/bin/env node
// Generates 3 SQL INSERT blocks from permissions.js source-of-truth:
//   - INSERT INTO enums.user_account_role
//   - INSERT INTO enums.permission
//   - INSERT INTO enums.role_permission
//
// Run: `node scripts/build-role-permission-seed.js`
// Output: stdout (copy/paste into db-schemas/00-enums-schema.sql) or
//         use --write to patch in-place.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
} from '../packages/modules/shared/permissions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_FILE = path.resolve(__dirname, '..', 'db-schemas', '00-enums-schema.sql');

const ROLE_LABELS = {
  superadmin:        'Super Admin',
  platform_support:  'Platform Support',
  content_editor:    'Content Editor',
  content_reviewer:  'Content Reviewer',
  learner:           'Learner',
  guest:             'Guest',
};

const labelize = (code) =>
  code
    .split(/[:_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');

const buildRoleInsert = () => {
  const roleEntries = Object.values(ROLES);
  const lines = roleEntries.map((role, i) => {
    const label = ROLE_LABELS[role] || role;
    return `    ('${role}', '${label.replace(/'/g, "''")}', ${i})`;
  });
  return [
    'INSERT INTO enums.user_account_role (user_account_role_value, user_account_role_label, user_account_role_sort_order) VALUES',
    lines.join(',\n') + ';',
  ].join('\n');
};

const buildPermissionInsert = () => {
  const codes = Object.values(PERMISSIONS);
  const lines = codes.map((code, i) => {
    const label = labelize(code);
    return `    ('${code}', '${label.replace(/'/g, "''")}', ${i})`;
  });
  return [
    'INSERT INTO enums.permission (permission_value, permission_label, permission_sort_order) VALUES',
    lines.join(',\n') + ';',
  ].join('\n');
};

const buildRolePermissionInsert = () => {
  const rows = [];
  for (const role of Object.values(ROLES)) {
    const perms = ROLE_PERMISSIONS[role] || [];
    for (const perm of perms) {
      rows.push(`    ('${role}', '${perm}')`);
    }
  }
  return [
    'INSERT INTO enums.role_permission (role_permission_role, role_permission_permission) VALUES',
    rows.join(',\n') + ';',
  ].join('\n');
};

const replaceBlock = (sql, regex, replacement) => {
  if (!regex.test(sql)) {
    throw new Error(`Pattern not found: ${regex}`);
  }
  return sql.replace(regex, replacement);
};

const writeMode = process.argv.includes('--write');

const roleInsert = buildRoleInsert();
const permInsert = buildPermissionInsert();
const rolePermInsert = buildRolePermissionInsert();

if (!writeMode) {
  console.log('-- enums.user_account_role -----------------------------\n');
  console.log(roleInsert);
  console.log('\n-- enums.permission -----------------------------\n');
  console.log(permInsert);
  console.log('\n-- enums.role_permission -----------------------------\n');
  console.log(rolePermInsert);
  console.log(
    '\n[hint] use --write to patch db-schemas/00-enums-schema.sql in-place',
  );
  process.exit(0);
}

let sql = fs.readFileSync(SCHEMA_FILE, 'utf8');

sql = replaceBlock(
  sql,
  /INSERT INTO enums\.user_account_role[\s\S]*?;\n/m,
  roleInsert + '\n',
);
sql = replaceBlock(
  sql,
  /INSERT INTO enums\.permission \(permission_value[\s\S]*?;\n/m,
  permInsert + '\n',
);
sql = replaceBlock(
  sql,
  /INSERT INTO enums\.role_permission[\s\S]*?;\n/m,
  rolePermInsert + '\n',
);

fs.writeFileSync(SCHEMA_FILE, sql);
console.log(`[ok] patched ${SCHEMA_FILE}`);
