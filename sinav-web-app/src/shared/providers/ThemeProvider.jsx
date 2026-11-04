import { useEffect, useMemo, useState } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import { colorSchemes, shape, fontFamily } from '@sinav/design-tokens/mui';
import '@sinav/design-tokens/web.css';
import '@fontsource-variable/figtree';
import '@fontsource-variable/literata';
import '@fontsource-variable/bricolage-grotesque';
import { useThemeStore } from '@store/themeStore';
import { useUiStore } from '@store/uiStore';

const muiTheme = createTheme({
  cssVariables: { colorSchemeSelector: 'data' },
  colorSchemes,
  shape,
  typography: { fontFamily, button: { textTransform: 'none', fontWeight: 600 } },
});

const systemDark = () => (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export const useResolvedTheme = () => {
  const mode = useThemeStore((s) => s.mode);
  const [sys, setSys] = useState(systemDark);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = () => setSys(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return mode === 'system' ? sys : mode;
};

// MUI defaultMode yalnız ilk açılışta okunur; sonraki değişiklikleri MUI'ye bildirir (yoksa zemin/kağıt rengi yenilemeye kadar eski kalır).
function MuiModeSync({ mode }) {
  const { setMode } = useColorScheme();
  useEffect(() => {
    setMode(mode);
  }, [mode, setMode]);
  return null;
}

export default function ThemeProvider({ children }) {
  const resolved = useResolvedTheme();
  const reduceMotion = useUiStore((s) => s.reduceMotion);
  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute('data-theme', resolved);
    el.setAttribute('data-mui-color-scheme', resolved);
    el.style.colorScheme = resolved;
    el.setAttribute('data-reduce-motion', String(reduceMotion));
  }, [resolved, reduceMotion]);
  const theme = useMemo(() => muiTheme, []);
  return (
    // storageManager={null}: tek kaynak themeStore; MUI kendi 'mui-mode' kaydını tutmaz.
    <MuiThemeProvider theme={theme} defaultMode={resolved} storageManager={null}>
      <MuiModeSync mode={resolved} />
      <CssBaseline enableColorScheme />
      {children}
    </MuiThemeProvider>
  );
}
