import { Response } from './responses.js';

export default {
  OkSuccessfulResponse: class OkSuccessfulResponse extends Response {
    constructor(message, data) {
      super(message, data);
    }
  },
};
