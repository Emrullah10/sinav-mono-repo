import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import { queryClient } from '@shared/providers/QueryProvider';
import { useThemeStore } from '@store/themeStore';

const KEY = ['me', 'prefs'];
const FONT = { literata: 'var(--font-reading)', figtree: 'var(--font-ui)', atkinson_hyperlegible: 'var(--font-ui)' };
const SIZE = { '-1': 16, 0: 18, 1: 20, 2: 23 };

/** Okuma tercihleri sunucuda (Ayarlar ile aynı kayıt): cihazlar arası geçerlidir. Değişiklik anında uygulanır. */
export default function useReaderPrefs() {
  const q = useApiQuery(KEY, () => api.identityPreferencesGet(), { staleTime: 5 * 60 * 1000 });
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeLocal = useThemeStore((s) => s.setMode);
  const save = useApiMutation((b) => api.identityPreferencesUpdate(b));
  const p = q.data || {};
  const update = (patch) => {
    queryClient.setQueryData(KEY, (old) => ({ ...(old || {}), ...patch }));
    if (patch.theme) setThemeLocal(patch.theme);
    save.mutate(patch);
  };
  const scale = p.readingTextScale ?? 0;
  const font = p.readingFont || 'literata';
  const spacing = p.readingLineSpacing ?? 0;
  const px = SIZE[scale] ?? 18;
  return {
    // Seçici uygulanan temayı gösterir; sunucu kaydı girişte AuthBootstrap ile buna yüklenir.
    prefs: { scale, font, spacing, theme: themeMode },
    update,
    style: { fontFamily: FONT[font] || FONT.literata, fontSize: px, lineHeight: spacing ? 1.85 : 1.6 },
  };
}
