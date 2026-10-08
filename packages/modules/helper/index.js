import fs from 'fs';
import dotenv from 'dotenv';
import { internalHeader } from './internals/index.js';
import log from './log/index.js';

const application = {};
global.logMode = log.logModes.quite;

application.exitOnError = (error) => {
  log.error(error);
};
application.overrideConfiguration = () => {
  if (
    (process.env.NODE_ENV || process.env.Node_Env || 'development') ==
    'development'
  ) {
    try {
      const envConfig = dotenv.parse(fs.readFileSync('.env'));
      for (const key in envConfig) {
        process.env[key] = envConfig[key];
      }
    } catch (error) {
      log.error(error);
    }
  }
};
application.appStarted = (config) => {
  console.log(
    `${config.name} service is listening on ${config.port}, version ${config.version}`,
  );
};
application.getAppPort = (url) => {
  const splittedUrl = url.split(':');
  return splittedUrl.pop();
};

application.getInternalHeader = internalHeader;

process.on('uncaughtException', (error) => {
  log.error('whoops! there was an uncaughtException error');
  application.exitOnError(error);
});
process.on('unhandledRejection', (error) => {
  log.error('whoops! there was an unhandledRejection error');
  application.exitOnError(error);
});

export default {
  application,
  log,
};
