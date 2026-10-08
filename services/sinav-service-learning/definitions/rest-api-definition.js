import coreDefinition from '../../../core/service-learning/definitions/rest-api-definition.js';
import endpoints from '../src/interfaces/http/endpoints.js';

export default {
  ...coreDefinition,
  components: {
    ...(coreDefinition.components || {}),
    schemas: { ...(coreDefinition.components?.schemas || {}), ...endpoints.schemas },
  },
  paths: { ...(coreDefinition.paths || {}), ...endpoints.paths },
};
