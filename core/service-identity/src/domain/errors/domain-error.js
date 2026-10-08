export class DomainError extends Error {
  constructor(message, context) {
    super(message);
    this.name = 'DomainError';
    this.context = context;
  }
}
