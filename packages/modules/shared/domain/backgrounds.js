// Arka plan desenleri — web, mobil ve sunucu aynı tanımı kullanır (SAF: node bağımlılığı yok; mobil vendor'a gider).
//
// Seçim (sunucuda saklanan):  { key: 'plain' | <hazır desen> }  ya da  { key: 'custom', id }
// Desen tanımı (spec):        { pattern, color, intensity 1–5, scale 0.6–1.8, glow }
// Desenler bilerek çok soluktur: kartlar yüzey renginde olduğu için desen yalnız boşluklarda görünür, okunurluk bozulmaz.

export const BG_PATTERNS = ['dots', 'grid', 'lines', 'waves', 'contour', 'hex', 'plus', 'confetti'];
export const BG_MAX_CUSTOM = 6;
export const BG_INTENSITY = [1, 5];
export const BG_SCALE = [0.6, 1.8];

// Tema başına renk: açık zeminde koyu ton, koyu zeminde açık ton (tasarım belirteçleriyle uyumlu).
export const BG_COLORS = {
  ink: { light: '#13232A', dark: '#E4ECEC' },
  teal: { light: '#0E6A6E', dark: '#4DB6B0' },
  amber: { light: '#B97F08', dark: '#F0B43A' },
  slate: { light: '#475569', dark: '#94A3B8' },
  rose: { light: '#BE185D', dark: '#F472B6' },
  violet: { light: '#6D28D9', dark: '#A78BFA' },
  blue: { light: '#1D4ED8', dark: '#60A5FA' },
  green: { light: '#15803D', dark: '#4ADE80' },
};
export const BG_COLOR_KEYS = Object.keys(BG_COLORS);
const GLOW_PARTNER = { ink: 'teal', teal: 'amber', amber: 'teal', slate: 'blue', rose: 'violet', violet: 'rose', blue: 'teal', green: 'teal' };

// Yoğunluk 1–5 → desen opaklığı. Koyu temada göz aynı izi biraz daha zor seçtiği için bir tık yüksek.
const ALPHA = { light: [0.05, 0.075, 0.1, 0.135, 0.18], dark: [0.06, 0.09, 0.12, 0.155, 0.2] };

export const BG_PRESETS = [
  { key: 'plain', tier: 'free', spec: null },
  { key: 'dots', tier: 'free', spec: { pattern: 'dots', color: 'ink', intensity: 2, scale: 1, glow: false } },
  { key: 'contour', tier: 'free', spec: { pattern: 'contour', color: 'teal', intensity: 2, scale: 1, glow: false } },
  { key: 'grid', tier: 'premium', spec: { pattern: 'grid', color: 'slate', intensity: 2, scale: 1, glow: true } },
  { key: 'waves', tier: 'premium', spec: { pattern: 'waves', color: 'blue', intensity: 2, scale: 1, glow: true } },
  { key: 'hex', tier: 'premium', spec: { pattern: 'hex', color: 'teal', intensity: 2, scale: 1.1, glow: true } },
];
export const BG_DEFAULT_SELECTION = { key: 'plain' };
export const bgPreset = (key) => BG_PRESETS.find((p) => p.key === key) || null;

