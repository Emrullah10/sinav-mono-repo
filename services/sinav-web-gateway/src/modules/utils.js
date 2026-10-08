import _ from 'lodash';
import { error as constants } from '../constants/index.js';

const safeJSONStringify = (obj) => {
  const replaceErrors = (key, value) => {
    if (value instanceof Error) {
      const error = {};
      Object.getOwnPropertyNames(value).forEach((valueKey) => {
        error[valueKey] = value[valueKey];
      });
      return error;
    }
    return value;
  };
  return JSON.stringify(obj, replaceErrors);
};

const safeJSONParse = (str) => {
  let data;
  try {
    data = JSON.parse(str);
  } catch (e) {
    data = undefined;
  }
  return data;
};

const objectFunctionRunner = async (obj, params) => {
  const objKeys = Object.keys(obj);
  for (let index = 0; index < objKeys.length; index += 1) {
    const rule = objKeys[index];
    if (typeof obj[rule] === 'function') {
      await obj[rule](params);
    }
  }
};

function convertObjectToCamelCase(obj, prohibitedColumns = []) {
  if (Array.isArray(obj)) {
    let result = [];
    for (const o of obj) {
      result.push(convertObjectToCamelCase(o, prohibitedColumns)); // Recursive çağrının sonucu push edilmeli
    }
    return result; // Array için erken dönüş
  }
  let result = {};

  _.forEach(obj, (value, key) => {
    if (
      !prohibitedColumns.includes(key) &&
      (_.isPlainObject(value) || _.isArray(value))
    ) {
      value = convertObjectToCamelCase(value, prohibitedColumns);
    }
    result[_.camelCase(key)] = value;
  });

  return result;
}
function prepareDynamicWhere({ whereObject, prefixObject }) {
  if (!(whereObject instanceof Object)) {
    throw new Error(constants.INVALID_INPUT_TYPE);
  }

  if (!(prefixObject instanceof Object)) {
    throw new Error(constants.INVALID_INPUT_TYPE);
  }

  const parameters = [];
  let parameterIndex = 1;
  const whereColumns = Object.keys(whereObject);
  const whereScripts = Array(whereColumns.length);
  for (let i = 0, n = whereColumns.length; i < n; i += 1) {
    parameterIndex += 1;
    const currentPrefix = prefixObject[whereColumns[i]]
      ? `${prefixObject[whereColumns[i]]}.`
      : '';
    whereScripts[i] =
      `${currentPrefix}${_.snakeCase(whereColumns[i])} = $${parameterIndex}`;
    parameters.push(whereObject[whereColumns[i]]);
  }
  const script = whereObject.length
    ? ` where ${whereScripts.join(' and ')}`
    : '';
  return { script, parameters };
}

function prepareDynamicWhereGraph({ whereObject, prefixObject }) {
  if (!(whereObject instanceof Object)) {
    throw new Error(constants.INVALID_INPUT_TYPE);
  }

  if (!(prefixObject instanceof Object)) {
    throw new Error(constants.INVALID_INPUT_TYPE);
  }

  const whereColumns = Object.keys(whereObject);
  const whereScripts = Array(whereColumns.length);
  for (let i = 0, n = whereColumns.length; i < n; i += 1) {
    const currentPrefix = prefixObject[whereColumns[i]]
      ? `${prefixObject[whereColumns[i]]}.`
      : '';
    whereScripts[i] =
      `${currentPrefix}${whereColumns[i]} = $${whereColumns[i]}`;
  }
  const script = whereScripts.length
    ? ` where ${whereScripts.join(' and ')}`
    : '';
  return script;
}

function formatHierarchyTree(rawResult) {
  const unitObjectForSearch = {};
  const unitObjectForSort = [];
  while (rawResult.hasNext()) {
    // eslint-disable-next-line no-underscore-dangle
    const pureItem = rawResult.next()._values;
    const item = pureItem[0];
    // eslint-disable-next-line prefer-destructuring
    item.children = pureItem[1];
    unitObjectForSearch[item.id] = item;
    unitObjectForSort.push(item);
  }

  const sortedUnitObject = unitObjectForSort.sort(
    (a, b) => a.children.length - b.children.length,
  );

  const returnObject = structuredClone(unitObjectForSearch);

  for (let i = 0, n = sortedUnitObject.length; i < n; i += 1) {
    const item = sortedUnitObject[i];
    if (item.children.length) {
      item.children.forEach((child, index) => {
        returnObject[item.id].children[index] = unitObjectForSearch[child];
        unitObjectForSearch[item.id].children[index] =
          unitObjectForSearch[child];
        delete returnObject[child];
      });
    }
  }
  return Object.keys(returnObject).map((item) => returnObject[item]);
}

