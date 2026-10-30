import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import LexiconPopover from './LexiconPopover';

const LexiconContext = createContext(null);

/**
 * Dokun-çevir bağlamı (kökte bir kez). TapText açar:
 *   open({ kind: 'word', word, owner, token, sentence, sentences, index, allowSentence, onAsk, anchor })
 *   open({ kind: 'sentence', owner, sentence, sentences, index, onAsk, anchor })
 * anchor: tıklanan kelimenin DOMRect'i (geniş ekranda pencere yanında açılır; dar ekranda alttan sayfa).
 * onAsk(metin): verilirse "Öğretmene sor" yeni sohbet yerine bunu çağırır (sohbet sayfasında aynı sohbete gönderir).
 */
export function LexiconProvider({ children }) {
  const [req, setReq] = useState(null);
  const open = useCallback((r) => setReq(r), []);
  const close = useCallback(() => setReq(null), []);
  const value = useMemo(() => ({ open, close, active: req }), [open, close, req]);
  return (
    <LexiconContext.Provider value={value}>
      {children}
      {req && <LexiconPopover req={req} onSwitch={setReq} onClose={close} />}
    </LexiconContext.Provider>
  );
}

export const useLexicon = () => useContext(LexiconContext);
