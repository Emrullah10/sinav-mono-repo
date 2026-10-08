import Postgre from './connectors/postgre.js';
import Redis from './connectors/redis.js';
import Rest from './connectors/rest.js';

// Immutable configuration
const datasourceTypes = Object.freeze({
  rest: 'rest',
  postgre: 'postgre',
  redis: 'redis',
});

const datasourcesStore = {};

/**
 * Creates a connector based on type
 * @param {Object} setting - Connector settings
 * @param {string} name - Connector name
 * @returns {Object} Connector instance
 */
const createConnector = async (setting, applicationName) => {
  if (!setting.type) {
    throw new Error(
      `${setting.name} Datasource Config Error. Config is ${JSON.stringify(setting)}`,
    );
  }
  switch (setting.type) {
    case datasourceTypes.postgre: {
      return Postgre(setting, applicationName);
    }
    case datasourceTypes.rest:
      return new Rest(setting);
    case datasourceTypes.redis: {
      const connector = Redis(setting);
      connector.client = connector.letsPool();
      return connector;
    }
    default:
      return null;
  }
};

/**
 * @name createDatasources
 * @summary Create datasources which are sending in the parameter.
 * @throws Throws an error if any error happens.
 * @param {object} datasourceConfig - datasources list
 * @param {string} name - application name
 * @return {object} Promise - resolving or rejecting
 */
export const createDatasources = async ({ datasourceConfig, name }) => {
  for (const setting of datasourceConfig) {
    let connector = await createConnector(setting, name);
    if (connector[setting.name]) connector = connector[setting.name];
    datasourcesStore[setting.name] = connector;
  }

  return datasourcesStore;
};

// Error handlers — a process left alive after an uncaught exception or an
// unhandled rejection is in an undefined state (leaked connections, half-applied
// transactions). Log the cause, then exit non-zero so the orchestrator restarts
// a clean process (fail-fast). Logging-only would suppress Node's own
// terminate-on-rejection default and let a broken process keep serving traffic.
if (typeof process !== 'undefined') {
  process.on('uncaughtException', (err) => {
    console.error('[datasource] uncaughtException — exiting', err);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[datasource] unhandledRejection — exiting', reason);
    process.exit(1);
  });
}

export default datasourcesStore;
