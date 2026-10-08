import { forbidden, unauthorized } from '../api/errors.js';

// ⚠️ `'none'` BİR KULLANICI DEĞİL, SENTİNEL'DİR (O4, güvenlik denetimi
// 2026-09-05). Gateway anonim isteklerde yedi kimlik header'ını literal
// `'none'` string'ine sabitliyor (http-proxy-middleware.js) ve query-builder
// bunu "kapsam filtresi uygulama" işareti olarak okuyor. Truthy olduğu için
// buradaki kontrol onu KİMLİKLİ SAYIYORDU: yalnız bu guard ile korunan bir
// use-case public path listesine eklendiği gün anonim çağıran içeri girerdi.
// (docs/sevkiyat-disi-devir-notu.md bu tuzağı zaten işaretlemişti.)
const ANONYMOUS_SENTINEL = 'none';

const isAnonymousCaller = (caller) =>
  !caller?.callerUserId || String(caller.callerUserId) === ANONYMOUS_SENTINEL;

const requireAuthenticatedCaller = (caller) => {
  if (isAnonymousCaller(caller)) {
    throw unauthorized('UNAUTHENTICATED', 'Caller authentication required');
  }
};

const requireCallerPermission = (caller, code) => {
  requireAuthenticatedCaller(caller);
  const list = Array.isArray(caller?.callerPermissionList)
    ? caller.callerPermissionList
    : [];
  if (!list.includes(code)) {
    throw forbidden('PERMISSION_DENIED', `Required permission: ${code}`, {
      required: code,
    });
  }
};

const requireAnyCallerPermission = (caller, codes) => {
  requireAuthenticatedCaller(caller);
  const list = Array.isArray(caller?.callerPermissionList)
    ? caller.callerPermissionList
    : [];
  const required = Array.isArray(codes) ? codes : [codes];
  if (!required.some((c) => list.includes(c))) {
    throw forbidden(
      'PERMISSION_DENIED',
      `Required any of: ${required.join('|')}`,
      { required: required.join(',') },
    );
  }
};

const requireCallerRole = (caller, allowed) => {
  requireAuthenticatedCaller(caller);
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (!list.includes(caller?.callerUserRole)) {
    throw forbidden('ROLE_REQUIRED', `Required role: ${list.join('|')}`, {
      required: list.join(','),
    });
  }
};

const requireOrganizationType = (caller, type) => {
  requireAuthenticatedCaller(caller);
  if (caller?.callerOrganizationType !== type) {
    throw forbidden('ORG_TYPE_REQUIRED', `Required org type: ${type}`, {
      required: type,
    });
  }
};

const requireAnyOrganizationType = (caller, types) => {
  requireAuthenticatedCaller(caller);
  const allowed = Array.isArray(types) ? types : [types];
  if (!allowed.includes(caller?.callerOrganizationType)) {
    throw forbidden('ORG_TYPE_REQUIRED', `Required org type: ${allowed.join('|')}`, {
      required: allowed.join(','),
    });
  }
};

export {
  isAnonymousCaller,
  requireAuthenticatedCaller,
  requireCallerPermission,
  requireAnyCallerPermission,
  requireCallerRole,
  requireOrganizationType,
  requireAnyOrganizationType,
};
