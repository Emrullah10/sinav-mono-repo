import { ResponseError, fixProperties } from './responses.js';

const init = {
  SqlCustomError: class SqlCustomError extends ResponseError {
    constructor(message) {
      super(message);
      fixProperties(this);
      this.statusCode = 600;
    }
  },
};

export default init;
