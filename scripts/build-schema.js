#!/usr/bin/env node
import { readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMAS_DIR = join(REPO_ROOT, 'db-schemas');
const OUTPUT_FILE = join(SCHEMAS_DIR, '_combined.sql');
const OUTPUT_BASENAME = '_combined.sql';

async function listSqlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip migrations/ — those are one-shot ALTER scripts for upgrading
      // existing databases, not idempotent CREATE statements. Including them
      // in _combined.sql causes errors on fresh builds (e.g. dropping
      // identity.user_session that fresh schema never created).
      if (entry.name === 'migrations') continue;
      out.push(...(await listSqlFiles(full)));
    } else if (
      entry.isFile() &&
      !entry.name.startsWith('A') &&
      entry.name.endsWith('.sql') &&
      entry.name !== OUTPUT_BASENAME
    ) {
      out.push(full);
    }
  }
  return out.sort();
}

function splitStatements(sql) {
  const statements = [];
  let buf = '';
  let i = 0;
  let inLine = false;
  let inBlock = false;
  let inSingle = false;
  let dollarTag = null;
  const len = sql.length;

  while (i < len) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLine) {
      buf += ch;
      if (ch === '\n') inLine = false;
      i++;
      continue;
    }
    if (inBlock) {
      buf += ch;
      if (ch === '*' && next === '/') {
        buf += next;
        i += 2;
        inBlock = false;
        continue;
      }
      i++;
      continue;
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        buf += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      buf += ch;
      i++;
      continue;
    }
    if (inSingle) {
      buf += ch;
      if (ch === "'") {
        if (next === "'") {
          buf += next;
          i += 2;
          continue;
        }
        inSingle = false;
      }
      i++;
      continue;
    }

    if (ch === '-' && next === '-') {
      buf += ch;
      inLine = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      buf += ch;
      inBlock = true;
      i++;
      continue;
    }
    if (ch === "'") {
      buf += ch;
      inSingle = true;
      i++;
      continue;
    }
    if (ch === '$') {
      const m = sql.slice(i).match(/^\$([A-Za-z_]\w*)?\$/);
      if (m) {
        dollarTag = m[0];
        buf += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }
    if (ch === ';') {
      buf += ch;
      const trimmed = buf.trim();
      if (trimmed && trimmed !== ';') statements.push(buf);
      buf = '';
      i++;
      continue;
    }

    buf += ch;
    i++;
  }
  if (buf.trim()) statements.push(buf);
  return statements;
}

