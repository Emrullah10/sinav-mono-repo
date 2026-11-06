import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { BG_DEFAULT_SELECTION } from '@sinav/domain';

// Uygulama arka planı (sunucuda da saklanır: identity preferences). İlk boyamada titreme olmasın diye yerelde de tutulur.
// draft: Desen stüdyosundayken tüm uygulamada canlı önizleme; kalıcı değildir, stüdyodan çıkınca temizlenir.
export const useBackgroundStore = create(
  persist(
    (set) => ({
      selection: BG_DEFAULT_SELECTION,
      custom: [],
      locked: false,
      draft: null,
      apply: (p) => {
        if (!p || !('background' in p)) return;
        set({ selection: p.background || BG_DEFAULT_SELECTION, custom: p.customBackgrounds || [], locked: !!p.backgroundLocked });
      },
      setSelection: (selection) => set({ selection }),
      setDraft: (draft) => set({ draft }),
    }),
    {
      name: 'background-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ selection: s.selection, custom: s.custom, locked: s.locked }),
    }
  )
);
