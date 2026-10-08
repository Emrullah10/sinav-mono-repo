export const createRepository = (entityName, schema, deps) => {
  const {
    readScript,
    createScript,
    updateScript,
    deleteScript,
    executeScript,
    convertObjectToCamelCase,
  } = deps;

  const columnsKey = Object.keys(schema).find((k) => k !== 'table');
  const columns = schema[columnsKey];
  const identityKey = Object.entries(columns).find(
    ([, c]) => c.isIdentity,
  )?.[0];
  const prohibitedColumns = [];
  const upper = entityName.toUpperCase();

  const runList = async (
    verb,
    scriptFn,
    data,
    caller,
    allowEmpty,
    { conn, readOptions, createOptions, updateOptions, deleteOptions } = {},
  ) => {
    const verbOptions =
      verb === 'READ' ? readOptions
      : verb === 'CREATE' ? createOptions
      : verb === 'UPDATE' ? updateOptions
      : verb === 'DELETE' ? deleteOptions
      : undefined;
    const { script, parameters } = scriptFn(entityName, data, caller, verbOptions);
    if (!script) throw new Error(`${upper}_${verb}_SCRIPT_BROKEN`);
    const { rows: array } = await executeScript(script, parameters, undefined, { conn });
    if (!Array.isArray(array)) return null;
    if (!allowEmpty && array.length === 0) return undefined;
    return convertObjectToCamelCase(array, prohibitedColumns);
  };

  const read = (data, caller, opts) =>
    runList('READ', readScript, data, caller, true, opts);
  const update = (data, caller, opts) =>
    runList('UPDATE', updateScript, data, caller, false, opts);
  const create = (data, caller, opts) =>
    runList('CREATE', createScript, data, caller, false, opts);
  const del = (data, caller, opts) =>
    runList('DELETE', deleteScript, data, caller, false, opts);

  const upsert = async (data, caller, opts) => {
    if (identityKey && data[identityKey]) return update(data, caller, opts);
    return create(data, caller, opts);
  };

  return { read, update, create, upsert, delete: del };
};
