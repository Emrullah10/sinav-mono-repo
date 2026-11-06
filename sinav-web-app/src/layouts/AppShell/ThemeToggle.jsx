import { useTranslation } from 'react-i18next';
import { Moon, Sun } from 'lucide-react';
import api from '@api';
import IconButton from '@components/IconButton/IconButton';
import { useThemeStore } from '@store/themeStore';
import { useAuthStore } from '@store/authStore';
import { useResolvedTheme } from '@shared/providers/ThemeProvider';
import { queryClient } from '@shared/providers/QueryProvider';
import { switchTheme, centerOf } from '@shared/utils/themeTransition';

// Üst çubukta hızlı açık/koyu geçişi. Tercih Ayarlar'daki gibi sunucuya da yazılır (ME-09) ki diğer
// cihazlar da aynı temayla açılsın. "Sistemi izle" seçeneği yalnız Ayarlar'da.
export default function ThemeToggle() {
  const { t } = useTranslation();
  const resolved = useResolvedTheme();
  const setMode = useThemeStore((s) => s.setMode);
  const authed = useAuthStore((s) => s.status === 'authenticated');
  const next = resolved === 'dark' ? 'light' : 'dark';
  const toggle = (e) => {
    switchTheme(setMode, next, centerOf(e));
    if (!authed) return;
    api
      .identityPreferencesUpdate({ theme: next })
      .then((r) => {
        const d = r?.data?.data;
        if (d) queryClient.setQueryData(['me', 'prefs'], d);
      })
      .catch(() => {});
  };
  return (
    <IconButton label={t(next === 'dark' ? 'nav.theme.toDark' : 'nav.theme.toLight')} onClick={toggle}>
      {next === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
    </IconButton>
  );
}
