import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Kayıt öncesi onboarding seçimleri (ONB-01..04). Sunucuya POST /enrollments ile yazılana kadar burada durur.
export const useOnboardingStore = create(
  persist(
    (set) => ({
      trackKey: null,
      requestedTrackKey: null, // kullanıcı YÖKDİL seçtiyse ve iz coming_soon ise asıl seçim
      targetScore: null,
      reasonKeys: [],
      dateMode: null, // session | custom | unknown
      sessionKey: null,
      customDate: null,
      availability: { days: [1, 2, 3, 4, 5], minutes: 30 },
      reminderTime: '20:00',
      patch: (p) => set(p),
      reset: () =>
        set({ trackKey: null, requestedTrackKey: null, targetScore: null, reasonKeys: [], dateMode: null, sessionKey: null, customDate: null, availability: { days: [1, 2, 3, 4, 5], minutes: 30 }, reminderTime: '20:00' }),
    }),
    { name: 'onboarding-storage', storage: createJSONStorage(() => localStorage) }
  )
);
