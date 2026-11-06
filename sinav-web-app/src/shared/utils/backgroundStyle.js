import { bgTileSvg, bgGlow } from '@sinav/domain';

const hexA = (hex, a) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;

// Desen tanımını CSS arka planına çevirir: köşe ışıltıları (radial-gradient) + tekrarlanan SVG karo.
// Zemin rengi verilmez; altındaki kanvas/yüzey rengi görünür. spec yoksa (Sade) boş stil.
export const bgStyle = (spec, scheme = 'light') => {
  const tile = spec ? bgTileSvg(spec, scheme) : null;
  if (!tile) return {};
  const glows = bgGlow(spec, scheme).map(
    (g) => `radial-gradient(circle at ${g.cx * 100}% ${g.cy * 100}%, ${hexA(g.color, g.opacity)} 0%, transparent ${Math.round(g.r * 100)}%)`
  );
  return {
    backgroundImage: [...glows, `url("data:image/svg+xml,${encodeURIComponent(tile.svg)}")`].join(', '),
    backgroundSize: [...glows.map(() => '100% 100%'), `${tile.width}px ${tile.height}px`].join(', '),
    backgroundRepeat: [...glows.map(() => 'no-repeat'), 'repeat'].join(', '),
  };
};
