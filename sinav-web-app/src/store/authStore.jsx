import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { queryClient } from '@shared/providers/QueryProvider';

// status: 'unknown' | 'authenticated' | 'unauthenticated'
export const useAuthStore = create(
  persist(
    (set) => ({
      status: 'unknown',
      user: null,
      permissions: [],
      login: ({ user, permissions }) =>
        set({ status: 'authenticated', user, permissions: permissions || user?.permissions || [] }),
      setStatus: (status) => set({ status }),
      logout: ({ clearQueryCache = true } = {}) => {
        set({ status: 'unauthenticated', user: null, permissions: [] });
        if (clearQueryCache) queryClient.clear();
        useAuthStore.persist.clearStorage();
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ user: s.user, permissions: s.permissions }),
    }
  )
);

export const isGuestUser = (user) => user?.userAccountRole === 'guest' || user?.isGuest === true;
