import sharedSchemas from './_shared.openapi.js';
import { buildShard } from 'example-builder';
import tableDefs from '../src/infrastructure/persistence/schemas/table-definitions.js';

const components = { schemas: { ...sharedSchemas } };
const paths = {};

for (const schema of Object.values(tableDefs)) {
  if (!schema?.table) continue;
  const shard = buildShard(schema);
  Object.assign(components.schemas, shard.schemas);
  Object.assign(paths, shard.paths);
}

export default {
  openapi: '3.0.0',
  info: { title: 'REST API', version: '1.0.0', description: 'A dynamically generated API from the database schema.' },
  components,
  paths,
};
