import { createErrors } from './errors.js';
import { createValidators } from './validate.js';
import { createRepository } from './repository.js';
import { createController } from './controller.js';

const cache = new Map();

const notBound = async () => {
  throw new Error(
    'entity-factory: repository called without deps. ' +
      'Ensure the repository-impl thin file passes readScript/createScript/' +
      'updateScript/deleteScript/executeScript/convertObjectToCamelCase.',
  );
};

const stubRepository = () => ({
  read: notBound,
  update: notBound,
  create: notBound,
  upsert: notBound,
  delete: notBound,
});

export const defineEntity = (config) => {
  const { name, schema, deps = {} } = config;
  const key = `${name}:${schema.table.tableNameWithSchema}`;
  const existing = cache.get(key);
  const hasDeps = typeof deps.executeScript === 'function';

  if (existing) {
    if (hasDeps && !existing._depsBound) {
      const bound = createRepository(name, schema, deps);
      existing._state.repository = bound;
      existing.repository = bound;
      existing.repositoryImpl = bound;
      existing._depsBound = true;
    }
    return existing;
  }

  const errors = createErrors(name);
  const entity = createValidators(name, errors, schema);
  const state = {
    repository: hasDeps
      ? createRepository(name, schema, deps)
      : stubRepository(),
  };
  const useCase = {
    read: (data, caller, opts) => state.repository.read(data, caller, opts),
    upsert: (data, caller, opts) => state.repository.upsert(data, caller, opts),
    create: (data, caller, opts) => state.repository.create(data, caller, opts),
    update: (data, caller, opts) => state.repository.update(data, caller, opts),
    delete: (data, caller, opts) => state.repository.delete(data, caller, opts),
  };
  const columnsKey = Object.keys(schema).find((k) => k !== 'table');
  const sensitiveKeys = Object.values(schema[columnsKey] || {})
    .filter((c) => c?.sensitive === true)
    .map((c) => c.camelCase);
  // Denetim #75: org kapsamlı tablo mu? (query-builder'ın kapsam kolonu
  // tanımıyla aynı: excludeFromCallerScope olmayan *organizationId kolonu.)
  const orgScoped = Object.values(schema[columnsKey] || {}).some(
    (c) =>
      c?.excludeFromCallerScope !== true &&
      typeof c?.camelCase === 'string' &&
      c.camelCase.toLowerCase().endsWith('organizationid'),
  );
  const controller = createController(name, useCase, sensitiveKeys, { orgScoped });

  const result = {
    entity,
    errors,
    repository: state.repository,
    repositoryImpl: state.repository,
    useCase,
    controller,
    _depsBound: hasDeps,
    _state: state,
  };
  cache.set(key, result);
  return result;
};
