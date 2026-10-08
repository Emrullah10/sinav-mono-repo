import { Router } from 'express';
import swaggerUI from 'swagger-ui-express';
import appConfig from 'app-config';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

// requirePermission() emits `x-serviceDiscovery: [{ permissionList: '<code>' }]`; pull that code
// back out for the boot banner (empty string => the route requires no permission).
const permissionOf = (op) => {
  const sd = op && op['x-serviceDiscovery'];
  if (!Array.isArray(sd)) return '';
  const hit = sd.find((entry) => entry && entry.permissionList);
  return hit ? hit.permissionList : '';
};

// Flatten the OpenAPI `paths` object into a sorted, printable route list. `prefix` is the served
// mount (basePathPrefix + basePath) so each line shows the real URL path, not the definition-relative one.
const collectRoutes = (swaggerDocument, prefix) => {
  const paths = (swaggerDocument && swaggerDocument.paths) || {};
  const rows = [];
  for (const routePath of Object.keys(paths)) {
    const item = paths[routePath] || {};
    for (const method of Object.keys(item)) {
      if (!HTTP_METHODS.includes(method.toLowerCase())) continue;
      const op = item[method] || {};
      rows.push({
        method: method.toUpperCase(),
        path: `${prefix}${routePath}`,
        permission: permissionOf(op),
        internal: op['x-internal'] === true,
        name: op['x-functionName'] || op.summary || '',
      });
    }
  }
  return rows.sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
};

// On boot every service prints its Swagger URLs + full REST API surface (one line per operation),
// so the running endpoints and their required permission are visible in the startup logs.
const logApiSurface = (swaggerDocument) => {
  const baseUrl = appConfig.url || '';
  const prefix = `${appConfig.basePathPrefix || ''}${appConfig.basePath || ''}`;
  const uiUrl = `${baseUrl}/api/service/openapi-ui`;
  const jsonUrl = `${baseUrl}/api/service/new-structure-openapi`;
  const routes = collectRoutes(swaggerDocument, prefix);
  const rule = '─'.repeat(78);
  const methodW = routes.reduce((w, r) => Math.max(w, r.method.length), 6);

  const lines = [
    '',
    rule,
    `  ${appConfig.name}  ·  v${appConfig.version}  ·  REST API — ${routes.length} endpoints`,
    rule,
    `  Swagger UI    ${uiUrl}`,
    `  OpenAPI JSON  ${jsonUrl}`,
    rule,
  ];
  for (const r of routes) {
    const tag = r.internal ? '[internal]' : r.permission ? `[${r.permission}]` : '[public]';
    lines.push(`  ${r.method.padEnd(methodW)}  ${r.path}  ${tag}`);
  }
  lines.push(rule);
  // single console.log so the banner stays contiguous in the log stream
  console.log(lines.join('\n'));
};

export default function swaggerFactory(swaggerDocument) {
  logApiSurface(swaggerDocument);
  return Router()
    .get('/api/service/new-structure-openapi', (request, response) =>
      response.json(swaggerDocument),
    )
    .use('/api/service/openapi-ui', swaggerUI.serve, (req, res) => {
      const html = swaggerUI.generateHTML(swaggerDocument);
      res.send(html);
    });
}
