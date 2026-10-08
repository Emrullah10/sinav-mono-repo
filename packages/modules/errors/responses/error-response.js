/* eslint-disable max-classes-per-file */
import { ResponseError, fixProperties } from './responses.js';

export default {
  NotFoundClientError: class NotFoundClientError extends ResponseError {
    constructor(error, req) {
      super(error, req);
      fixProperties(this);
      this.statusCode = 404;
    }
  },
  RemoteAPIServerError: class RemoteAPIServerError extends ResponseError {
    constructor(error, req) {
      super(error, req);
      fixProperties(this);
      this.statusCode = 503;
    }
  },
  UnAuthorizedClientError: class UnAuthorizedClientError extends ResponseError {
    constructor(error, req) {
      super(error, req);
      fixProperties(this);
      this.statusCode = 401;
    }
  },
  InternalServerError: class InternalServerError extends ResponseError {
    constructor(error, req) {
      super(error, req);
      fixProperties(this);
      this.statusCode = 500;
    }
  },
  BadRequestClientError: class BadRequestClientError extends ResponseError {
    constructor(error, req) {
      super(error, req);
      fixProperties(this);
      this.statusCode = 400;
    }
  },
  ConflictError: class ConflictError extends ResponseError {
    constructor(error, req) {
      super(error, req);
      fixProperties(this);
      this.statusCode = 409;
    }
  },
  ForbiddenError: class ForbiddenError extends ResponseError {
    constructor(error, req) {
      super(error, req);
      fixProperties(this);
      this.statusCode = 403;
    }
  },
  CsrfError: class CsrfError extends ResponseError {
    constructor(error, req) {
      super(error, req);
      fixProperties(this);
      this.statusCode = 418;
    }
  },
};
