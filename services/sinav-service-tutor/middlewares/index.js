import sharedFactory from 'app-middlewares';

export default (config, serviceDiscovery, openApi) => [...sharedFactory(config, serviceDiscovery, openApi)];
