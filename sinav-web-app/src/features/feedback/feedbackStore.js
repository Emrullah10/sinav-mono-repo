import { create } from 'zustand';

const EMPTY = { kind: 'bug', message: '', images: [], audio: null };
const revoke = (url) => url && URL.revokeObjectURL(url);

// Geri bildirim taslağı pencereden bağımsız tutulur: ekran görüntüsü alınırken pencere gizlenir (hidden), taslak kaybolmaz.
export const useFeedbackStore = create((set, get) => ({
  open: false,
  hidden: false,
  ...EMPTY,
  show: () => set({ open: true, hidden: false }),
  hide: () => set({ open: false, hidden: false }),
  setHidden: (hidden) => set({ hidden }),
  setKind: (kind) => set({ kind }),
  setMessage: (message) => set({ message }),
  addImage: (img) => set((s) => ({ images: [...s.images, { id: `${Date.now()}-${Math.random()}`, ...img }].slice(0, 3) })),
  removeImage: (id) => set((s) => {
    revoke(s.images.find((i) => i.id === id)?.preview);
    return { images: s.images.filter((i) => i.id !== id) };
  }),
  setAudio: (audio) => set((s) => {
    revoke(s.audio?.url);
    return { audio };
  }),
  reset: () => {
    const s = get();
    s.images.forEach((i) => revoke(i.preview));
    revoke(s.audio?.url);
    set({ ...EMPTY });
  },
}));
