export default {
  health: (connector, isOnline) => ({
    isOnline: !!isOnline,
    name: `${connector.name}`,
    type: `${connector.type}`,
  }),
  findHostPort: (settings) => {
    if (settings.mode === 'sentinel' || settings.type === 'rest') {
      return {};
    }
    let hostPort = settings.url.split('//');
    if (hostPort.length !== 2) {
      console.log(
        `${settings.name} Datasource Config Host Error. Url is ${settings.url}`,
      );
      throw new Error(
        `${settings.name} Datasource Config Host Error. Url is ${settings.url}`,
      );
    }
    hostPort = hostPort[1].split(':');
    if (hostPort.length !== 2) {
      console.log(
        `${settings.name} Datasource Config Host Error. Url is ${settings.url}`,
      );
      throw new Error(
        `${settings.name} Datasource Config Host Error. Url is ${settings.url}`,
      );
    }
    if (!settings.port && Number(hostPort[1]) > 0) {
      return { host: hostPort[0], server: hostPort[0], port: hostPort[1] };
    }
    return { host: hostPort[0], server: hostPort[0] };
  },
  createRedisParameters: (redisSettings) => {
    if (!redisSettings.password) {
      delete redisSettings.password;
    }
    if (!redisSettings.mode) {
      return redisSettings;
    }
    let parameters = {};
    switch (redisSettings.mode) {
      case 'single':
        parameters = redisSettings;
        break;
      case 'sentinel':
        parameters.name = redisSettings.mastername;
        if (redisSettings.password) {
          parameters.sentinelPassword = redisSettings.password;
          parameters.password = redisSettings.password;
        }
        parameters.sentinels = [];
        redisSettings.url.split(',').forEach((sentinelUrl) => {
          const hostPort = sentinelUrl.split(':');
          const { length } = hostPort;
          const sentinel = { host: '', port: -1 };
          for (let index = 0; index < length; index += 1) {
            const element = hostPort[index];
            if (index === length - 1) {
              if (isNaN(element)) {
                throw new Error(
                  `${redisSettings.name} Redis Sentinel Connection Failed! Wrong Url `,
                );
              }
              sentinel.port = element;
              break;
            }
            sentinel.host += element;
          }
          if (sentinel.host.includes('//')) {
            sentinel.host = sentinel.host.split('//')[1];
          }
          parameters.sentinels.push(sentinel);
        });
        break;
      case 'cluster':
        parameters = redisSettings;
        break;
      default:
        parameters = redisSettings;
    }
    if (redisSettings.url) {
      delete redisSettings.url;
    }
    return parameters;
  },
  safeJsonParse: (data) => {
    try {
      return JSON.parse(data);
    } catch (error) {
      return undefined;
    }
  },
};
