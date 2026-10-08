import _ from 'lodash';
import datasources from 'app-datasource';

const executeScript = (
  script,
  parameters,
  dbName = 'coreAppDb',
  { conn } = {},
) =>
  conn
    ? conn.query(script, parameters)
    : datasources[dbName].query(script, parameters);

const toCamelCase = (str) => _.camelCase(str);
const toSnakeCase = (str) => _.snakeCase(str);
const toKebabCase = (str) => _.kebabCase(str);

function unZipArray(data) {
  if (data?.length != 2) return data;
  const [keys, values] = data;
  const result = [];
  for (const value of values) {
    const obj = {};
    for (const [index, key] of keys.entries()) {
      obj[key] = value[index];
    }
    result.push(obj);
  }
  return result;
}

const formatCurrency = (val) => {
  if (!val) return;
  let value = val;
  if (val[val.length - 1] == '.') {
    value = `${val.slice(0, -1)},`;
  }
  const cleanValue = value.toString().replace(/[^0-9,]/g, '');
  const parts = cleanValue.split(',');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (parts[1] && parts[1].length > 2) {
    parts[1] = parts[1].substring(0, 2);
  }
  return parts.join(',');
};

const fixCurrencyForDb = (value) => {
  if (!value) return;
  return value.toString().replaceAll('.', '').replaceAll(',', '.');
};

const fixFloatDotToComa = (value) => {
  if (!value) return;
  return value.toString().replaceAll('.', ',');
};

const safeJSONStringify = (obj) => {
  const replaceErrors = (key, value) => {
    if (value instanceof Error) {
      const error = {};
      Object.getOwnPropertyNames(value).forEach((valueKey) => {
        error[valueKey] = value[valueKey];
      });
      return error;
    }
    return value;
  };
  return JSON.stringify(obj, replaceErrors);
};

const safeJSONParse = (str) => {
  try {
    return JSON.parse(str);
  } catch (e) {
    return undefined;
  }
};

function wait(time) {
  return new Promise((res) => setTimeout(res, time));
}

function zipArray(data) {
  if (!Array.isArray(data) || !data.length) return data;
  return [Object.keys(data[0]), data.map((item) => Object.values(item))];
}

const objectFunctionRunner = async (obj, params) => {
  for (const rule of Object.keys(obj)) {
    if (typeof obj[rule] === 'function') {
      await obj[rule](params);
    }
  }
};

// Converts DB row keys (snake_case column names) to camelCase. Values are
// passed through untouched — JSONB / JSON / array values keep their original
// shape so app-controlled content (metadata, preferences, raw API responses)
// is not rewritten by the transport layer. For a top-level rows array the
// outer Array.isArray branch iterates once to camelCase each row's keys.
// The `prohibitedColumns` parameter is kept for signature compatibility but
// has no effect now that recursion is removed.
function convertObjectToCamelCase(obj, _prohibitedColumns = []) {
  if (Array.isArray(obj)) {
    return obj.map((o) => convertObjectToCamelCase(o));
  }
  const result = {};
  _.forEach(obj, (value, key) => {
    result[_.camelCase(key)] = value;
  });
  return result;
}

const utcNow = () => ` now() at time zone 'utc' `;

// O7 (2026-09-05) — GERCEK ISTEMCI IP'si, TEK KAYNAK.
//
// Gateway bunu `req.ip`ten (trust proxy cozumlu) yaziyor ve istemcinin
// gonderdigini once SILIYOR; hem kimlikli hem ANONIM/public isteklerde set
// edilir. Anonim istekte literal `'none'` gelir ve null'a cevrilmesi SART —
// cagiran `if (ip)` yaziyorsa `'none'` string'i truthy'dir ve sessizce yanlis
// dala girer (`'none'` sentinel tuzagi, bug-300 / bug-1604).
//
// ⚠️ `req.ip` KULLANMAYIN: gateway'in arkasindaki servislerin kendi express
// uygulamasinda `trust proxy` YOK, dolayisiyla `req.ip` her zaman gateway'in
// loopback adresidir (127.0.0.1). Bu, kart ekleme akisinda her seferinde
// "IP FARKLI" uyarisi bastiriyordu (bug-1989).
const clientIpFromHeaders = (headers) => {
  const raw = headers?.useraccountip || null;
  return raw && raw !== 'none' ? raw : null;
};

const getCaller = (headers, isPublic = false) => {
  // Gateway proxyReq.setHeader uses `userAccountId/userAccountTenantCode/
  // userAccountOrganizationId/userAccountRole/userAccountOrganizationType/
  // userAccountSessionId/userAccountPermissionList`.
  // Node lowercases header keys. The shorter `userid/tenantcode/organizationid`
  // names are kept as fallbacks for legacy/internal callers that haven't
  // migrated yet.
  const callerUserId = headers?.useraccountid || headers?.userid;
  const callerTenantCode =
    headers?.useraccounttenantcode || headers?.tenantcode;
  const callerOrganizationId =
    headers?.useraccountorganizationid || headers?.organizationid;
  const callerUserRole = headers?.useraccountrole || null;
  const callerOrganizationType = headers?.useraccountorganizationtype || null;
  const callerSessionId = headers?.useraccountsessionid || null;
  const callerIp = clientIpFromHeaders(headers);
  const callerPermissionList = (headers?.useraccountpermissionlist || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!callerUserId && !isPublic)
    throw new Error('Headers user id is undefined');
  return {
    callerUserId,
    callerTenantCode,
    callerOrganizationId,
    callerUserRole,
    callerOrganizationType,
    callerSessionId,
    callerIp,
    callerPermissionList,
  };
};

export {
  clientIpFromHeaders,
  toKebabCase,
  unZipArray,
  zipArray,
  formatCurrency,
  fixCurrencyForDb,
  fixFloatDotToComa,
  toCamelCase,
  toSnakeCase,
  safeJSONStringify,
  safeJSONParse,
  wait,
  convertObjectToCamelCase,
  objectFunctionRunner,
  utcNow,
  getCaller,
  datasources,
  executeScript,
};

// ── Virgülle ayrılmış alıcı listesi (env) ─────────────────────────────
//
// `"a@x.com, b@y.com"` → `['a@x.com','b@y.com']`. Boşluklar kırpılır, boş
// parçalar düşer.
//
// ⚠️ BURADA, çünkü İKİ servis aynı biçimi okuyor: identity'nin düşük SMS
// kredisi uyarısı (`SMS_CREDIT_ALERT_EMAILS`) ve notification'ın satış talebi
// bildirimi (`SALES_LEAD_ALERT_EMAILS`). İkinci bir kopya yazmak, birinde
// boşluk kırpılıp diğerinde kırpılmaması gibi sessiz farklar üretirdi — ve
// böyle bir fark ancak "e-posta neden o adrese gitmedi" diye bakılınca
// bulunurdu.
export const parseRecipientList = (raw) =>
  String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
