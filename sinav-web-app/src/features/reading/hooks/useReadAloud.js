import { useEffect, useMemo, useState } from 'react';
import { looksEnglish, splitSentences } from '@sinav/domain';
import api from '@api';
import { unwrap } from '@shared/utils/unwrap';

// Görünen hız etiketleri. Yapay zekâ sesi (audio) doğal hızında üretilir, oynatıcı hızı değişir (perde korunur);
// tarayıcı sesinin (speech) 1.0'ı okuma için hızlı olduğundan 1× orada 0.88'dir (mobille aynı).
export const READ_RATES = [
  { label: '0,8', audio: 0.8, speech: 0.72 },
  { label: '1', audio: 1, speech: 0.88 },
  { label: '1,2', audio: 1.2, speech: 1.04 },
];
let savedRate = 1;
// Sıradaki birkaç cümlenin sesi önceden istenir: sunucu üretip saklar, cümle arası beklenmez.
const AHEAD = 2;
const URL_MARGIN_MS = 10 * 60 * 1000;

const synth = () => (typeof window !== 'undefined' ? window.speechSynthesis : null);
export const readAloudSupported = () => typeof window !== 'undefined' && typeof window.Audio === 'function';

/** Yedek tarayıcı sesi: Edge "Natural", Safari "Premium/Enhanced", Chrome "Google". Eğlence sesleri (macOS) seçilmez. */
const pickVoice = (language) => {
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
  return (synth()?.getVoices() || [])
    .filter((v) => String(v.lang || '').replace('_', '-').toLowerCase() === want && score(v) > 0)
    .sort((a, b) => score(b) - score(a))[0] || null;
};

const unitsOf = (blocks, lang) => {
  const out = [];
  (blocks || []).forEach((b, block) => {
    splitSentences(String(b.x || '')).forEach((s, sentence) => {
      if (/[\p{L}\p{N}]/u.test(s.text)) out.push({ block, sentence, text: s.text, english: lang === 'en' || looksEnglish(s.text) });
    });
  });
  return out;
};

/**
 * React dışı okuma motoru (mobildeki ile aynı akış): İngilizce cümle sunucunun yapay zekâ sesiyle (<audio>),
 * diğerleri ve sunucu ulaşılamazsa tarayıcı sesiyle. Eski oturumun (gen) olayları yok sayılır.
 */
