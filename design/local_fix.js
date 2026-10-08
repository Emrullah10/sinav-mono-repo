// Denetim kurallarına aykırı metin/stilleri tarayıcıda düzeltir (Stitch kredisi harcamadan).
(function () {
  const TEXT = [
    [/ODAK\s*YDS/g, "ODAK"],
    [/YDS Platformunun/g, "ODAK'ın"],
    [/YDS Platformu\b/g, "ODAK"],
    [/\b2025-YDS/g, "2026-YDS"],
    [/(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+2025/g, "$1 2026"],
    [/2025-YDS\/\d/g, "2026-YDS/2"],
    [/\b2025\/(\d)/g, "2026/$1"],
    [/(\d+[.,]\d+)\s*Net\b/g, "$1 Puan"],
    [/(\d+)\s*Net\b/g, "$1 Doğru"],
    [/\bNet Puan(ı)?\b/g, "Puan$1"],
    [/\bNet Sayısı\b/g, "Doğru Sayısı"],
    [/\bNet Çözüm/g, "Açık Çözüm"],
    [/\bNet &/g, "Puan &"],
    [/\bNet Türkçe/g, "Açık Türkçe"],
    [/[\u{1F300}-\u{1FAFF}]\uFE0F?/gu, ""],
    [/\bNet\b(?=\s*[:<]|\s*$)/g, "Doğru"],
  ];
  const JARGON = /IndexedDB|256-bit|şifreli oturum|Oturum Protokol|Uçtan uca şifrel/i;
  const EN_PAREN = /\s*\((?:[A-Z][A-Za-z0-9]+[ \/&,.-]*){1,6}\)/g;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const drop = new Set();
  for (const n of nodes) {
    let t = n.nodeValue;
    for (const [re, to] of TEXT) t = t.replace(re, to);
    if (n.parentElement && n.parentElement.closest("h1,h2,h3,h4,h5,nav,header,label,button")) t = t.replace(EN_PAREN, "");
    if (t !== n.nodeValue) n.nodeValue = t;
    if (JARGON.test(t)) {
      let el = n.parentElement;
      while (el.parentElement && el.parentElement !== document.body && el.parentElement.textContent.trim().length < 170) el = el.parentElement;
      drop.add(el);
    }
  }
  drop.forEach((el) => el.remove());
  document.title = document.title.replace(/ODAK\s*YDS/g, "ODAK").replace(/YDS Platformu?/g, "ODAK");
  // içi boşalan parantez spanlarını temizle
  document.querySelectorAll("h1 span,h2 span,h3 span,h4 span").forEach((s) => { if (!s.textContent.trim() && !s.children.length) s.remove(); });

  // gradyan ve cam efekti
  document.querySelectorAll("[class]").forEach((el) => {
    const cl = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean);
    const grad = cl.some((c) => /(^|:)bg-gradient-to-/.test(c));
    const blur = cl.some((c) => /(^|:)backdrop-/.test(c));
    if (!grad && !blur) return;
    const out = [];
    for (const c of cl) {
      if (/(^|:)(bg-gradient-to-|backdrop-)/.test(c)) continue;
      if (grad && /(^|:)from-/.test(c)) { out.push(c.replace(/from-/, "bg-")); continue; }
      if (grad && /(^|:)(via|to)-/.test(c)) continue;
      out.push(blur ? c.replace(/^(bg-[\w-]+)\/\d+$/, "$1") : c);
    }
    el.setAttribute("class", out.join(" "));
  });
  document.querySelectorAll("[style]").forEach((el) => {
    if (/gradient\(/.test(el.getAttribute("style"))) el.setAttribute("style", el.getAttribute("style").replace(/(?:repeating-)?(?:linear|radial|conic)-gradient\((?:[^()]|\([^()]*\))*\)/g, "none"));
    el.style.backdropFilter = "";
  });
  // SVG gradyan dolguları -> ilk durak rengi, düşük opaklık
  document.querySelectorAll("linearGradient,radialGradient").forEach((g) => {
    const st = g.querySelector("stop"); if (!st) return;
    const col = st.getAttribute("stop-color") || (st.style && st.style.stopColor) || "currentColor";
    document.querySelectorAll(`[fill="url(#${g.id})"],[stroke="url(#${g.id})"]`).forEach((el) => {
      ["fill", "stroke"].forEach((a) => { if (el.getAttribute(a) === `url(#${g.id})`) { el.setAttribute(a, col); if (a === "fill") el.setAttribute("fill-opacity", "0.12"); } });
    });
    g.remove();
  });
  document.querySelectorAll("style").forEach((s) => {
    if (s.id === "odak-fix") return;
    s.textContent = s.textContent
      .replace(/(?:repeating-)?(?:linear|radial|conic)-gradient\((?:[^()]|\([^()]*\))*\)/g, "none")
      .replace(/(-webkit-)?backdrop-filter\s*:[^;}]*;?/g, "");
  });
})();
