import { getColumnName } from './index.js';

const createFilterClause = (key, index, filter) => {
  const columnName = getColumnName(key);
  return { operator: `${columnName}=$${index}`, parameter: filter };
};

const filterOperators = {
  equals: createFilterClause,
  notEqual: (key, index, filter) => {
    return {
      operator: `${getColumnName(key)}<>$${index}`,
      parameter: filter,
    };
  },
  contains: (key, index, filter) => {
    return {
      operator: `${getColumnName(key)} ILIKE $${index}`,
      parameter: '%' + filter + '%',
    };
  },
  notContains: (key, index, filter) => {
    return {
      operator: `${getColumnName(key)} NOT ILIKE  $${index}`,
      parameter: '%' + filter + '%',
    };
  },
  startsWith: (key, index, filter) => {
    return {
      operator: `${getColumnName(key)} ILIKE  $${index}`,
      parameter: filter + '%',
    };
  },
  endsWith: (key, index, filter) => {
    return {
      operator: `${getColumnName(key)} ILIKE  $${index}`,
      parameter: '%' + filter,
    };
  },
  blank: (key, index, filter) => {
    return {
      operator: `(${getColumnName(key)} IS NULL OR ${getColumnName(key)} = '')`,
      parameter: undefined,
    };
  },
  lessThan: (key, index, filter) => {
    return {
      operator: `${getColumnName(key)} < $${index}`,
      parameter: filter,
    };
  },
  lessThanOrEqual: (key, index, filter) => {
    return {
      operator: `${getColumnName(key)} <= $${index}`,
      parameter: filter,
    };
  },
  greaterThan: (key, index, filter) => {
    return {
      operator: `${getColumnName(key)} > $${index}`,
      parameter: filter,
    };
  },
  greaterThanOrEqual: (key, index, filter) => {
    return {
      operator: `${getColumnName(key)} >= $${index}`,
      parameter: filter,
    };
  },
  // M8 (2026-09-10) — coklu deger. `filter` bir DIZIDIR.
  //
  // ⚠️ Var olmayan bir `type` `buildFilterClauses`ta SESSIZCE DUSURULUR
  // (`if (!operatorFunction) return;`). Yani bu operator eklenmeden
  // `{ type: 'in' }` gonderen bir ekran, suzgeci HIC uygulanmamis bir liste
  // gorurdu — bos degil, FAZLA satir. Sessiz ve yanlis veri.
  //
  // `= ANY($n)`: PG parametre tipini kolondan cikarir, yani sabit bir
  // `::text[]` cast'i yazmaya (ve sayisal kolonlarda kirilmaya) gerek yok.
  // Bos dizide `parameter: undefined` donuyoruz — yukaridaki "dangling
  // placeholder" muhafizi clause'u atliyor ve $n sirasi kaymiyor.
  in: (key, index, filter) => {
    const values = Array.isArray(filter)
      ? filter.filter((v) => v !== undefined && v !== null && v !== '')
      : [];
    return {
      operator: `${getColumnName(key)} = ANY($${index})`,
      parameter: values.length ? values : undefined,
    };
  },
  inRange: createFilterClause,
  true: createFilterClause,
  false: createFilterClause,
  setFilter: createFilterClause,
  isNull: (key, index, filter) => {
    return {
      operator: `${getColumnName(key)} is null`,
      parameter: undefined,
    };
  },
  isNotNull: (key, index, filter) => {
    return {
      operator: `${getColumnName(key)} is not null`,
      parameter: undefined,
    };
  },
};

const buildFilterClauses = (filterModel, tableName) => {
  let index = 1;
  const filters = [];
  const parameters = [];

  Object.entries(filterModel).forEach(([key, filterConfig]) => {
    const { type, filter } = filterConfig || {};
    const operatorFunction = filterOperators[type];

    if (!operatorFunction) return;

    const { operator, parameter } = operatorFunction(key, index, filter);

    // Value-bearing operators (equals, contains, inRange, …) embed `$index` in
    // their clause. If the caller sent no `filter`, `parameter` is undefined and
    // pushing the clause would leave a dangling placeholder that desyncs every
    // subsequent `$n` (wrong rows or a PG "bind message supplies N parameters"
    // error). Skip such clauses. Value-less operators (blank/isNull/isNotNull)
    // carry no placeholder and are pushed without consuming an index.
    const usesPlaceholder = operator.includes(`$${index}`);
    if (usesPlaceholder && parameter === undefined) {
      return;
    }

    filters.push(operator);
    if (parameter !== undefined) {
      parameters.push(parameter);
      index++;
    }
  });

  return {
    whereClause: filters.length ? `WHERE ${filters.join(' AND ')}` : '',
    parameters,
  };
};

export { filterOperators, buildFilterClauses, createFilterClause };
