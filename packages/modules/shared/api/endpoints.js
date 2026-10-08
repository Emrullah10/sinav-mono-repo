import { wrap } from './wrap.js';
import { wrapInternal } from './wrap-internal.js';
import { requirePermission, requireInternal } from '../permissions.js';
import { ok } from './envelope.js';

// Deklaratif uç tanımı: tek listeden hem OpenAPI `paths` hem de Express route haritası üretilir
// (x-functionName uyuşmazlığı imkânsız). Ad: method + yol parçalarının PascalCase'i.
const pascal = (s) =>
  s
    .replace(/\{(\w+)\}/g, (_m, p) => `By${p[0].toUpperCase()}${p.slice(1)}`)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');

export const endpointName = (method, path) =>
  `${method}${pascal(path.replace(/^\/v\d+/, ''))}`;

const pathParamsOf = (path) =>
  [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
    in: 'path',
    name: m[1],
    required: true,
    schema: { type: 'string' },
  }));

const okResponse = {
  200: {
    description: 'OK',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/apiResponse' } } },
  },
};

export const baseSchemas = {
  apiResponse: {
    type: 'object',
    properties: { success: { type: 'boolean' }, data: {}, error: { type: 'object' } },
  },
  anyBody: { type: 'object', additionalProperties: true },
};

/**
 * @param {Array<{method:'get'|'post'|'put'|'patch'|'delete', path:string, handler:Function,
 *   permission?:string, isPublic?:boolean, internal?:boolean, body?:boolean, status?:number,
 *   summary?:string, tag?:string}>} list
 */
export const defineEndpoints = (list, { tag: defaultTag = 'API' } = {}) => {
  const paths = {};
  const routes = {};
  const seen = new Set();
  for (const e of list) {
    const method = e.method;
    const name = e.name || endpointName(method, e.path);
    if (seen.has(name)) throw new Error(`Duplicate endpoint name ${name}`);
    seen.add(name);
    if (!e.isPublic && !e.internal && !e.permission) {
      throw new Error(`Endpoint ${method} ${e.path} needs permission (use '*' for any authenticated)`);
    }
    const op = {
      summary: e.summary || name,
      'x-functionName': name,
      tags: [e.tag || defaultTag],
      ...(e.internal ? requireInternal() : {}),
      ...(e.permission ? requirePermission(e.permission) : {}),
      ...(e.body
        ? { requestBody: { required: false, content: { 'application/json': { schema: { $ref: '#/components/schemas/anyBody' } } } } }
        : {}),
      parameters: pathParamsOf(e.path),
      responses: okResponse,
    };
    paths[e.path] = { ...(paths[e.path] || {}), [method]: op };
    const opts = { isPublic: !!e.isPublic, successStatus: e.status || 200 };
    routes[name] = e.internal ? wrapInternal(e.handler, opts) : wrap(e.handler, opts);
  }
  return { paths, routes, schemas: baseSchemas };
};

export const okEnvelope = ok;
