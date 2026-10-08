const screamingSnake = (camel) =>
  camel
    .replace(/([A-Z])/g, '_$1')
    .replace(/^_/, '')
    .toUpperCase();

const isExcluded = (k) => {
  const lc = k.toLowerCase();
  return (
    lc.includes('created') ||
    lc.includes('updated') ||
    lc.endsWith('tenantcode') ||
    lc.endsWith('organizationid')
  );
};

export const createValidators = (entityName, errors, schema) => {
  const columnsKey = Object.keys(schema).find((k) => k !== 'table');
  const columns = schema[columnsKey];
  const Pascal = entityName[0].toUpperCase() + entityName.slice(1);
  const ValidationError = errors[`${Pascal}ValidationError`];
  const NotFoundError = errors[`${Pascal}NotFoundError`];

  const required = Object.entries(columns)
    .filter(([k, c]) => !c.isIdentity && !c.isNullable && !isExcluded(k))
    .map(([k]) => k);

  const isActiveKey = `${entityName}IsActive`;
  const hasIsActive = Object.prototype.hasOwnProperty.call(
    columns,
    isActiveKey,
  );

  const validate = (data) => {
    if (!data) throw new ValidationError('DATA_REQUIRED');
    for (const f of required) {
      if (data[f] === undefined || data[f] === null) {
        throw new ValidationError(`${screamingSnake(f)}_REQUIRED`);
      }
    }
    return data;
  };

  const validateUpsertResult = (upsertResult) => {
    if (!Array.isArray(upsertResult) || upsertResult.length === 0) {
      throw new NotFoundError();
    }
    return upsertResult[0];
  };

  const isDeactivation = (data) => hasIsActive && data[isActiveKey] === false;

  return { validate, validateUpsertResult, isDeactivation };
};
