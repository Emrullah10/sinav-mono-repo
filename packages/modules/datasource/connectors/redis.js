import Redis from 'ioredis';
import util from './util.js';

const redisDbNumbers = { default: 0, dataChange: 1 };
export default (settings) => {
  const obj = {};
  const config = { ...settings, ...util.findHostPort(settings) };
  obj.name = config.name;
  obj.type = config.type;
  obj.mode = config.mode;
  if (config.dbName) {
    if (redisDbNumbers[config.dbName] === undefined) {
      throw new Error(`Invalid Redis Db Name: ${config.dbName}`);
    }
    config.db = redisDbNumbers[config.dbName];
  }

  const params = util.createRedisParameters(config);
  const retryStrategy = {
    retryStrategy(times) {
      const delay = Math.min(times * 1000, 15000);
      console.log('Redis Retry X', times, ',Delay ms:', delay);
      return delay;
    },
  };
  obj.redisClient = new Redis({ ...params, ...retryStrategy });
  obj.redisClient.on('connect', () => {
    console.log(`Connected to ${config.name} Redis`);
  });
  obj.redisClient.on('error', (err) => {
    console.error(`${config.name} Redis Connection Failed!`, err);
  });
  obj.health = async function () {
    return util.health(obj, (await obj.redisClient.status) === 'ready');
  };
  obj.letsPool = function () {
    return obj.redisClient;
  };
  return obj;
};
