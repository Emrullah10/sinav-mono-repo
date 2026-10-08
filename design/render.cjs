// Kullanım: node render.cjs jobs.json   ([{src, html_out, png_out}])  — yazı tipleri yüklenince tam sayfa görüntü alır
const { chromium } = require(process.env.PW || "playwright-core");
const fs = require("fs");
(async () => {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const browser = await chromium.launch();
  const ctxs = {};
  for (const j of jobs) {
    const w = j.width || 1280, sc = j.scale || 1.25, k = w + "x" + sc;
    ctxs[k] = ctxs[k] || await browser.newContext({ viewport: { width: w, height: w < 600 ? 844 : 900 }, deviceScaleFactor: sc, isMobile: w < 600, hasTouch: w < 600 });
    const page = await ctxs[k].newPage();
    try {
      await page.goto("file://" + j.src, { waitUntil: "networkidle", timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      let html = await page.content();
      html = html.replace(/<script id="odak-fix">[\s\S]*?<\/script>/, "");
      fs.writeFileSync(j.html_out, "<!DOCTYPE html>\n" + html.replace(/^<!DOCTYPE html>\s*/i, ""));
      const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
      await page.setViewportSize({ width: j.width || 1280, height: Math.min(h, 16000) });
      await page.waitForTimeout(300);
      await page.screenshot({ path: j.png_out });
      console.log("ok", j.png_out.split("/").pop());
    } catch (e) { console.log("hata", j.png_out.split("/").pop(), String(e).slice(0, 120)); }
    await page.close();
  }
  await browser.close();
})();
