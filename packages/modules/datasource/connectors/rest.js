import axios from 'axios';

import util from './util.js';

export default function connector(settings) {
  Object.assign(settings, util.findHostPort(settings));
  this.type = settings.type;
  this.name = settings.name;
  this.host =
    settings.host && !settings.host.includes('http://')
      ? `http://${settings.host}`
      : settings.host;
  this.port = settings.port;
  this.timeout = settings.timeout || 0;
  this.url = settings.url;
  this.urlPrefix = settings.urlprefix || '';
  this.requestedVersion = settings.reqversion || '';
  this.address = settings.url + this.urlPrefix;
  console.log(`${this.name} rest service has been ready`);
  this.axios = axios.create({
    baseURL: this.url + this.urlPrefix,
    timeout: this.timeout,
    headers: {
      common: {
        'accept-version': this.requestedVersion,
      },
    },
  });
  this.health = async function () {
    const isOnline = await this.axios
      .get('/online')
      .catch((err) => console.log(err));
    return util.health(this, isOnline);
  };
}
