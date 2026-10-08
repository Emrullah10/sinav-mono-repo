import modules from './modules/index.js';
let { languageModule, kafkaModule } = modules;
function init({ kafkaClient, redisClient, redisGraphClient }) {
  if (!kafkaClient || !redisClient || !redisGraphClient) {
    throw new Error('kafkaClient, redisClient, redisGraphClient is undefined');
  }

  const { translateAsObject, translate } = languageModule({
    redisClient,
    redisGraphClient,
  });
  const { sendDictionaryToKafka, languageKeyTypes } = kafkaModule({
    kafkaClient,
  });

  return {
    translate,
    translateAsObject,
    sendDictionaryToKafka,
    languageKeyTypes,
  };
}

export default init;
