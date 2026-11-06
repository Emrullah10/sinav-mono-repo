import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// mode: 'system' | 'light' | 'dark' (kullanıcı tercihi; sunucuya da yazılır — ME-09). Varsayılan açık tema.
export const useThemeStore = create(
  persist(
    (set) => ({
      mode: 'light',
      setMode: (mode) => set({ mode }),
    }),
    { name: 'theme-storage', storage: createJSONStorage(() => localStorage) }
  )
);
