import { DomainError } from 'app-shared';

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const round1 = (n) => Math.round(n * 10) / 10;
export const round2 = (n) => Math.round(n * 100) / 100;
export const round3 = (n) => Math.round(n * 1000) / 1000;
export const num = (v) => (v === null || v === undefined ? null : Number(v));
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuidOrNull = (v) => (typeof v === 'string' && UUID_RE.test(v) ? v.toLowerCase() : null);
export const codeParam = (v, name = 'code') => {
  if (!/^\d{1,18}$/.test(String(v ?? ''))) throw new DomainError('VALIDATION_ERROR', `${name} is invalid`, { field: name }, 400);
  return Number(v);
};
export const intParam = (v, { min = 1, max = 1_000_000, name = 'value' } = {}) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new DomainError('VALIDATION_ERROR', `${name} is invalid`, { field: name, min, max }, 400);
  return n;
};
export const iso = (d) => (d ? new Date(d).toISOString() : null);
export const pickDefined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
export const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};
export const shuffle = (arr, rnd = Math.random) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);
export const preview = (text, n = 140) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** İstemci idempotency anahtarı: yoksa null, varsa UUID olmalı. */
export const clientRefParam = (v, name = 'clientRef') => {
  if (v === undefined || v === null || v === '') return null;
  const u = uuidOrNull(v);
  if (!u) throw new DomainError('VALIDATION_ERROR', `${name} must be a UUID`, { field: name }, 400);
  return u;
};
