import { defineEntity } from 'entity-factory';
import { readScript, createScript, updateScript, deleteScript } from 'persistence-utils';
import tableDefs from '../infrastructure/persistence/schemas/table-definitions.js';
import { executeScript, convertObjectToCamelCase } from 'app-shared';

const deps = { readScript, createScript, updateScript, deleteScript, executeScript, convertObjectToCamelCase };

const domain = {};
for (const [name, schema] of Object.entries(tableDefs)) {
  if (!schema?.table) continue;
  domain[name] = defineEntity({ name, schema, deps });
}

export default domain;
