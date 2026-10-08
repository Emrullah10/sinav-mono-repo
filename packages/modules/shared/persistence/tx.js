import datasources from 'app-datasource';

// withTransaction executes `fn(tx)` inside a pg transaction. `tx` is the
// postgre connector's transaction client exposing `query`, `commit`,
// `rollback`. `executeTransaction` handles commit/rollback automatically.
export const withTransaction = async (fn, { dbName = 'coreAppDb' } = {}) => {
  const db = datasources[dbName];
  if (!db?.executeTransaction) {
    throw new Error(`Datasource "${dbName}" missing executeTransaction`);
  }
  return db.executeTransaction((tx) => fn(tx));
};

// Fire a single query outside a transaction. Prefer the table-driven
// repository for entity CRUD; use rawQuery only for anonymous/bootstrap
// flows or joins that don't fit the generic query-builder.
export const rawQuery = (script, parameters = [], { dbName = 'coreAppDb' } = {}) => {
  const db = datasources[dbName];
  if (!db?.query) throw new Error(`Datasource "${dbName}" missing query`);
  return db.query(script, parameters);
};
