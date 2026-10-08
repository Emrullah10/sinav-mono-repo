const kafkaModule = ({ kafkaClient }) => {
  const languageKeyTypes = {
    application: 'application',
    user: 'user',
    custom: 'custom',
  };
  function getKafkaObject({ dictionary, domain, type, tenantCode }) {
    return {
      domain,
      topic_type: 'sys',
      object_type: 'dictionary',
      event_type: 'CREATE',
      created_at: new Date(),
      payload: {
        dictionary,
        type,
        tenantCode,
      },
    };
  }
  const sendDictionaryToKafka = async function ({
    dictionary,
    domain,
    type,
    tenantCode,
  }) {
    if (!languageKeyTypes[type])
      throw new Error(
        `${type} is Invalid type. Types can be => ${Object.keys(languageKeyTypes)}`,
      );

    const kafkaObject = getKafkaObject({
      dictionary,
      domain,
      type,
      tenantCode,
    });
    return kafkaClient['inv.sys.translation'].produce.sendMessage(kafkaObject);
  };
  return { sendDictionaryToKafka, languageKeyTypes };
};

export default kafkaModule;
