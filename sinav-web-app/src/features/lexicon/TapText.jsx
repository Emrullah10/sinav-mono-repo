import { Fragment, useId, useMemo, useRef } from 'react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import { looksEnglish, sentenceWindow, splitSentences, tokenize } from '@sinav/domain';
import { notify } from '@shared/utils/notify';
import { useLexicon } from './LexiconProvider';
import styles from './Lexicon.module.scss';

const LONG_MS = 450;
const SAFE_URL = /^(https?:\/\/|mailto:|\/)/i;

// Parçalar: { text, bold?, italic? } dokunulur; { code } ve { href } düz gösterilir (cümle hesabına yine girer).
const parseRuns = (parts, lang) => {
  const list = splitSentences(parts.map((r) => r.text).join(''));
  const english = list.map((s) => lang === 'en' || looksEnglish(s.text));
  const pieces = [];
  let offset = 0;
  for (const r of parts) {
    pieces.push({ ...r, tokens: r.code || r.href ? null : tokenize(r.text, { sentences: list, offset }).tokens });
    offset += r.text.length;
  }
  const enList = [];
  const enIndex = list.map((s, i) => (english[i] ? enList.push(s.text) - 1 : -1));
  return { english, pieces, enList, enIndex };
};

/**
 * Dokunulabilir metin (web): kelimeye tıkla → sözlük, basılı tut → cümle çevirisi.
 * text | runs (Markdown satırı parçaları). lang: 'en' (içerik) | 'auto' (karışık metinde yalnız İngilizce cümleler).
 * words / sentences: açık mı. sentences kapalıyken basılı tutunca `sentenceLock` (i18n anahtarı) gösterilir.
 */
export default function TapText({ text, runs, lang = 'en', words = true, sentences = true, sentenceLock, onAsk }) {
  const lex = useLexicon();
  const owner = useId();
  const { t } = useTranslation();
  const press = useRef(null);
  const parts = useMemo(() => runs || [{ text: String(text ?? '') }], [runs, text]);
  const parsed = useMemo(() => parseRuns(parts, lang), [parts, lang]);

  const enabled = lex && (words || sentences || sentenceLock);
  const active = enabled && lex.active?.owner === owner ? lex.active : null;
  const payload = (si) => {
    const w = parsed.enIndex[si] >= 0 ? sentenceWindow(parsed.enList, parsed.enIndex[si]) : null;
    return w ? { sentences: w.sentences, index: w.index } : { sentences: null, index: -1 };
  };
  const openWord = (key, tok, el) =>
    lex.open({ kind: 'word', word: tok.text, owner, token: key, sentence: tok.sentence, ...payload(tok.sentence), allowSentence: sentences, onAsk, anchor: el.getBoundingClientRect() });
  const openSentence = (tok, el) => {
    if (!sentences) {
      if (sentenceLock) notify(t(sentenceLock), 'info');
      return;
    }
    const p = payload(tok.sentence);
    if (!p.sentences) {
      notify(t('lex.sentence.tooLong'), 'info');
      return;
    }
    lex.open({ kind: 'sentence', owner, sentence: tok.sentence, ...p, onAsk, anchor: el.getBoundingClientRect() });
  };

  // Basılı tutma: fare ve dokunmada aynı (450 ms, 8 px'ten fazla kayarsa iptal); ardından gelen tıklama yutulur.
  const down = (e, tok) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    clearTimeout(press.current?.timer);
    const el = e.currentTarget;
    const p = { x: e.clientX, y: e.clientY, fired: false };
    p.timer = setTimeout(() => { p.fired = true; openSentence(tok, el); }, LONG_MS);
    press.current = p;
  };
  const move = (e) => {
    const p = press.current;
    if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) clearTimeout(p.timer);
  };
  const up = () => {
    const p = press.current;
    if (p && !p.fired) clearTimeout(p.timer);
  };
  const click = (e, key, tok) => {
    if (press.current?.fired) {
      press.current = null;
      e.preventDefault();
      return;
    }
    if (words) openWord(key, tok, e.currentTarget);
  };

  const renderTokens = (tokens, prefix) =>
    tokens.map((tok, i) => {
      const key = `${prefix}.${i}`;
      const en = tok.sentence >= 0 && parsed.english[tok.sentence];
      const hl = active?.kind === 'word' && active.token === key ? styles.hlWord : active?.kind === 'sentence' && active.sentence === tok.sentence ? styles.hlSentence : null;
      if (!tok.word || !en) return hl ? <span key={key} className={hl}>{tok.text}</span> : <Fragment key={key}>{tok.text}</Fragment>;
      return (
        <span
          key={key}
          data-lx=""
          className={classNames(styles.w, words && styles.tappable, hl)}
          onClick={(e) => click(e, key, tok)}
          onPointerDown={(e) => down(e, tok)}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onContextMenu={(e) => press.current?.fired && e.preventDefault()}
        >
          {tok.text}
        </span>
      );
    });

  return (
    <>
      {parsed.pieces.map((p, r) => {
        if (p.href) return SAFE_URL.test(p.href) ? <a key={r} href={p.href} target={p.href.startsWith('/') ? undefined : '_blank'} rel="noopener noreferrer">{p.text}</a> : <Fragment key={r}>{p.text}</Fragment>;
        if (p.code) return <code key={r}>{p.text}</code>;
        const body = enabled ? renderTokens(p.tokens, r) : p.text;
        if (p.bold) return <strong key={r}>{body}</strong>;
        if (p.italic) return <em key={r}>{body}</em>;
        return <Fragment key={r}>{body}</Fragment>;
      })}
    </>
  );
}
