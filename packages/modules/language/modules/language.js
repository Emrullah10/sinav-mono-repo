import graphQuery from './graph-query.js';

const languageModule = ({ redisClient, redisGraphClient }) => {
  const graphCall = graphQuery(redisGraphClient);

  const getLanguageOfUser = async function (userId) {
    const languageOfUserArray = await graphCall(
      'MATCH (u:USER {userId: $userId}) return u.language as language',
      { userId: +userId },
    );
    if (Array.isArray(languageOfUserArray) && languageOfUserArray.length) {
      const [{ language: languageOfUser }] = languageOfUserArray;
      return languageOfUser;
    }
    return undefined;
  };
  const getLanguageOfTenant = async function (tenant) {
    const languageOfTenantArray = await graphCall(
      'MATCH (t:TENANT {name: $tenant}) return t.language as language',
      { tenant },
    );
    if (Array.isArray(languageOfTenantArray) && languageOfTenantArray.length) {
      const [{ language: languageOfTenant }] = languageOfTenantArray;
      return languageOfTenant;
    }
    return undefined;
  };
  const getTranslationFromRedis = (key, language, tenant) =>
    redisClient.client.hget(`translation:${tenant}:${language}`, key);

  const translationBase = async function ({ language, userId, tenant, key }) {
    if (!key) {
      throw new Error('TRANSLATION_KEY_MUST_BE_PROVIDED');
    }

    if (!redisGraphClient) {
      throw new Error('REDISGRAPH_CLIENT_UNDEFINED');
    }
    let result;
    if (language) {
      result = await getTranslationFromRedis(key, language, tenant);
    }

    if (userId) {
      const languageOfUser = await getLanguageOfUser(userId);
      if (languageOfUser) {
        result = await getTranslationFromRedis(key, languageOfUser, tenant);
      }
    }

    if (tenant) {
      const languageOfTenant = await getLanguageOfTenant(tenant);
      if (languageOfTenant) {
        result = await getTranslationFromRedis(key, languageOfTenant, tenant);
      }
    }
    return result;
  };

  const translateAsObject = async function ({ language, userId, tenant, key }) {
    const result = await translationBase({ language, userId, tenant, key });

    return {
      key,
      translation: result || `${key} (Not translated)`,
    };
  };

  const translate = async function ({ language, userId, tenant, key }) {
    const result = await translationBase({ language, userId, tenant, key });
    return result || key;
  };

  return {
    translateAsObject,
    translate,
    getLanguageOfUser,
    getLanguageOfTenant,
  };
};

export default languageModule;
