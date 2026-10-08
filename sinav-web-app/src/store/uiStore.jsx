import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const useUiStore = create(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      tutorPanelOpen: false,
      readingFont: 'literata', // literata | figtree | atkinson
      readingScale: 0, // -1..2
      reduceMotion: false,
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setTutorPanelOpen: (v) => set({ tutorPanelOpen: v }),
      setReading: (p) => set(p),
      setReduceMotion: (v) => set({ reduceMotion: v }),
    }),
    { name: 'ui-storage', storage: createJSONStorage(() => localStorage) }
  )
);
