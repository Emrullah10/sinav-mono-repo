import {
  getTableObject,
  getColumnName,
  getIdentityColumnCC,
  getIdentityColumn,
  getCreatedColumns,
  getDefaultCreatedColumns,
  getDefaultUpdatedColumns,
  getDefaultTenantAndOrganizationColumns,
  processColumnValues,
} from './index.js';
import { buildFilterClauses } from './where.builder.js';
import { buildSort } from './sort.builder.js';
import { buildPagination } from './pagination.builder.js';

const getReadScript = (
  tableName,
  data,
  caller,
  selectColumns = '*',
  joins = '',
  groupBy = '',
) => {
  const tableObject = getTableObject(tableName);
  const tableNameWithSchema = tableObject.table.tableNameWithSchema;
  const { startRow, endRow, sortModel = [], filterModel = {} } = data || {};
  let defaultColumns = getDefaultTenantAndOrganizationColumns(
    tableName,
    caller,
  );
  Object.entries(defaultColumns).forEach(([key, value]) => {
    filterModel[key] = { type: 'equals', filter: value };
  });
  const { whereClause, parameters } = buildFilterClauses(
    filterModel,
    tableName,
  );
  const orderByScript = buildSort(sortModel);
  const limitScript = buildPagination(startRow, endRow);
  const script = `SELECT ${selectColumns} FROM ${tableNameWithSchema} ${joins} ${whereClause} ${groupBy} ${orderByScript} ${limitScript}`;
  return { script, parameters };
};

const getInsertScript = (tableName, data, caller, createOptions) => {
  if (!data) {
    throw new Error(`DATA_NOT_CORRECT_ON_${tableName.toUpperCase()}_INSERT`);
  }
  let tableObject = getTableObject(tableName);
  let tableNameWithSchema = tableObject.table.tableNameWithSchema;
  let identityColumnCC = getIdentityColumnCC(tableName);

  let defaultColumns = {
    ...getDefaultTenantAndOrganizationColumns(tableName, caller),
    ...getDefaultCreatedColumns(tableName, caller),
    ...getDefaultUpdatedColumns(tableName, caller),
  };

  const filteredColumns = Object.keys({ ...data, ...defaultColumns }).filter(
    (key) => key !== identityColumnCC,
  );

  const { parameters, columnNames, placeholders } = processColumnValues(
    filteredColumns,
    data,
    defaultColumns,
  );

  const onConflictClause = createOptions?.onConflict
    ? ` ${createOptions.onConflict.trim()}`
    : '';
  const returning = String(createOptions?.returning ?? '').trim() || '*';
  const script = `INSERT INTO ${tableNameWithSchema} (${columnNames.join(',')}) VALUES (${placeholders.join(',')})${onConflictClause} RETURNING ${returning};`;
  return { script, parameters };
};

const getUpdateScript = (tableName, data, caller, updateOptions) => {
  let tableObject = getTableObject(tableName);
  let tableNameWithSchema = tableObject.table.tableNameWithSchema;
  let identityColumn = getIdentityColumn(tableName);
  let identityColumnCC = getIdentityColumnCC(tableName);
  if (!data[identityColumnCC]) {
    throw new Error(`DATA_NOT_CORRECT_ON_${tableName.toUpperCase()}_UPDATE`);
  }
  const parameters = [data[identityColumnCC]];
  let index = parameters.length;
  let notUpdatedColumns = [...getCreatedColumns(tableName)];
  let defaultColumns = {
    ...getDefaultTenantAndOrganizationColumns(tableName, caller),
    ...getDefaultUpdatedColumns(tableName, caller),
  };
  let allParameters = { ...data, ...defaultColumns };
  let columnUpdates = [];
  let filteredColumns = Object.keys(allParameters).filter(
    (key) =>
      ![identityColumnCC].includes(key) && !notUpdatedColumns.includes(key),
  );
  filteredColumns.forEach((key) => {
    let value = allParameters[key];
    let originalColumnName = getColumnName(key);
    if (typeof value === 'function') {
      columnUpdates.push(`${originalColumnName}=${value()}`);
    } else {
      index += 1;
      columnUpdates.push(`${originalColumnName}=$${index}`);
      parameters.push(value);
    }
  });

  const returning = String(updateOptions?.returning ?? '').trim() || '*';
  let script = `UPDATE ${tableNameWithSchema} SET ${columnUpdates.join(',')} WHERE ${identityColumn}=$1 RETURNING ${returning};`;

  return { parameters, script };
};

const getDeleteScript = (tableName, data, caller, deleteOptions) => {
  const tableObject = getTableObject(tableName);
  const tableNameWithSchema = tableObject.table.tableNameWithSchema;
  const { filterModel = {} } = data || {};
  let defaultColumns = getDefaultTenantAndOrganizationColumns(
    tableName,
    caller,
  );
  Object.entries(defaultColumns).forEach(([key, value]) => {
    filterModel[key] = { type: 'equals', filter: value };
  });
  const { whereClause, parameters } = buildFilterClauses(
    filterModel,
    tableName,
  );

  const returning = String(deleteOptions?.returning ?? '').trim() || '*';
  const script = `delete FROM ${tableNameWithSchema} ${whereClause} returning ${returning}; `;
  return { script, parameters };
};

export {
  getReadScript,
  getInsertScript,
  getUpdateScript,
  getDeleteScript,
  getTableObject,
};
