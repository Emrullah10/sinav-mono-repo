class DomainError extends Error {
  constructor(message, context) {
    super(message);
    this.name = 'DomainError';
    this.context = context;
  }
}

export const createErrors = (entityName) => {
  const Pascal = entityName[0].toUpperCase() + entityName.slice(1);
  const upper = entityName.toUpperCase();

  class NotFoundError extends DomainError {
    constructor(context) {
      super(`${upper}_NOT_FOUND`, context);
    }
  }
  Object.defineProperty(NotFoundError, 'name', {
    value: `${Pascal}NotFoundError`,
  });

  class ValidationError extends DomainError {
    constructor(context) {
      super(`${upper}_VALIDATION_ERROR`, context);
    }
  }
  Object.defineProperty(ValidationError, 'name', {
    value: `${Pascal}ValidationError`,
  });

  return {
    [`${Pascal}NotFoundError`]: NotFoundError,
    [`${Pascal}ValidationError`]: ValidationError,
  };
};