function formatNodes(rawResult) {
  const extractedResults = [];
  while (rawResult.hasNext()) {
    // eslint-disable-next-line no-underscore-dangle
    const item = rawResult.next()._values[0];
    extractedResults.push(item);
  }
  return extractedResults;
}

class QueryBuilder {
  #tableName;

  #script;

  #isBase;

  #parameterIndex = 0;

  #parameters = [];

  #isInsert = false;

  #isUpdate = false;

  constructor({ tableName, tenant }) {
    if (!tenant) {
      throw new Error(constants.UNKNOWN_TENANT_ERROR);
    }
    this.#tableName = `${tenant}.${tableName}`;
    this.#script = '';
    this.#isBase = false;
  }

  select(...inputColumns) {
    let columns = inputColumns;
    this.#checkArray(columns);
    this.#checkIfBasePrepared();

    if (columns.includes('*')) {
      columns = ['*'];
    } else {
      columns = columns.map(_.snakeCase);
    }

    const columnsAsString = columns.join(', ');

    this.#script = `select ${columnsAsString} from ${this.#tableName}`;
    this.#isBase = true;
    return this;
  }

  insert(insertParams) {
    this.#checkObject(insertParams);
    this.#checkIfBasePrepared();

    const insertIntoColumns = Object.keys(insertParams);
    const insertScript = [];
    for (let i = 0, n = insertIntoColumns.length; i < n; i += 1) {
      this.#parameterIndex += 1;
      insertScript[i] = `$${this.#parameterIndex}`;
      this.#parameters.push(insertParams[insertIntoColumns[i]]);
    }
    this.#script = `insert into ${this.#tableName} (${insertIntoColumns.map((column) => _.snakeCase(column)).join(', ')}) values (${insertScript.join(', ')})`;
    this.#isBase = true;
    this.#isInsert = true;
    return this;
  }

  update(updateParams) {
    this.#checkObject(updateParams);
    this.#checkIfBasePrepared();

    const updateColumns = Object.keys(updateParams);
    const setScripts = Array(updateColumns.length);
    for (let i = 0, n = updateColumns.length; i < n; i += 1) {
      this.#parameterIndex += 1;
      setScripts[i] = `${updateColumns[i]} = $${this.#parameterIndex}`;
      this.#parameters.push(updateParams[updateColumns[i]]);
    }
    this.#script = `update ${this.#tableName} set ${setScripts.join(', ')}`;
    this.#isBase = true;
    this.#isUpdate = true;
    return this;
  }

  where(whereParams) {
    this.#checkObject(whereParams);

    const whereColumns = Object.keys(whereParams);
    const whereScripts = Array(whereColumns.length);
    for (let i = 0, n = whereColumns.length; i < n; i += 1) {
      this.#parameterIndex += 1;
      whereScripts[i] =
        `${_.snakeCase(whereColumns[i])} = $${this.#parameterIndex}`;
      this.#parameters.push(whereParams[whereColumns[i]]);
    }
    this.#script += ` where ${whereScripts.join(' and ')}`;
    return this;
  }

  returning(...inputColumns) {
    let columns = inputColumns;
    this.#checkArray(columns);
    this.#checkIfReturningEligible();

    if (columns.includes('*')) {
      columns = ['*'];
    }

    const columnsAsString = columns.join(', ');

    this.#script += ` returning ${columnsAsString}`;
    return this;
  }

  done() {
    this.#script += ';';
    return { script: this.#script, parameters: this.#parameters };
  }

  // eslint-disable-next-line class-methods-use-this
  #checkObject(inputObject) {
    if (!(inputObject instanceof Object)) {
      throw new Error(constants.INVALID_INPUT_TYPE);
    }
  }

  // eslint-disable-next-line class-methods-use-this
  #checkArray(inputArray) {
    if (!Array.isArray(inputArray)) {
      throw new Error(constants.INVALID_INPUT_TYPE);
    }
  }

  #checkIfBasePrepared() {
    if (this.#isBase) {
      throw new Error(constants.BASE_SCRIPT_EXISTS);
    }
  }

  #checkIfReturningEligible() {
    if (!this.#isInsert && !this.#isUpdate) {
      throw new Error(constants.RETURNING_FORBIDDEN);
    }
  }
}

export {
  safeJSONParse,
  safeJSONStringify,
  objectFunctionRunner,
  QueryBuilder,
  convertObjectToCamelCase,
  prepareDynamicWhere,
  prepareDynamicWhereGraph,
  formatHierarchyTree,
  formatNodes,
};
