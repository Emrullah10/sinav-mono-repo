import { flushSync } from 'react-dom';

// Tema değişimini yumuşak geçişle uygular: yeni tema, tıklanan noktadan büyüyen bir daireyle açılır
// (View Transitions API). Desteklemeyen tarayıcıda ya da "hareketi azalt" açıkken anında değişir.
// origin: { x, y } ekran koordinatı (genelde tıklanan düğmenin ortası); yoksa ekranın ortası.
const DURATION = 480;
const EASING = 'cubic-bezier(0.2, 0, 0, 1)';

const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;
const resolve = (mode) => (mode === 'system' ? (prefersDark() ? 'dark' : 'light') : mode);

const reducedMotion = () =>
  document.documentElement.getAttribute('data-reduce-motion') === 'true' ||
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ThemeProvider'ın efektiyle aynı öznitelikler; ekran görüntüsü alınmadan önce DOM'da hazır olsunlar.
const paint = (theme) => {
  const el = document.documentElement;
  el.setAttribute('data-theme', theme);
  el.setAttribute('data-mui-color-scheme', theme);
  el.style.colorScheme = theme;
};

export function switchTheme(setMode, mode, origin) {
  const el = document.documentElement;
  const from = el.getAttribute('data-theme') || resolve('system');
  const to = resolve(mode);
  if (from === to || typeof document.startViewTransition !== 'function' || reducedMotion()) {
    setMode(mode);
    return;
  }
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  el.setAttribute('data-theme-switching', '');
  const vt = document.startViewTransition(() => {
    flushSync(() => setMode(mode));
    paint(to);
  });
  vt.ready
    .then(() =>
      el.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: DURATION, easing: EASING, pseudoElement: '::view-transition-new(root)' },
      ),
    )
    .catch(() => {});
  vt.finished.finally(() => el.removeAttribute('data-theme-switching'));
}

/** Tıklanan öğenin ortası — switchTheme'e origin olarak verilir. */
export const centerOf = (event) => {
  const r = event?.currentTarget?.getBoundingClientRect?.();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined;
};
