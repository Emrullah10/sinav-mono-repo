import { resolveBgSpec } from '@sinav/domain';
import { useResolvedTheme } from '@shared/providers/ThemeProvider';
import { useBackgroundStore } from '@store/backgroundStore';
import { bgStyle } from '@shared/utils/backgroundStyle';
import styles from './AppShell.module.scss';

// Ana uygulama kabuğunun arkasındaki desen (sabit; içerik üstünde kayar). Odak modu ekranları bu kabuğu kullanmaz → sade kalır.
export default function AppBackground() {
  const scheme = useResolvedTheme();
  const selection = useBackgroundStore((s) => s.selection);
  const custom = useBackgroundStore((s) => s.custom);
  const draft = useBackgroundStore((s) => s.draft);
  const spec = draft || resolveBgSpec(selection, custom);
  if (!spec) return null;
  // Seçim değişince yumuşakça belirir; stüdyoda kaydırıcı oynarken (draft) her adımda yeniden belirmesin.
  const key = draft ? 'draft' : JSON.stringify(spec);
  return <div key={key} className={styles.bg} style={bgStyle(spec, scheme)} aria-hidden />;
}
