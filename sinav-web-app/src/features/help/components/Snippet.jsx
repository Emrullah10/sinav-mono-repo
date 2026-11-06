import { searchSnippetParts } from '@sinav/domain';

// Arama sonucu özeti: eşleşen kelimeler <mark> ile (metin HTML olarak basılmaz).
export default function Snippet({ text }) {
  return (
    <span className="muted t-body-s" style={{ display: 'block' }}>
      {searchSnippetParts(text).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : p.text))}
    </span>
  );
}
