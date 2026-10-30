import { Fragment } from 'react';
import TapText from '@features/lexicon/TapText';
import styles from './Markdown.module.scss';

// Küçük, güvenli Markdown çevirici: HTML üretmez, React düğümleri üretir (dangerouslySetInnerHTML yok).
// Destek: # başlıklar, paragraf, - / * / 1. listeler, **kalın**, *italik*, `kod`, [metin](http/https/mailto bağlantı), --- ayırıcı, > alıntı.
const SAFE_URL = /^(https?:\/\/|mailto:|\/)/i;

const inline = (text, keyPrefix = 'i') => {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyPrefix}-${n++}`;
    if (tok.startsWith('**')) out.push(<strong key={k}>{inline(tok.slice(2, -2), k)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('[')) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      if (mm && SAFE_URL.test(mm[2])) out.push(<a key={k} href={mm[2]} target={mm[2].startsWith('/') ? undefined : '_blank'} rel="noopener noreferrer">{mm[1]}</a>);
      else out.push(mm ? mm[1] : tok);
    } else out.push(<em key={k}>{inline(tok.slice(1, -1), k)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.map((x, i) => (typeof x === 'string' ? <Fragment key={`${keyPrefix}s${i}`}>{x}</Fragment> : x));
};

const parse = (src) => {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) { blocks.push({ type: 'h', level: m[1].length, text: m[2] }); i++; continue; }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { blocks.push({ type: 'hr' }); i++; continue; }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push({ type: 'quote', text: buf.join(' ') });
      continue;
    }
    if (/^\s*([-*])\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const re = ordered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
      const items = [];
      while (i < lines.length && re.test(lines[i])) items.push(re.exec(lines[i++])[1]);
      blocks.push({ type: ordered ? 'ol' : 'ul', items });
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>\s?|\s*[-*]\s+|\s*\d+[.)]\s+|-{3,}\s*$)/.test(lines[i])) buf.push(lines[i++]);
    if (!buf.length) { buf.push(lines[i++]); }
    blocks.push({ type: 'p', text: buf.join(' ') });
  }
  return blocks;
};

// Dokun-çevir için satırı düz parçalara ayırır (iç içe biçim tek düzeye iner): { text, bold?, italic?, code?, href? }.
const runsOf = (text) => {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('**')) out.push({ text: tok.slice(2, -2).replace(/\*/g, ''), bold: true });
    else if (tok.startsWith('`')) out.push({ text: tok.slice(1, -1), code: true });
    else if (tok.startsWith('[')) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      out.push(mm ? { text: mm[1], href: mm[2] } : { text: tok });
    } else out.push({ text: tok.slice(1, -1), italic: true });
    last = m.index + tok.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
};

/**
 * lexicon: dokun-çevir ayarı (TapText özellikleri: { lang, words, sentences, sentenceLock, onAsk }); verilmezse düz Markdown.
 */
export default function Markdown({ source, className, lexicon }) {
  const blocks = parse(source);
  const line = (text, key) => (lexicon ? <TapText runs={runsOf(text)} {...lexicon} /> : inline(text, key));
  return (
    <div className={`${styles.md} ${className || ''}`}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h': { const H = `h${Math.min(b.level + 1, 5)}`; return <H key={i}>{line(b.text, `b${i}`)}</H>; }
          case 'hr': return <hr key={i} />;
          case 'quote': return <blockquote key={i}>{line(b.text, `b${i}`)}</blockquote>;
          case 'ul': return <ul key={i}>{b.items.map((t, j) => <li key={j}>{line(t, `b${i}-${j}`)}</li>)}</ul>;
          case 'ol': return <ol key={i}>{b.items.map((t, j) => <li key={j}>{line(t, `b${i}-${j}`)}</li>)}</ol>;
          default: return <p key={i}>{line(b.text, `b${i}`)}</p>;
        }
      })}
    </div>
  );
}
