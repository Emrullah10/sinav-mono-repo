// E-posta şablonları (tr/en). Düz metin + sade HTML; sistem yazı tipi yığını (tasarım §19.3).
const wrap = (title, bodyHtml, cta, loc = 'tr') => `<!doctype html><html lang="${loc}"><body style="margin:0;background:#F4F6F5;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#13232A">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="600" style="max-width:600px;background:#fff;border-radius:16px;border:1px solid #DAE1E0" cellpadding="0" cellspacing="0">
<tr><td style="padding:20px 28px;background:#0E6A6E;border-radius:16px 16px 0 0;color:#fff;font-size:20px;font-weight:700">ODAK</td></tr>
<tr><td style="padding:28px"><h1 style="margin:0 0 12px;font-size:22px">${title}</h1>${bodyHtml}${cta ? `<p style="margin:24px 0 0"><a href="${cta.url}" style="display:inline-block;background:#0E6A6E;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600">${cta.label}</a></p>` : ''}</td></tr>
<tr><td style="padding:16px 28px;font-size:12px;color:#5E6B70;border-top:1px solid #E9EDEC">${loc === 'en' ? 'This email was sent regarding your ODAK account.' : 'Bu e-posta ODAK hesabınla ilgili gönderildi.'}</td></tr>
</table></td></tr></table></body></html>`;

const p = (s) => `<p style="margin:0 0 12px;font-size:16px;line-height:24px">${s}</p>`;
const formatCode = (c) => `${c.slice(0, 3)} ${c.slice(3)}`;
const money = (n, loc = 'tr') => loc === 'en' ? `${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TRY` : `${Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`;
/** Desteklenmeyen/boş dil → 'tr'. */
export const normLocale = (l) => (l === 'en' ? 'en' : 'tr');