const createEngine = (emit) => {
  const s = { units: [], lang: 'en', code: null, position: null, onEnd: null, gen: 0, at: -1, status: 'idle', rate: savedRate, mode: 'cloud', base: null, audio: null, active: null, warm: new Map() };
  const set = (patch) => {
    Object.assign(s, patch);
    emit(patch);
  };
  const rate = () => READ_RATES[s.rate] || READ_RATES[1];

  const baseUrl = async () => {
    if (s.base && s.base.code === s.code && s.base.position === s.position && s.base.until > Date.now()) return s.base.url;
    const data = unwrap(await api.contentReadingSpeechUrl(s.code, s.position));
    s.base = { code: s.code, position: s.position, url: data.url, until: new Date(data.expiresAt).getTime() - URL_MARGIN_MS };
    s.warm.clear();
    return s.base.url;
  };
  const uriOf = (base, u) => `${base}/${u.block}/${u.sentence}`;

  const ensureAudio = () => {
    if (s.audio) return s.audio;
    const a = new window.Audio();
    a.preload = 'auto';
    a.addEventListener('ended', () => {
      const cur = s.active;
      if (!cur || cur.g !== s.gen) return;
      s.active = null;
      play(cur.i + 1, cur.g);
    });
    a.addEventListener('error', () => {
      const cur = s.active;
      if (!cur || cur.g !== s.gen) return;
      s.active = null;
      set({ mode: 'device' });
      play(cur.i, cur.g);
    });
    s.audio = a;
    return a;
  };

  const finish = () => {
    s.gen += 1;
    s.active = null;
    set({ at: -1, status: 'idle' });
    s.onEnd?.();
  };

  const speakDevice = (i, g) => {
    const sp = synth();
    if (!sp || typeof window.SpeechSynthesisUtterance !== 'function') {
      s.gen += 1;
      set({ status: 'paused' });
      return;
    }
    const unit = s.units[i];
    const u = new window.SpeechSynthesisUtterance(unit.text);
    u.lang = unit.english ? 'en-US' : 'tr-TR';
    const voice = pickVoice(u.lang);
    if (voice) u.voice = voice;
    u.rate = rate().speech;
    u.onend = () => {
      if (g === s.gen) play(i + 1, g);
    };
    u.onerror = (e) => {
      if (g !== s.gen || e.error === 'interrupted' || e.error === 'canceled') return;
      s.gen += 1;
      set({ status: 'paused' });
    };
    sp.speak(u);
  };

  // Önden ısıtma: sunucu sesi üretip saklar; tarayıcı da önbelleğe alır (Cache-Control: private).
  const prefetch = (base, i) => {
    for (let k = i + 1; k <= i + AHEAD && k < s.units.length; k += 1) {
      const u = s.units[k];
      const uri = uriOf(base, u);
      if (u.english && !s.warm.has(uri)) s.warm.set(uri, fetch(uri, { credentials: 'same-origin' }).then((r) => r.blob()).catch(() => null));
    }
  };

  async function play(i, g) {
    if (g !== s.gen) return;
    if (i >= s.units.length) {
      finish();
      return;
    }
    set({ at: i });
    const u = s.units[i];
    if (s.mode === 'cloud' && u.english) {
      let base = null;
      try {
        base = await baseUrl();
      } catch {
        base = null;
      }
      if (g !== s.gen) return;
      if (base) {
        const a = ensureAudio();
        s.active = { i, g };
        a.src = uriOf(base, u);
        a.playbackRate = rate().audio;
        a.play().catch((e) => {
          // Otomatik oynatma engeli değil, yükleme hatasıysa 'error' olayı zaten yedeğe geçirir.
          if (e?.name === 'NotAllowedError' && g === s.gen) {
            s.gen += 1;
            s.active = null;
            set({ status: 'paused' });
          }
        });
        prefetch(base, i);
        return;
      }
      set({ mode: 'device' });
    }
    speakDevice(i, g);
  }

  const silence = () => {
    s.active = null;
    synth()?.cancel();
    s.audio?.pause();
  };

  const start = (index) => {
    if (!s.units.length) return;
    const i = Math.min(Math.max(0, index), s.units.length - 1);
    s.gen += 1;
    silence();
    set({ at: i, status: 'playing', mode: 'cloud' });
    play(i, s.gen);
  };
  const halt = (status) => {
    s.gen += 1;
    silence();
    set(status === 'idle' ? { status, at: -1 } : { status });
  };

  return {
    configure: ({ units, lang, onEnd, code, position }) => Object.assign(s, { units, lang, onEnd, code, position }),
    playFrom: (blockIndex) => {
      const i = s.units.findIndex((u) => u.block >= blockIndex);
      if (i >= 0) start(i);
      else s.onEnd?.();
    },
    toggle: () => (s.status === 'playing' ? halt('paused') : start(s.at >= 0 ? s.at : 0)),
    skip: (delta) => start((s.at >= 0 ? s.at : 0) + delta),
    setRate: (index) => {
      savedRate = index;
      set({ rate: index });
      if (s.status !== 'playing') return;
      // Yapay zekâ sesinde hız anında değişir; tarayıcı sesinde cümle yeniden başlar.
      if (s.active && s.audio) s.audio.playbackRate = READ_RATES[index].audio;
      else start(s.at);
    },
    pause: () => {
      if (s.status === 'playing') halt('paused');
    },
    stop: () => halt('idle'),
    dispose: () => {
      s.gen += 1;
      silence();
      if (s.audio) {
        s.audio.removeAttribute('src');
        s.audio.load();
        s.audio = null;
      }
    },
  };
};

/**
 * Kitabı cümle cümle sesli okur: İngilizce cümleler sunucunun yapay zekâ sesiyle, diğerleri ve yedekte tarayıcı sesiyle.
 * Mobildeki useReadAloud ile aynı arayüz.
 * → { status, current: { block, sentence } | null, rate (READ_RATES sırası), playFrom, toggle, skip, setRate, pause, stop }
 */
export default function useReadAloud({ blocks, lang, onEnd, code, position }) {
  const units = useMemo(() => unitsOf(blocks, lang), [blocks, lang]);
  const [view, setView] = useState({ status: 'idle', at: -1, rate: savedRate });
  const [engine] = useState(() => createEngine((patch) => setView((v) => ({ ...v, ...patch }))));
  useEffect(() => {
    engine.configure({ units, lang, onEnd, code, position });
  }, [engine, units, lang, onEnd, code, position]);
  // Yedek tarayıcı sesleri geç yüklenir (Chrome): liste gelince doğru ses seçilir.
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
