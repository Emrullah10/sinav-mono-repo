import {
  getInsertScript,
  getUpdateScript,
  getReadScript,
  getDeleteScript,
} from '../query-builder/select.builder.js';

const readScript = (tableName, data, caller, readOptions = {}) => {
  const { selectColumns, joins, groupBy } = readOptions || {};
  const { script, parameters } = getReadScript(
    tableName,
    data,
    caller,
    selectColumns,
    joins,
    groupBy,
  );
  return { script, parameters };
};
const createScript = (tableName, data, caller, createOptions = {}) => {
  const { script, parameters } = getInsertScript(
    tableName,
    data,
    caller,
    createOptions,
  );
  return { script, parameters };
};
const updateScript = (tableName, data, caller, updateOptions = {}) => {
  const { script, parameters } = getUpdateScript(
    tableName,
    data,
    caller,
    updateOptions,
  );
  return { script, parameters };
};
const deleteScript = (tableName, data, caller, deleteOptions = {}) => {
  const { script, parameters } = getDeleteScript(
    tableName,
    data,
    caller,
    deleteOptions,
  );
  return { script, parameters };
};
export { createScript, updateScript, readScript, deleteScript };