export const templates = {
  login_code: ({ code, purpose }, loc) => {
    const en = loc === 'en';
    const sub = (en
      ? { login: 'login', signup: 'sign-up', password_reset: 'password reset', account_deletion: 'account deletion', email_change: 'email change' }
      : { login: 'Giriş', signup: 'Kayıt', password_reset: 'Şifre sıfırlama', account_deletion: 'Hesap silme', email_change: 'E-posta değişikliği' })[purpose] || (en ? 'verification' : 'Doğrulama');
    return en ? {
      subject: `Your ${sub} code: ${formatCode(code)}`,
      text: `Your ${sub} code: ${formatCode(code)}\nThe code is valid for 10 minutes. If you didn't request it, you can ignore this email.`,
      html: wrap(`Your ${sub} code`, `<p style="font-size:34px;letter-spacing:6px;font-weight:700;margin:8px 0 16px">${formatCode(code)}</p>${p('The code is valid for 10 minutes.')}${p("If you didn't request it, you can ignore this email.")}`, undefined, loc),
    } : {
      subject: `${sub} kodun: ${formatCode(code)}`,
      text: `${sub} kodun: ${formatCode(code)}\nKod 10 dakika geçerli. İsteği sen yapmadıysan bu e-postayı yok sayabilirsin.`,
      html: wrap(`${sub} kodun`, `<p style="font-size:34px;letter-spacing:6px;font-weight:700;margin:8px 0 16px">${formatCode(code)}</p>${p('Kod 10 dakika geçerli.')}${p('İsteği sen yapmadıysan bu e-postayı yok sayabilirsin.')}`),
    };
  },
  welcome: ({ appUrl, name }, loc) => loc === 'en' ? {
    subject: 'Your plan is ready, here is your first step',
    text: `Hi${name ? ' ' + name : ''},\nYour account is ready. See today's plan: ${appUrl}/today`,
    html: wrap('Your plan is ready, here is your first step', p("Your account is ready. There are tasks waiting for you in today's plan."), { url: `${appUrl}/today`, label: "Go to today's plan" }, loc),
  } : {
    subject: 'Planın hazır, ilk adımın burada',
    text: `Merhaba${name ? ' ' + name : ''},\nHesabın hazır. Bugünkü planını görmek için: ${appUrl}/today`,
    html: wrap('Planın hazır, ilk adımın burada', p('Hesabın hazır. Bugünkü planında seni bekleyen görevler var.'), { url: `${appUrl}/today`, label: 'Bugünün planına git' }),
  },
  payment_receipt: ({ planName, amount, appUrl, validUntil }, loc) => loc === 'en' ? {
    subject: `Payment received · ${planName}`,
    text: `Payment received: ${planName}, ${money(amount, loc)}.${validUntil ? ' Valid until: ' + validUntil : ''}`,
    html: wrap('Payment received', p(`<strong>${planName}</strong> · ${money(amount, loc)}`) + (validUntil ? p(`Valid until: ${validUntil}`) : '') + p("We'll send a link once your e-invoice is ready."), { url: `${appUrl}/me/subscription`, label: 'Manage my subscription' }, loc),
  } : {
    subject: `Ödemen alındı · ${planName}`,
    text: `Ödemen alındı: ${planName}, ${money(amount)}.${validUntil ? ' Geçerlilik: ' + validUntil : ''}`,
    html: wrap('Ödemen alındı', p(`<strong>${planName}</strong> · ${money(amount)}`) + (validUntil ? p(`Geçerlilik: ${validUntil}`) : '') + p('e-Arşiv faturan hazır olunca bağlantı gönderilecek.'), { url: `${appUrl}/me/subscription`, label: 'Aboneliğimi yönet' }),
  },
  payment_failed: ({ appUrl }, loc) => loc === 'en' ? {
    subject: "We couldn't process your payment",
    text: "We couldn't process your payment. Update your card to keep going; you have a 3-day grace period.",
    html: wrap("We couldn't process your payment", p("Update your card and pick up where you left off. You have a 3-day grace period."), { url: `${appUrl}/me/subscription`, label: 'Update card' }, loc),
  } : {
    subject: 'Ödemen alınamadı',
    text: 'Ödemen alınamadı. Kartını güncellersen devam edebilirsin; 3 günlük ek süren var.',
    html: wrap('Ödemen alınamadı', p('Kartını güncellersen kaldığın yerden devam edersin. 3 günlük ek süren var.'), { url: `${appUrl}/me/subscription`, label: 'Kartı güncelle' }),
  },
  trial_ending: ({ date, appUrl }, loc) => loc === 'en' ? {
    subject: `Your free trial ends on ${date}`,
    text: `Your free trial ends on ${date}; after that it's 349 TRY/month. You can cancel now if you like.`,
    html: wrap(`Your free trial ends on ${date}`, p("After that it's 349 TRY/month. If you don't want to continue, you can cancel now."), { url: `${appUrl}/me/subscription`, label: 'Manage my plan' }, loc),
  } : {
    subject: `Ücretsiz deneme ${date} tarihinde bitiyor`,
    text: `Ücretsiz deneme ${date} tarihinde bitiyor; sonra 349 TL/ay. İstersen şimdi iptal edebilirsin.`,
    html: wrap(`Ücretsiz deneme ${date} tarihinde bitiyor`, p('Sonra 349 TL/ay. Devam etmek istemiyorsan şimdi iptal edebilirsin.'), { url: `${appUrl}/me/subscription`, label: 'Planımı yönet' }),
  },
  subscription_canceled: ({ until, appUrl }, loc) => loc === 'en' ? {
    subject: 'Your subscription was canceled',
    text: `Your subscription was canceled. Premium stays active until ${until}.`,
    html: wrap('Your subscription was canceled', p(`Premium stays active until <strong>${until}</strong>.`), { url: `${appUrl}/premium`, label: 'Come back' }, loc),
  } : {
    subject: 'Aboneliğin iptal edildi',
    text: `Aboneliğin iptal edildi. Premium ${until} tarihine kadar sürer.`,
    html: wrap('Aboneliğin iptal edildi', p(`Premium <strong>${until}</strong> tarihine kadar sürer.`), { url: `${appUrl}/premium`, label: 'Geri dön' }),
  },
  deletion_requested: ({ date, appUrl }, loc) => loc === 'en' ? {
    subject: 'Your account will be deleted within 30 days',
    text: `We received your account deletion request. Your account will be permanently deleted on ${date}. If you sign in before then, the request is canceled.`,
    html: wrap('Your account will be deleted within 30 days', p(`Your account will be permanently deleted on <strong>${date}</strong>.`) + p('If you sign in before then, the request is canceled.'), { url: `${appUrl}/sign-in`, label: 'Cancel deletion' }, loc),
  } : {
    subject: 'Hesabın 30 gün içinde silinecek',
    text: `Hesap silme talebini aldık. Hesabın ${date} tarihinde kalıcı olarak silinecek. Bu sürede giriş yaparsan işlem iptal olur.`,
    html: wrap('Hesabın 30 gün içinde silinecek', p(`Hesabın <strong>${date}</strong> tarihinde kalıcı olarak silinecek.`) + p('Bu sürede giriş yaparsan işlem iptal olur.'), { url: `${appUrl}/sign-in`, label: 'Silmeyi iptal et' }),
  },
  data_export_ready: ({ url }, loc) => loc === 'en' ? {
    subject: 'Your data is ready',
    text: `Your data is ready. The download link is valid for 48 hours: ${url}`,
    html: wrap('Your data is ready', p('The download link is valid for 48 hours.'), { url, label: 'Download my data' }, loc),
  } : {
    subject: 'Verilerin hazır',
    text: `Verilerin hazır. İndirme bağlantısı 48 saat geçerli: ${url}`,
    html: wrap('Verilerin hazır', p('İndirme bağlantısı 48 saat geçerli.'), { url, label: 'Verilerimi indir' }),
  },
  exam_7_days: ({ examName, appUrl }, loc) => loc === 'en' ? {
    subject: `7 days until ${examName}`,
    text: `7 days until ${examName}. Your final-week plan is ready: review and two mini mock exams.`,
    html: wrap('Your final-week plan', p('Your final-week plan is ready: review and two mini mock exams.'), { url: `${appUrl}/today`, label: 'Open plan' }, loc),
  } : {
    subject: `${examName}'ye 7 gün kaldı`,
    text: `${examName}'ye 7 gün kaldı. Son hafta planın hazır: tekrar ve iki mini deneme.`,
    html: wrap('Son hafta planın', p('Son hafta planın hazır: tekrar ve iki mini deneme.'), { url: `${appUrl}/today`, label: 'Planı aç' }),
  },
  waitlist_confirm: ({ url }, loc) => loc === 'en' ? {
    subject: "You're on the waitlist",
    text: `You're on the waitlist. Confirm your email address here: ${url}`,
    html: wrap("You're on the waitlist", p("You'll be the first to know when we launch. Can you confirm your email address?"), { url, label: 'Confirm my address' }, loc),
  } : {
    subject: 'Bekleme listesine katıldın',
    text: `Bekleme listesine katıldın. E-posta adresini onaylamak için: ${url}`,
    html: wrap('Bekleme listesine katıldın', p('Açılışta ilk sen haberdar olacaksın. E-posta adresini onaylar mısın?'), { url, label: 'Adresimi onayla' }),
  },
  contact_received: ({ subject }, loc) => loc === 'en' ? {
    subject: 'We got your message',
    text: `We received your message "${subject || 'Your message'}"; we'll get back to you soon.`,
    html: wrap('We got your message', p("We'll get back to you soon."), undefined, loc),
  } : {
    subject: 'Mesajını aldık',
    text: `"${subject || 'Mesajın'}" konulu mesajını aldık; en kısa sürede dönüş yapacağız.`,
    html: wrap('Mesajını aldık', p('En kısa sürede dönüş yapacağız.')),
  },
  generic: ({ title, body, appUrl, link }, loc) => ({
    subject: title,
    text: `${title}\n${body}`,
    html: wrap(title, p(body), link ? { url: `${appUrl}${link}`, label: loc === 'en' ? 'Open' : 'Aç' } : undefined, loc),
  }),
};

/** locale: 'tr' (varsayılan) | 'en'. */
export const render = (kind, data, locale = 'tr') => (templates[kind] || templates.generic)(data, normLocale(locale));
