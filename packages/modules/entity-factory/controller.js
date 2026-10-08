// `sensitiveKeys`: kolon tanımında `sensitive: true` olan alanların camelCase
// adları. Auto-CRUD GET `SELECT *` ile okur; bu alanlar (şifre hash'i, ödeme
// sağlayıcı token'ı, doğrulama kodu...) HTTP yanıtından ÇIKARILIR (denetim #18,
// #20). Ayıklama BİLEREK yalnız burada, HTTP sınırında: `useCase.read` servis
// içinden de çağrılıyor (ör. giriş akışı şifre hash'ini okur) ve orada tam satır
// gerekiyor.
const stripSensitive = (rows, sensitiveKeys) => {
  if (!sensitiveKeys.length || !Array.isArray(rows)) return rows;
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const out = { ...row };
    for (const key of sensitiveKeys) delete out[key];
    return out;
  });
};

// ── ANONİM ÇAĞIRAN ORG VERİSİNE ULAŞAMAZ (denetim #75) ──────────────────────
// Gateway public isteğe `'none'` sentinel başlıkları basar ve query-builder
// `'none'`ı "kapsam süzgecini atla" diye okur (servis içi sahiplik kontrolü
// sonrası çapraz-org okumalar bunu BİLEREK kullanır). HTTP sınırında ise bu,
// public listeye yanlışlıkla eklenen org kapsamlı bir auto-CRUD yolunun TÜM
// org verisini açması demekti. Controller yalnız HTTP'den çağrılır: org
// kapsamlı tabloda sentinel çağıran 401 alır. Referans/enum tabloları
// (org kolonu yok) public okunmaya devam eder.
const isAnonymous = (caller) =>
  caller?.callerOrganizationId === 'none' || caller?.callerTenantCode === 'none';

const assertScopedCaller = (entityName, orgScoped, caller) => {
  if (orgScoped && isAnonymous(caller)) {
    const err = new Error(`AUTHENTICATION_REQUIRED: ${entityName}`);
    err.code = 'AUTHENTICATION_REQUIRED';
    err.statusCode = 401;
    throw err;
  }
};

export const createController = (
  entityName,
  useCase,
  sensitiveKeys = [],
  { orgScoped = false } = {},
) => ({
  name: entityName[0].toUpperCase() + entityName.slice(1),
  read: async ({ query }, caller) => {
    assertScopedCaller(entityName, orgScoped, caller);
    return stripSensitive(await useCase.read(query, caller), sensitiveKeys);
  },
  upsert: async ({ body }, caller) => {
    assertScopedCaller(entityName, orgScoped, caller);
    return stripSensitive(await useCase.upsert(body, caller), sensitiveKeys);
  },
});
