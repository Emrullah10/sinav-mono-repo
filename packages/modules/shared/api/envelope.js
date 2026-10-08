export const ok = (data = null) => ({ success: true, data });

export const err = (code, message, details) => ({
  success: false,
  error: {
    code,
    message,
    ...(details !== undefined ? { details } : {}),
  },
});