const num = (v, lo, hi, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

/** Dışarıdan gelen desen tanımını doğrular/sınırlar; geçersizse null. */
export const normalizeBgSpec = (s) => {
  if (!s || typeof s !== 'object' || !BG_PATTERNS.includes(s.pattern)) return null;
  return {
    pattern: s.pattern,
    color: BG_COLOR_KEYS.includes(s.color) ? s.color : 'ink',
    intensity: Math.round(num(s.intensity, BG_INTENSITY[0], BG_INTENSITY[1], 2)),
    scale: Math.round(num(s.scale, BG_SCALE[0], BG_SCALE[1], 1) * 10) / 10,
    glow: !!s.glow,
  };
};

const ID_RE = /^[a-z0-9_-]{1,24}$/i;
/** Kayıtlı özel arka plan: { id, ...spec }. */
export const normalizeBgCustom = (c) => {
  const spec = normalizeBgSpec(c);
  return spec && typeof c.id === 'string' && ID_RE.test(c.id) ? { id: c.id, ...spec } : null;
};
export const normalizeBgCustomList = (list) => {
  if (!Array.isArray(list)) return null;
  const seen = new Set();
  const out = [];
  for (const c of list) {
    const n = normalizeBgCustom(c);
    if (n && !seen.has(n.id)) { seen.add(n.id); out.push(n); }
  }
  return out.slice(0, BG_MAX_CUSTOM);
};

/** Seçimi doğrular; geçersizse null. */
export const normalizeBgSelection = (sel) => {
  if (!sel || typeof sel !== 'object') return null;
  if (sel.key === 'custom') return typeof sel.id === 'string' && ID_RE.test(sel.id) ? { key: 'custom', id: sel.id } : null;
  return bgPreset(sel.key) ? { key: sel.key } : null;
};

/** Seçimin gerektirdiği plan: hazır premium desenler ve tüm özel arka planlar premium. */
export const bgSelectionTier = (sel) => (sel?.key === 'custom' ? 'premium' : bgPreset(sel?.key)?.tier || 'free');

/** Seçimi çizilecek desen tanımına çevirir (sade ya da bulunamazsa null). */
export const resolveBgSpec = (sel, customList = []) => {
  if (!sel) return null;
  if (sel.key === 'custom') return normalizeBgSpec((customList || []).find((c) => c.id === sel.id));
  return bgPreset(sel.key)?.spec || null;
};

export const bgColorHex = (key, scheme = 'light') => (BG_COLORS[key] || BG_COLORS.ink)[scheme === 'dark' ? 'dark' : 'light'];
export const bgAlpha = (spec, scheme = 'light') => ALPHA[scheme === 'dark' ? 'dark' : 'light'][(spec?.intensity || 2) - 1];

// ── Karo çizimleri ────────────────────────────────────────────────────────────
// Her desen, kenarları kusursuz birleşen bir karo: { w, h, body(stroke, fill) }.
const r1 = (n) => Math.round(n * 100) / 100;

// Kapalı, hafif düzensiz halka (Catmull-Rom → kübik Bézier). Kontur deseni için.
const WOBBLE = [1, 0.9, 1.07, 0.95, 1.12, 0.88, 1.04, 0.97, 1.09, 0.93];
const blob = (cx, cy, rad, shift = 0, squash = 0.86) => {
  const n = WOBBLE.length;
  const pts = Array.from({ length: n }, (_x, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = WOBBLE[(i + shift) % n];
    return [cx + Math.cos(a) * rad * k, cy + Math.sin(a) * rad * k * squash];
  });
  const p = (i) => pts[(i + n) % n];
  let d = `M${r1(p(0)[0])} ${r1(p(0)[1])}`;
  for (let i = 0; i < n; i += 1) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return `${d}Z`;
};

const CONFETTI = [
  ['dash', 0.14, 0.16, 32, 0.15], ['ring', 0.62, 0.14, 0.042], ['dash', 0.85, 0.4, -38, 0.14], ['dot', 0.36, 0.52, 0.03],
  ['dash', 0.16, 0.8, 68, 0.13], ['ring', 0.6, 0.75, 0.036], ['dash', 0.86, 0.86, 14, 0.14], ['dot', 0.46, 0.28, 0.024],
];

const TILES = {
  dots: (s) => {
    const g = 22 * s;
    return { w: g, h: g, body: (_st, fi) => `<circle cx="${r1(g / 2)}" cy="${r1(g / 2)}" r="${r1(1.05 + 0.35 * s)}" ${fi}/>` };
  },
  grid: (s) => {
    const g = 30 * s;
    return { w: g, h: g, body: (st) => `<path d="M0 0.5H${r1(g)}M0.5 0V${r1(g)}" ${st}/>` };
  },
  lines: (s) => {
    const g = 16 * s;
    return { w: g, h: g, body: (st) => `<path d="M${r1(-g / 2)} ${r1(g / 2)}L${r1(g / 2)} ${r1(-g / 2)}M0 ${r1(g)}L${r1(g)} 0M${r1(g / 2)} ${r1(g * 1.5)}L${r1(g * 1.5)} ${r1(g / 2)}" ${st}/>` };
  },
  waves: (s) => {
    const w = 56 * s;
    const h = 22 * s;
    const a = h * 0.42;
    return { w, h, body: (st) => `<path d="M0 ${r1(h / 2)}Q${r1(w / 4)} ${r1(h / 2 - a)} ${r1(w / 2)} ${r1(h / 2)}T${r1(w)} ${r1(h / 2)}" ${st}/>` };
  },
  contour: (s) => {
    const g = 200 * s;
    const c = g / 2;
    const rings = [0.4, 0.29, 0.18, 0.08].map((k, i) => blob(c, c, g * k, i * 3)).join('');
    // Köşe halkaları dört köşede aynı çizilir; karolar yan yana gelince tek halka olarak birleşir.
    const corner = [0.16, 0.07].flatMap((k, i) => [[0, 0], [g, 0], [0, g], [g, g]].map(([x, y]) => blob(x, y, g * k, 5 + i * 2, 0.92))).join('');
    return { w: g, h: g, body: (st) => `<path d="${rings}${corner}" ${st}/>` };
  },
  hex: (s) => {
    const a = 11 * s;
    const h = Math.sqrt(3) * a;
    const d = `M0 ${r1(h / 2)}L${r1(a / 2)} 0H${r1(1.5 * a)}L${r1(2 * a)} ${r1(h / 2)}L${r1(1.5 * a)} ${r1(h)}H${r1(a / 2)}ZM${r1(2 * a)} ${r1(h / 2)}H${r1(3 * a)}`;
    return { w: 3 * a, h, body: (st) => `<path d="${d}" ${st}/>` };
  },
  plus: (s) => {
    const g = 28 * s;
    const c = g / 2;
    const m = 2.6 + 0.9 * s;
    return { w: g, h: g, body: (st) => `<path d="M${r1(c - m)} ${r1(c)}H${r1(c + m)}M${r1(c)} ${r1(c - m)}V${r1(c + m)}" ${st}/>` };
  },
  confetti: (s) => {
    const g = 64 * s;
    const body = (st, fi) =>
      CONFETTI.map(([kind, x, y, p, q]) => {
        const cx = r1(x * g);
        const cy = r1(y * g);
        if (kind === 'dot') return `<circle cx="${cx}" cy="${cy}" r="${r1(p * g)}" ${fi}/>`;
        if (kind === 'ring') return `<circle cx="${cx}" cy="${cy}" r="${r1(p * g)}" ${st}/>`;
        const rad = (p * Math.PI) / 180;
        const dx = (Math.cos(rad) * q * g) / 2;
        const dy = (Math.sin(rad) * q * g) / 2;
        return `<path d="M${r1(cx - dx)} ${r1(cy - dy)}L${r1(cx + dx)} ${r1(cy + dy)}" ${st}/>`;
      }).join('');
    return { w: g, h: g, body };
  },
};

const STROKE_W = { grid: 1, lines: 1, waves: 1.2, contour: 1, hex: 1, plus: 1.3, confetti: 1.6 };
const paint = (spec, scheme) => {
  const color = bgColorHex(spec.color, scheme);
  const alpha = bgAlpha(spec, scheme);
  const sw = STROKE_W[spec.pattern] || 1;
  return {
    st: `fill="none" stroke="${color}" stroke-opacity="${alpha}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`,
    fi: `fill="${color}" fill-opacity="${alpha}"`,
  };
};

/**
 * Tek karo SVG (web: background-image olarak tekrarlanır). { svg, width, height }.
 */
export const bgTileSvg = (spec, scheme = 'light') => {
  const n = normalizeBgSpec(spec);
  if (!n) return null;
  const t = TILES[n.pattern](n.scale);
  const { st, fi } = paint(n, scheme);
  const w = r1(t.w);
  const h = r1(t.h);
  return { width: w, height: h, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${t.body(st, fi)}</svg>` };
};

/** Köşe ışıltıları (oranlar 0–1): [{ cx, cy, r, color, opacity }]. glow kapalıysa boş. */
export const bgGlow = (spec, scheme = 'light') => {
  const n = normalizeBgSpec(spec);
  if (!n?.glow) return [];
  const dark = scheme === 'dark';
  return [
    { cx: 1, cy: 0, r: 0.75, color: bgColorHex(n.color, scheme), opacity: dark ? 0.16 : 0.12 },
    { cx: 0, cy: 1, r: 0.65, color: bgColorHex(GLOW_PARTNER[n.color] || 'teal', scheme), opacity: dark ? 0.11 : 0.08 },
  ];
};

/**
 * Tam yüzey SVG (mobil ve önizlemeler): desen <pattern> ile döşenir, ışıltı üstüne eklenir.
 * width/height: çizim alanı (px). Zemin rengi çizilmez; altındaki yüzey/kanvas rengi görünür.
 */
export const bgSurfaceSvg = (spec, scheme = 'light', { width = 400, height = 800, id = 'bg' } = {}) => {
  const tile = bgTileSvg(spec, scheme);
  if (!tile) return null;
  const inner = tile.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const glows = bgGlow(spec, scheme);
  const grads = glows
    .map((g, i) => `<radialGradient id="${id}g${i}" cx="${g.cx}" cy="${g.cy}" r="${g.r}"><stop offset="0" stop-color="${g.color}" stop-opacity="${g.opacity}"/><stop offset="1" stop-color="${g.color}" stop-opacity="0"/></radialGradient>`)
    .join('');
  const glowRects = glows.map((_g, i) => `<rect width="${width}" height="${height}" fill="url(#${id}g${i})"/>`).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><pattern id="${id}p" width="${tile.width}" height="${tile.height}" patternUnits="userSpaceOnUse">${inner}</pattern>${grads}</defs>` +
    `${glowRects}<rect width="${width}" height="${height}" fill="url(#${id}p)"/></svg>`
  );
};

/** Yeni özel arka plan kimliği (istemci üretir; sunucu biçimi doğrular). */
export const newBgId = () => `c${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
