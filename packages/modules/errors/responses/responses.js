export const { Response, ResponseError, fixProperties } = {
  ResponseError: class ResponseError extends Error {
    constructor(error, req) {
      if (error && error.message) super(error.message);
      else if (typeof error == 'string' && error != 'undefined') super(error);
      else super('With out message');

      this.statusCode = 500;
      this.error = true;

      if (
        error &&
        error.isAxiosError &&
        error.response &&
        error.response.data &&
        error.response.data.message
      ) {
        this.message = error.response.data.message;
        this.stack = error.response.data.stack;
      }
      if (req && req.originalUrl) this.message += ` URL: ${req.originalUrl}`;
      this.tempMessage = this.message;
      this.tempStack = this.stack;
      delete this.message;
      delete this.stack;
    }
  },
  Response: class Response {
    constructor(message, data) {
      this.statusCode = 200;
      this.error = false;
      this.message = message || 'Success!';
      this.data = data || [];
    }
  },
  fixProperties: (that) => {
    that.name = that.constructor.name;
    that.message = that.tempMessage;
    delete that.tempMessage;
    delete that.tempStack;
  },
};
