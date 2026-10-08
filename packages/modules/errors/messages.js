export default {
  MAPPING_START: '[INIT]: started mapping the routes.',
  MAPPING_FINISH: '[INIT]: finished mapping the routes.',
  DATA_LOADING_START: '[INIT]: started loading global data.',
  DATA_LOADING_FINISH: '[INIT]: finished loading global data.',
  API_GATEWAY_READY: `[INIT]: API gateway is ready and running on ${global && global.config ? global.config.port : '-'} port.`,
  SERVICE_UNAVAILABLE: ' - The service is unavailable.',
  URL_NOTFOUND: 'The url is not found.',
  getName() {
    console.log(this.URL_NOTFOUND);
  },
};
