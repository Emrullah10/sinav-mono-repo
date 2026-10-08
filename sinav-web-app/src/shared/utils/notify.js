// notistack dışından (QueryCache) toast göstermek için küçük köprü; NotificationProvider doldurur.
let enqueue = null;
export const bindNotify = (fn) => {
  enqueue = fn;
};
export const notify = (message, variant = 'info', options = {}) => {
  if (enqueue) enqueue(message, { variant, ...options });
};
