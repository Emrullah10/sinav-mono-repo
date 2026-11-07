import { useEffect, useMemo, useState } from 'react';
import { looksEnglish, splitSentences } from '@sinav/domain';

// Konuşma motorunun 1.0'ı okuma için hızlı: görünen 1× motorda 0.88'dir (mobille aynı).
export const READ_RATES = [{ label: '0,8', value: 0.72 }, { label: '1', value: 0.88 }, { label: '1,2', value: 1.04 }];
let savedRate = READ_RATES[1].value;
const AHEAD = 3;

const synth = () => (typeof window !== 'undefined' ? window.speechSynthesis : null);
export const readAloudSupported = () => Boolean(synth() && typeof window.SpeechSynthesisUtterance === 'function');

/** Tarayıcıdaki en doğal ses: Edge "Natural", Safari "Premium/Enhanced", Chrome "Google". Eğlence sesleri (macOS) seçilmez. */
const pickVoice = (language) => {
  const s = synth();
  const want = language.toLowerCase();
  const score = (v) => {
    const uri = String(v.voiceURI || '').toLowerCase();
    const name = String(v.name || '').toLowerCase();
    if (uri.includes('speech.synthesis') || uri.includes('eloquence')) return -1;
    if (name.includes('natural')) return 4;
    if (name.includes('premium') || uri.includes('.premium.')) return 3;
    if (name.includes('enhanced') || uri.includes('.enhanced.')) return 2;
    if (name.includes('google')) return 2;
    return 1;
  };
  return (s?.getVoices() || [])
    .filter((v) => String(v.lang || '').replace('_', '-').toLowerCase() === want && score(v) > 0)
    .sort((a, b) => score(b) - score(a))[0] || null;
};

const unitsOf = (blocks) => {
  const out = [];
  (blocks || []).forEach((b, block) => {
    splitSentences(String(b.x || '')).forEach((s, sentence) => {
      if (/[\p{L}\p{N}]/u.test(s.text)) out.push({ block, sentence, text: s.text });
    });
  });
  return out;
};

/** React dışı okuma motoru (mobildeki ile aynı akış): eski oturumun (gen) olayları yok sayılır. */
const createEngine = (emit) => {
  const s = { units: [], lang: 'en', rate: savedRate, onEnd: null, gen: 0, at: -1, next: 0, status: 'idle' };
  const set = (patch) => {
    Object.assign(s, patch);
    emit(patch);
  };
  const languageOf = (text) => (s.lang === 'en' || looksEnglish(text) ? 'en-US' : 'tr-TR');

  const fill = (g) => {
    const sp = synth();
    while (sp && g === s.gen && s.next < s.units.length && s.next <= Math.max(s.at, 0) + AHEAD) {
      const i = s.next;
      s.next += 1;
      const u = new window.SpeechSynthesisUtterance(s.units[i].text);
      u.lang = languageOf(s.units[i].text);
      const voice = pickVoice(u.lang);
      if (voice) u.voice = voice;
      u.rate = s.rate;
      u.onstart = () => {
        if (g === s.gen) set({ at: i });
      };
      u.onend = () => {
        if (g !== s.gen) return;
        if (i >= s.units.length - 1) {
          s.gen += 1;
          set({ at: -1, status: 'idle' });
          s.onEnd?.();
          return;
        }
        s.at = i + 1;
        fill(g);
      };
      u.onerror = (e) => {
        if (g !== s.gen || e.error === 'interrupted' || e.error === 'canceled') return;
        s.gen += 1;
        set({ status: 'paused' });
      };
      sp.speak(u);
    }
  };

  const start = (index) => {
    if (!s.units.length || !synth()) return;
    const i = Math.min(Math.max(0, index), s.units.length - 1);
    s.gen += 1;
    synth().cancel();
    s.next = i;
    set({ at: i, status: 'playing' });
    fill(s.gen);
  };
  const halt = (status) => {
    s.gen += 1;
    synth()?.cancel();
    set(status === 'idle' ? { status, at: -1 } : { status });
  };

  return {
    configure: ({ units, lang, onEnd }) => Object.assign(s, { units, lang, onEnd }),
    playFrom: (blockIndex) => {
      const i = s.units.findIndex((u) => u.block >= blockIndex);
      if (i >= 0) start(i);
      else s.onEnd?.();
    },
    toggle: () => (s.status === 'playing' ? halt('paused') : start(s.at >= 0 ? s.at : 0)),
    skip: (delta) => start((s.at >= 0 ? s.at : 0) + delta),
    setRate: (rate) => {
      savedRate = rate;
      set({ rate });
      if (s.status === 'playing') start(s.at);
    },
    pause: () => {
      if (s.status === 'playing') halt('paused');
    },
    stop: () => halt('idle'),
    dispose: () => {
      s.gen += 1;
      synth()?.cancel();
    },
  };
};

/**
 * Kitabı tarayıcının konuşma motoruyla cümle cümle okur (sunucu maliyeti yok). Mobildeki useReadAloud ile aynı arayüz.
 * → { status, current: { block, sentence } | null, rate, playFrom, toggle, skip, setRate, pause, stop }
 */
export default function useReadAloud({ blocks, lang, onEnd }) {
  const units = useMemo(() => unitsOf(blocks), [blocks]);
  const [view, setView] = useState({ status: 'idle', at: -1, rate: savedRate });
  const [engine] = useState(() => createEngine((patch) => setView((v) => ({ ...v, ...patch }))));
  useEffect(() => {
    engine.configure({ units, lang, onEnd });
  }, [engine, units, lang, onEnd]);
  // Sesler geç yüklenir (Chrome): liste gelince bir sonraki cümle doğru sesle kurulur.
  useEffect(() => {
    const sp = synth();
    if (!sp) return undefined;
    const warm = () => sp.getVoices();
    warm();
    sp.addEventListener?.('voiceschanged', warm);
    return () => sp.removeEventListener?.('voiceschanged', warm);
  }, []);
  useEffect(() => () => engine.dispose(), [engine]);

  const u = view.at >= 0 ? units[view.at] : null;
  return { ...engine, status: view.status, rate: view.rate, current: u ? { block: u.block, sentence: u.sentence } : null };
}
