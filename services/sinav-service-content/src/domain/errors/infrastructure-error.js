export class InfrastructureError extends Error {
  constructor(code, message, details) {
    super(message || code);
    this.name = 'InfrastructureError';
    this.code = code;
    this.details = details;
  }
}
export default InfrastructureError;
