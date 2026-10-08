export class InfrastructureError extends Error {
  constructor(message, context) {
    super(message);
    this.name = 'InfrastructureError';
    this.context = context;
  }
}
