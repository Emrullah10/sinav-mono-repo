export class ApplicationError extends Error {
  constructor(message, context) {
    super(message);
    this.name = 'ApplicationError';
    this.context = context;
  }
}
