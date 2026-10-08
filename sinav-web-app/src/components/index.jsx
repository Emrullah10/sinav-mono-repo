// Kayıt defteri: import Components from '@components'; const { Button } = Components;
const modules = import.meta.glob('./*/*.jsx', { eager: true });
const registry = {};
for (const [p, m] of Object.entries(modules)) {
  const name = p.split('/')[1];
  if (m.default && p.endsWith(`${name}.jsx`)) registry[name] = m.default;
}
export default registry;
