// ds-light/dark.json (designMd) + semantic.json → web CSS/SCSS/MUI teması ve native tokens.js.
// ds-*.json ile semantic.json'daki aynı rol farklı değer taşıyorsa üretim HATA verir.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESIGN = path.resolve(HERE, '../../design');
const sem = JSON.parse(fs.readFileSync(path.join(HERE, 'src/semantic.json'), 'utf8'));

const designColors = (file) => {
  const md = JSON.parse(fs.readFileSync(path.join(DESIGN, file), 'utf8')).body.designSystem.theme.designMd;
  const block = md.split('colors:')[1].split('typography:')[0];
  const out = {};
  for (const m of block.matchAll(/^\s+([a-z0-9-]+):\s*'(#[0-9A-Fa-f]{6})'/gm)) out[m[1]] = m[2].toUpperCase();
  return out;
};
const MAP = {
  background: 'bg.canvas', surface: 'bg.surface', 'surface-container': 'bg.raised', 'on-surface': 'text.primary',
  'on-surface-variant': 'text.secondary', outline: 'border.input', 'outline-variant': 'border.default',
  primary: 'accent.default', 'on-primary': 'text.on-accent', 'primary-container': 'accent.subtle-bg',
  'on-primary-container': 'accent.subtle-fg', secondary: 'reward.default', tertiary: 'success.fg',
  'tertiary-container': 'success.bg', error: 'danger.fg', 'error-container': 'danger.bg',
  'inverse-surface': 'bg.inverse', 'chart-1': 'chart.series-1', 'chart-2': 'chart.series-2', 'chart-3': 'chart.series-3', 'chart-4': 'chart.series-4',
};
for (const [mode, file] of [['light', 'ds-light.json'], ['dark', 'ds-dark.json']]) {
  const dc = designColors(file);
  for (const [k, role] of Object.entries(MAP)) {
    if (dc[k] && sem[mode][role] && dc[k] !== sem[mode][role].toUpperCase()) {
      throw new Error(`token çakışması (${mode}) ${k}→${role}: ds=${dc[k]} semantic=${sem[mode][role]}`);
    }
  }
}

const cssVar = (k) => `--color-${k.replace(/\./g, '-')}`;
const block = (sel, obj) => `${sel} {\n${Object.entries(obj).map(([k, v]) => `  ${cssVar(k)}: ${v};`).join('\n')}\n}\n`;
const shared =
  Object.entries(sem.space).map(([k, v]) => `  --space-${k}: ${v}px;`).join('\n') + '\n' +
  Object.entries(sem.radius).map(([k, v]) => `  --radius-${k}: ${v}px;`).join('\n') + '\n' +
  Object.entries(sem.motion).map(([k, v]) => `  --motion-${k}: ${v}ms;`).join('\n') + '\n' +
  Object.entries(sem.font).map(([k, v]) => `  --font-${k}: ${v};`).join('\n');
const typeCss = Object.entries(sem.type).map(([k, t]) =>
  `.t-${k} { font-family: var(--font-${t.family}); font-size: ${t.size[0]}px; line-height: ${t.line[0]}px; font-weight: ${t.weight}; letter-spacing: ${t.tracking}em; }\n@media (min-width: 900px) { .t-${k} { font-size: ${t.size[1]}px; line-height: ${t.line[1]}px; } }`).join('\n');

const css = `/* ÜRETİLDİ: npm run tokens:build */\n:root {\n${shared}\n}\n${block(':root', sem.light)}${block(':root[data-theme="dark"]', sem.dark)}@media (prefers-color-scheme: dark) {\n${block(':root:not([data-theme="light"])', sem.dark).replace(/^/gm, '  ')}}\n${typeCss}\n`;
fs.mkdirSync(path.join(HERE, 'dist/web'), { recursive: true });
fs.mkdirSync(path.join(HERE, 'dist/native'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'dist/web/tokens.css'), css);
fs.writeFileSync(path.join(HERE, 'dist/web/_tokens.scss'), `// ÜRETİLDİ\n${Object.keys(sem.light).map((k) => `$${k.replace(/\./g, '-')}: var(${cssVar(k)});`).join('\n')}\n${Object.keys(sem.space).map((k) => `$space-${k}: var(--space-${k});`).join('\n')}\n${Object.keys(sem.radius).map((k) => `$radius-${k}: var(--radius-${k});`).join('\n')}\n`);

const nested = (flat) => {
  const o = {};
  for (const [k, v] of Object.entries(flat)) {
    const [a, b] = k.split('.');
    (o[a] ||= {})[b] = v;
  }
  return o;
};
const tokens = { light: nested(sem.light), dark: nested(sem.dark), space: sem.space, radius: sem.radius, motion: sem.motion, font: sem.font, type: sem.type };
fs.writeFileSync(path.join(HERE, 'dist/native/tokens.js'), `// ÜRETİLDİ: npm run tokens:build\nexport const tokens = ${JSON.stringify(tokens, null, 2)};\nexport const { light, dark, space, radius, motion, font, type } = tokens;\nexport default tokens;\n`);

const L = sem.light, Dk = sem.dark;
const scheme = (c) => ({ palette: { primary: { main: c['accent.default'], contrastText: c['text.on-accent'] }, secondary: { main: c['reward.default'], contrastText: c['reward.on'] }, error: { main: c['danger.fg'] }, success: { main: c['success.fg'] }, warning: { main: c['warning.fg'] }, background: { default: c['bg.canvas'], paper: c['bg.surface'] }, text: { primary: c['text.primary'], secondary: c['text.secondary'], disabled: c['text.disabled'] }, divider: c['border.default'] } });
fs.writeFileSync(path.join(HERE, 'dist/web/mui-theme.js'), `// ÜRETİLDİ\nexport const colorSchemes = ${JSON.stringify({ light: scheme(L), dark: scheme(Dk) }, null, 2)};\nexport const shape = { borderRadius: ${sem.radius.md} };\nexport const fontFamily = ${JSON.stringify(sem.font.ui)};\n`);
console.log('tokens: ok', Object.keys(sem.light).length, 'rol');
