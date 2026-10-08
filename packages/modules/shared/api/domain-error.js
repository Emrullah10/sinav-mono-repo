import { ApiError } from './errors.js';

// (code, message, details, status). status verilmezse koddan türetilir; haritada yoksa 400.
export class DomainError extends Error {
  constructor(code, message, details, status) {
    super(message || code);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

const SUFFIX_STATUS = [
  [/_NOT_FOUND$/, 404],
  [/_FORBIDDEN$/, 403],
  [/_UNAUTHORIZED$|^AUTH_REQUIRED$/, 401],
  [/_QUOTA_EXCEEDED$|^QUOTA_EXCEEDED$|_LIMIT_REACHED$/, 402],
  [/_CONFLICT$|_ALREADY_|_EXISTS$|_TAKEN$|_NOT_(?:CONFIRMABLE|EDITABLE|SUBMITTABLE|ACTIVE|PENDING|OPEN|PAUSED|IN_PROGRESS)$|_SELF_APPROVAL$|_LOCKED$|_EXPIRED$|_FINISHED$|_CLOSED$/, 409],
  [/_RATE_LIMITED$|_TOO_MANY/, 429],
  [/_UNAVAILABLE$|_NOT_CONFIGURED$/, 503],
];

export const statusForCode = (code, explicit) => {
  if (explicit) return explicit;
  for (const [re, st] of SUFFIX_STATUS) if (re.test(code)) return st;
  return 400;
};

export const toApiError = (err) => {
  if (err instanceof DomainError) {
    return new ApiError(err.code, err.message, { statusCode: statusForCode(err.code, err.status), details: err.details });
  }
  return err;
};

// Use-case haritasını HTTP hata çevirisiyle sarar (container.js).
export const wrapWithHttpTranslation =
  (fn) =>
  async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      throw toApiError(err);
    }
  };
