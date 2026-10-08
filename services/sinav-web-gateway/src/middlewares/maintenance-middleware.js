import datasources from 'app-datasource';

// `gateway:maintenance` = JSON {until, messageKey}. 5 sn süreç içi önbellek; Redis yoksa fail-open.
let cache = { at: 0, value: null };
const read = async () => {
  if (Date.now() - cache.at < 5000) return cache.value;
  let value = null;
  try {
    const raw = await datasources.serviceDiscoveryRedis.client.get('gateway:maintenance');
    value = raw ? JSON.parse(raw) : null;
  } catch {
    value = null;
  }
  cache = { at: Date.now(), value };
  return value;
};

export default () => async (req, res, next) => {
  if (req.originalUrl === '/health' || req.originalUrl === '/test' || req.method === 'OPTIONS') return next();
  const m = await read();
  if (!m) return next();
  return res.status(503).json({
    success: false,
    error: { code: 'MAINTENANCE', message: 'MAINTENANCE', details: { until: m.until || null, messageKey: m.messageKey || null } },
  });
};
