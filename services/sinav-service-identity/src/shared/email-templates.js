// E-posta şablonları (tr). Düz metin + sade HTML; sistem yazı tipi yığını (tasarım §19.3).
const wrap = (title, bodyHtml, cta) => `<!doctype html><html lang="tr"><body style="margin:0;background:#F4F6F5;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#13232A">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="600" style="max-width:600px;background:#fff;border-radius:16px;border:1px solid #DAE1E0" cellpadding="0" cellspacing="0">
<tr><td style="padding:20px 28px;background:#0E6A6E;border-radius:16px 16px 0 0;color:#fff;font-size:20px;font-weight:700">ODAK</td></tr>
<tr><td style="padding:28px"><h1 style="margin:0 0 12px;font-size:22px">${title}</h1>${bodyHtml}${cta ? `<p style="margin:24px 0 0"><a href="${cta.url}" style="display:inline-block;background:#0E6A6E;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600">${cta.label}</a></p>` : ''}</td></tr>
<tr><td style="padding:16px 28px;font-size:12px;color:#5E6B70;border-top:1px solid #E9EDEC">Bu e-posta ODAK hesabınla ilgili gönderildi.</td></tr>
</table></td></tr></table></body></html>`;

const p = (s) => `<p style="margin:0 0 12px;font-size:16px;line-height:24px">${s}</p>`;
const formatCode = (c) => `${c.slice(0, 3)} ${c.slice(3)}`;
const money = (n) => `${Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`;

export const templates = {
  login_code: ({ code, purpose }) => {
    const sub = { login: 'Giriş', signup: 'Kayıt', password_reset: 'Şifre sıfırlama', account_deletion: 'Hesap silme', email_change: 'E-posta değişikliği' }[purpose] || 'Doğrulama';
    return {
      subject: `${sub} kodun: ${formatCode(code)}`,
      text: `${sub} kodun: ${formatCode(code)}\nKod 10 dakika geçerli. İsteği sen yapmadıysan bu e-postayı yok sayabilirsin.`,
      html: wrap(`${sub} kodun`, `<p style="font-size:34px;letter-spacing:6px;font-weight:700;margin:8px 0 16px">${formatCode(code)}</p>${p('Kod 10 dakika geçerli.')}${p('İsteği sen yapmadıysan bu e-postayı yok sayabilirsin.')}`),
    };
  },
  welcome: ({ appUrl, name }) => ({
    subject: 'Planın hazır, ilk adımın burada',
    text: `Merhaba${name ? ' ' + name : ''},\nHesabın hazır. Bugünkü planını görmek için: ${appUrl}/bugun`,
    html: wrap('Planın hazır, ilk adımın burada', p('Hesabın hazır. Bugünkü planında seni bekleyen görevler var.'), { url: `${appUrl}/bugun`, label: 'Bugünün planına git' }),
  }),
  payment_receipt: ({ planName, amount, appUrl, validUntil }) => ({
    subject: `Ödemen alındı · ${planName}`,
    text: `Ödemen alındı: ${planName}, ${money(amount)}.${validUntil ? ' Geçerlilik: ' + validUntil : ''}`,
    html: wrap('Ödemen alındı', p(`<strong>${planName}</strong> · ${money(amount)}`) + (validUntil ? p(`Geçerlilik: ${validUntil}`) : '') + p('e-Arşiv faturan hazır olunca bağlantı gönderilecek.'), { url: `${appUrl}/ben/abonelik`, label: 'Aboneliğimi yönet' }),
  }),
  payment_failed: ({ appUrl }) => ({
    subject: 'Ödemen alınamadı',
    text: 'Ödemen alınamadı. Kartını güncellersen devam edebilirsin; 3 günlük ek süren var.',
    html: wrap('Ödemen alınamadı', p('Kartını güncellersen kaldığın yerden devam edersin. 3 günlük ek süren var.'), { url: `${appUrl}/ben/abonelik`, label: 'Kartı güncelle' }),
  }),
  trial_ending: ({ date, appUrl }) => ({
    subject: `Ücretsiz deneme ${date} tarihinde bitiyor`,
    text: `Ücretsiz deneme ${date} tarihinde bitiyor; sonra 349 TL/ay. İstersen şimdi iptal edebilirsin.`,
    html: wrap(`Ücretsiz deneme ${date} tarihinde bitiyor`, p('Sonra 349 TL/ay. Devam etmek istemiyorsan şimdi iptal edebilirsin.'), { url: `${appUrl}/ben/abonelik`, label: 'Planımı yönet' }),
  }),
  subscription_canceled: ({ until, appUrl }) => ({
    subject: 'Aboneliğin iptal edildi',
    text: `Aboneliğin iptal edildi. Premium ${until} tarihine kadar sürer.`,
    html: wrap('Aboneliğin iptal edildi', p(`Premium <strong>${until}</strong> tarihine kadar sürer.`), { url: `${appUrl}/premium`, label: 'Geri dön' }),
  }),
  deletion_requested: ({ date, appUrl }) => ({
    subject: 'Hesabın 30 gün içinde silinecek',
    text: `Hesap silme talebini aldık. Hesabın ${date} tarihinde kalıcı olarak silinecek. Bu sürede giriş yaparsan işlem iptal olur.`,
    html: wrap('Hesabın 30 gün içinde silinecek', p(`Hesabın <strong>${date}</strong> tarihinde kalıcı olarak silinecek.`) + p('Bu sürede giriş yaparsan işlem iptal olur.'), { url: `${appUrl}/giris`, label: 'Silmeyi iptal et' }),
  }),
  data_export_ready: ({ url }) => ({
    subject: 'Verilerin hazır',
    text: `Verilerin hazır. İndirme bağlantısı 48 saat geçerli: ${url}`,
    html: wrap('Verilerin hazır', p('İndirme bağlantısı 48 saat geçerli.'), { url, label: 'Verilerimi indir' }),
  }),
  exam_7_days: ({ examName, appUrl }) => ({
    subject: `${examName}'ye 7 gün kaldı`,
    text: `${examName}'ye 7 gün kaldı. Son hafta planın hazır: tekrar ve iki mini deneme.`,
    html: wrap('Son hafta planın', p('Son hafta planın hazır: tekrar ve iki mini deneme.'), { url: `${appUrl}/bugun`, label: 'Planı aç' }),
  }),
  waitlist_confirm: ({ url }) => ({
    subject: 'Bekleme listesine katıldın',
    text: `Bekleme listesine katıldın. E-posta adresini onaylamak için: ${url}`,
    html: wrap('Bekleme listesine katıldın', p('Açılışta ilk sen haberdar olacaksın. E-posta adresini onaylar mısın?'), { url, label: 'Adresimi onayla' }),
  }),
  contact_received: ({ subject }) => ({
    subject: 'Mesajını aldık',
    text: `"${subject || 'Mesajın'}" konulu mesajını aldık; en kısa sürede dönüş yapacağız.`,
    html: wrap('Mesajını aldık', p('En kısa sürede dönüş yapacağız.')),
  }),
  generic: ({ title, body, appUrl, link }) => ({
    subject: title,
    text: `${title}\n${body}`,
    html: wrap(title, p(body), link ? { url: `${appUrl}${link}`, label: 'Aç' } : undefined),
  }),
};

export const render = (kind, data) => (templates[kind] || templates.generic)(data);
