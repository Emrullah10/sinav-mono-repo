// Service-discovery route metadata'sını regex-tabanlı kayda dönüştürür.
// Gateway'in `findRoute(method, urlPath)` çağrısı için kullanılır.
// Her service-discovery güncellemesinde rebuild edilir.

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const pathToRegex = (pathPattern) => {
  // Service-discovery `{param}` → `:param` çevirir; ikisini de ele al.
  const segments = pathPattern.split('/').map((seg) => {
    if (isParamSegment(seg)) return '[^/]+';
    return escapeRegex(seg);
  });
  return new RegExp(`^${segments.join('/')}$`);
};

const isParamSegment = (seg) => seg.startsWith(':') || (seg.startsWith('{') && seg.endsWith('}'));

// ── ÖZGÜLLÜK SIRASI (2026-09-23, bug-2331) ──────────────────────────────────
// `findRoute` eşleşen İLK kaydı döndürür; kayıtlar ise servis keşfinden Redis
// SCAN sırasıyla gelir ve bu sıra GARANTİ DEĞİLDİR. `/carrier/bid-purchase/offer`
// ile `/carrier/bid-purchase/{purchaseCode}` aynı isteğe uyar: parametreli kayıt
// önce gelirse `/offer`'a onun izni (`payment:make`) uygulanıyor ve bu izne
// sahip olmayan carrier_user teklif sayfasında 403 alıyordu. Servisin kendisi
// route'ları sıralayarak kaydeder (service-discovery); gateway'in izin araması
// da aynı sonucu vermeli.
//
// Kural: iki desen segment segment karşılaştırılır; ilk farklı segmentte SABİT
// olan, PARAMETRELİ olandan önce gelir. Regex'ler tam segment sayısıyla
// eşleştiği için yalnız aynı uzunluktaki desenler çakışabilir.
const bySpecificity = (a, b) => {
  const sa = a.path.split('/');
  const sb = b.path.split('/');
  const n = Math.min(sa.length, sb.length);
  for (let i = 0; i < n; i += 1) {
    const pa = isParamSegment(sa[i]);
    const pb = isParamSegment(sb[i]);
    if (pa !== pb) return pa ? 1 : -1;
  }
  return 0;
};

const buildRegistry = (services) => {
  const entries = [];
  for (const svc of services) {
    if (!svc?.method || !svc?.basePath || !svc?.path) continue;
    const fullPath = `${svc.basePathPrefix || ''}${svc.basePath}${svc.path}`;
    entries.push({
      regex: pathToRegex(fullPath),
      method: svc.method.toLowerCase(),
      path: fullPath,
      permissionList: svc.permissionList || null,
      internal: svc.internal === true,
      service: svc,
    });
  }
  // Array.prototype.sort kararlıdır: eşit özgüllükteki kayıtlar gelen sırayı korur.
  return entries.sort(bySpecificity);
};

const findRoute = (registry, method, urlPath) => {
  const m = method.toLowerCase();
  const p = (urlPath || '').split('?')[0];
  for (const entry of registry) {
    if (entry.method === m && entry.regex.test(p)) return entry;
  }
  return null;
};

export { buildRegistry, findRoute };