function stripComments(stmt) {
  let out = '';
  let i = 0;
  let inLine = false;
  let inBlock = false;
  let inSingle = false;
  let dollarTag = null;
  const len = stmt.length;

  while (i < len) {
    const ch = stmt[i];
    const next = stmt[i + 1];

    if (inLine) {
      if (ch === '\n') {
        out += ch;
        inLine = false;
      }
      i++;
      continue;
    }
    if (inBlock) {
      if (ch === '*' && next === '/') {
        i += 2;
        inBlock = false;
        continue;
      }
      i++;
      continue;
    }
    if (dollarTag) {
      if (stmt.startsWith(dollarTag, i)) {
        out += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      out += ch;
      i++;
      continue;
    }
    if (inSingle) {
      out += ch;
      if (ch === "'") {
        if (next === "'") {
          out += next;
          i += 2;
          continue;
        }
        inSingle = false;
      }
      i++;
      continue;
    }

    if (ch === '-' && next === '-') {
      inLine = true;
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlock = true;
      i += 2;
      continue;
    }
    if (ch === "'") {
      out += ch;
      inSingle = true;
      i++;
      continue;
    }
    if (ch === '$') {
      const m = stmt.slice(i).match(/^\$([A-Za-z_]\w*)?\$/);
      if (m) {
        dollarTag = m[0];
        out += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

function classify(cleanStmt) {
  const head = cleanStmt.trimStart().toUpperCase();
  if (head.startsWith('CREATE EXTENSION')) return 'extensions';
  if (head.startsWith('CREATE SCHEMA')) return 'schemas';
  if (head.startsWith('CREATE SEQUENCE')) return 'sequences';
  if (/^CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/.test(head)) return 'functions';
  if (/^CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/.test(head)) return 'triggers';
  if (/^CREATE\s+(UNIQUE\s+)?INDEX/.test(head)) return 'indexes';
  if (head.startsWith('CREATE TABLE')) return 'tables';
  if (head.startsWith('ALTER TABLE')) return 'tail';
  if (head.startsWith('COMMENT ON')) return 'comments';
  return 'tail';
}

function extractTableName(cleanStmt) {
  const m = cleanStmt.match(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][\w.]*)/i,
  );
  return m ? m[1] : null;
}

function extractReferences(cleanStmt) {
  const refs = new Set();
  const re = /REFERENCES\s+([A-Za-z_][\w.]*)/gi;
  let m;
  while ((m = re.exec(cleanStmt)) !== null) refs.add(m[1]);
  return [...refs];
}

function topoSort(tables) {
  const graph = new Map();
  const names = new Set(tables.keys());
  for (const [name, t] of tables) {
    const deps = t.refs.filter((r) => names.has(r) && r !== name);
    graph.set(name, deps);
  }

  const sorted = [];
  const state = new Map();
  const cycles = [];

  function dfs(node, path) {
    const s = state.get(node);
    if (s === 'done') return;
    if (s === 'visiting') {
      const cycleStart = path.indexOf(node);
      if (cycleStart !== -1) cycles.push(path.slice(cycleStart).concat(node));
      return;
    }
    state.set(node, 'visiting');
    for (const dep of graph.get(node) || []) {
      dfs(dep, [...path, node]);
    }
    state.set(node, 'done');
    sorted.push(node);
  }

  for (const n of [...names].sort()) dfs(n, []);

  const cycleMembers = new Set();
  for (const c of cycles) for (const n of c) cycleMembers.add(n);
  return { sorted, cycles, cycleMembers };
}

const FK_RE =
  /,?\s*CONSTRAINT\s+(\w+)\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+([A-Za-z_][\w.]*)\s*\(([^)]+)\)((?:\s+ON\s+(?:UPDATE|DELETE)\s+(?:CASCADE|RESTRICT|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION))*)/gi;

function extractAndStripFks(stmt, tableName) {
  const deferred = [];
  const stripped = stmt.replace(
    FK_RE,
    (_match, name, cols, refTbl, refCols, onClauses) => {
      deferred.push(
        `ALTER TABLE ${tableName} ADD CONSTRAINT ${name} FOREIGN KEY (${cols.trim()}) REFERENCES ${refTbl}(${refCols.trim()})${onClauses || ''};`,
      );
      return '';
    },
  );
  const cleaned = stripped.replace(/,(\s*)\)/g, '$1)');
  return { stmt: cleaned, deferred };
}

function formatSection(title, chunks) {
  if (chunks.length === 0) return '';
  return `\n-- === ${title} ===\n\n${chunks.join('\n\n')}\n`;
}

function formatStatement(raw, source) {
  const trimmed = raw.replace(/^\s+/, '').replace(/\s+$/, '');
  const ensureSemi = trimmed.endsWith(';') ? trimmed : `${trimmed};`;
  return `-- source: ${source}\n${ensureSemi}`;
}

async function main() {
  await rm(OUTPUT_FILE, { force: true });

  const files = await listSqlFiles(SCHEMAS_DIR);
  if (files.length === 0) {
    console.error(`No .sql files found under ${SCHEMAS_DIR}`);
    process.exit(1);
  }

  const buckets = {
    extensions: [],
    schemas: [],
    sequences: [],
    functions: [],
    indexes: [],
    triggers: [],
    comments: [],
    tail: [],
  };
  const tables = new Map();
  let totalStatements = 0;

  for (const file of files) {
    const rel = relative(REPO_ROOT, file);
    const sql = await readFile(file, 'utf8');
    const stmts = splitStatements(sql);
    for (const raw of stmts) {
      totalStatements++;
      const clean = stripComments(raw);
      const kind = classify(clean);
      const source = rel;
      if (kind === 'tables') {
        const name = extractTableName(clean);
        if (!name) {
          console.error(
            `WARN: CREATE TABLE at ${source} has no parseable name; routed to tail.`,
          );
          buckets.tail.push(formatStatement(raw, source));
          continue;
        }
        if (!name.includes('.')) {
          console.error(
            `WARN: unqualified table name "${name}" in ${source} — topo sort uses the bare name as a key.`,
          );
        }
        const refs = extractReferences(clean);
        tables.set(name, { raw, clean, source, refs });
      } else if (kind in buckets) {
        buckets[kind].push(formatStatement(raw, source));
      } else {
        buckets.tail.push(formatStatement(raw, source));
      }
    }
  }

  const { sorted, cycles, cycleMembers } = topoSort(tables);
  let deferredConstraints = [];

  if (cycleMembers.size > 0) {
    const cycleList = cycles
      .map((c) => c.join(' → '))
      .filter((v, i, a) => a.indexOf(v) === i)
      .join('; ');
    console.error(
      `WARN: FK cycle(s) detected — deferring constraints on ${cycleMembers.size} table(s): ${[
        ...cycleMembers,
      ].join(', ')}. Cycles: ${cycleList}`,
    );
    for (const name of cycleMembers) {
      const t = tables.get(name);
      const { stmt, deferred } = extractAndStripFks(t.raw, name);
      t.raw = stmt;
      deferredConstraints.push(
        ...deferred.map((s) => formatStatement(s, t.source)),
      );
    }
  }

  const sortedTableChunks = sorted.map((n) => {
    const t = tables.get(n);
    return formatStatement(t.raw, t.source);
  });

  let fkEdges = 0;
  for (const t of tables.values())
    fkEdges += t.refs.filter(
      (r) => tables.has(r) && r !== extractTableName(t.clean),
    ).length;

  const header = [
    '-- =====================================================',
    '-- AUTO-GENERATED: db-schemas/_combined.sql',
    `-- Generated at: ${new Date().toISOString()}`,
    '-- Source: scripts/build-schema.js',
    '-- DO NOT EDIT BY HAND. Regenerate with: node scripts/build-schema.js',
    cycleMembers.size > 0
      ? `-- WARNING: ${cycleMembers.size} table(s) had cyclic FKs; constraints deferred to ALTER TABLE.`
      : null,
    '-- =====================================================',
  ]
    .filter(Boolean)
    .join('\n');

  const outputParts = [
    header,
    formatSection('EXTENSIONS', buckets.extensions),
    formatSection('SCHEMAS', buckets.schemas),
    formatSection('SEQUENCES', buckets.sequences),
    formatSection('FUNCTIONS', buckets.functions),
    formatSection('TABLES', sortedTableChunks),
    formatSection('DEFERRED CONSTRAINTS', deferredConstraints),
    formatSection('INDEXES', buckets.indexes),
    formatSection('TRIGGERS', buckets.triggers),
    formatSection('COMMENTS', buckets.comments),
    formatSection('DML + PROCEDURAL + ALTER (file order)', buckets.tail),
  ];

  const finalSql = outputParts.filter(Boolean).join('\n') + '\n';
  await writeFile(OUTPUT_FILE, finalSql);

  const lineCount = finalSql.split('\n').length;
  console.log(
    `Processed ${files.length} files, ${totalStatements} statements ` +
      `(${tables.size} tables, ${fkEdges} FK edges, ${cycleMembers.size} cycles deferred) ` +
      `→ ${relative(REPO_ROOT, OUTPUT_FILE)} (${lineCount} lines)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
