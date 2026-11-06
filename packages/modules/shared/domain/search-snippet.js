// Yardım araması: content servisinin ts_headline parçası (yalnız <mark>…</mark> etiketli düz metin) → güvenli parçalar.
// HTML olarak basılmaz; istemci vurguyu kendi bileşeniyle çizer. Markdown işaretleri sadeleştirilir.
export const searchSnippetParts = (snippet = '') =>
  String(snippet)
    .replace(/[#*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(<mark>.*?<\/mark>)/g)
    .filter(Boolean)
    .map((p) => (p.startsWith('<mark>') ? { text: p.slice(6, -7), hit: true } : { text: p.replace(/<[^>]*>/g, ''), hit: false }));
