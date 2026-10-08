// Mail provider port. Production: swap with an SMTP adapter via
// setMailProvider (createNodemailerProvider below builds one). Default:
// in-memory inbox so dev + tests work without creds.
//
// The port stays pure: it never reads process.env. SMTP host/port/auth are
// passed to createNodemailerProvider by the composition root of whichever
// service sends mail.

// `to` accepts a string or an array of strings; providers always receive a
// deduped array of trimmed, non-empty addresses.
const normalizeRecipients = (to) => {
  const list = Array.isArray(to) ? to : [to];
  const seen = new Set();
  list.forEach((entry) => {
    const value = typeof entry === 'string' ? entry.trim() : '';
    if (value) seen.add(value);
  });
  return Array.from(seen);
};

const recipientError = () => {
  const error = new Error('MAIL_RECIPIENT_REQUIRED');
  error.code = 'MAIL_RECIPIENT_REQUIRED';
  return error;
};

const memoryInbox = [];
const memoryProvider = {
  send: async ({ to, subject, html, text, metadata } = {}) => {
    const recipients = normalizeRecipients(to);
    if (!recipients.length) throw recipientError();
    const record = {
      to: recipients,
      subject: subject || '',
      html: html || null,
      text: text || null,
      metadata: metadata || null,
      at: new Date().toISOString(),
    };
    memoryInbox.push(record);
    return {
      messageId: `mem-mail-${memoryInbox.length}`,
      accepted: recipients,
    };
  },
  inbox: () => memoryInbox.slice(),
  flush: () => {
    memoryInbox.length = 0;
  },
};

let impl = memoryProvider;

export const setMailProvider = (newImpl) => {
  impl = newImpl || memoryProvider;
};
export const resetMailProvider = () => {
  impl = memoryProvider;
  memoryProvider.flush();
};
export const getMailProvider = () => impl;
export const sendMail = (args) =>
  impl.send({ ...(args || {}), to: normalizeRecipients(args?.to) });
export const mailInbox = () => (impl.inbox ? impl.inbox() : []);

// M4 (2026-09-10) — YUTULAN HATANIN TEŞHİS EDİLEBİLİR OLMASI İÇİN.
//
// Üç gönderim yolunun (document share, S13 SMS kredi uyarısı, S8 satış talebi)
// üçü de `sendMail` hatasını bilinçli olarak YUTUYOR — doğru karar, çünkü
// e-posta hiçbir akışın ön koşulu değil. Bedeli körlük: Brevo'nun günlük 300
// kotası dolduğunda ya da SMTP key yanlış olduğunda sistem sessizce
// gönderimsiz hâline döner ve tek belirti log'dur.
//
// `error.message` tek başına yetmez: nodemailer SMTP reddini `responseCode`
// (örn. 550) ve `response` (sunucunun tam yanıtı) alanlarında taşır, bağlantı
// / kimlik hatalarını ise `code` (EAUTH, ESOCKET, ETIMEDOUT) alanında.
// "Neden gitmedi" sorusunu ayırt eden şey bunlar.
export const describeMailError = (error) => {
  if (!error) return 'unknown';
  const parts = [error.message || 'unknown'];
  if (error.code) parts.push(`code=${error.code}`);
  if (error.responseCode) parts.push(`smtp=${error.responseCode}`);
  if (error.response) parts.push(`response=${String(error.response).slice(0, 200)}`);
  return parts.join(' | ');
};

// Real SMTP adapter. nodemailer is imported DYNAMICALLY so every service that
// imports app-shared does not pay for loading it; only the composition root
// that actually calls createNodemailerProvider(...).send() pulls it in.
//
// config:
//   from       - default From header, e.g. 'ODAK <no-reply@sinav.local>'
//   replyTo    - optional default Reply-To
//   transport  - nodemailer transport options object
//                ({ host, port, secure, auth: { user, pass } }).
//                If omitted, the remaining config keys are used as transport
//                options, so createNodemailerProvider({ host, port, auth })
//                also works.
export const createNodemailerProvider = (config = {}) => {
  const { from, replyTo, transport, ...rest } = config;
  const transportOptions = transport || rest;
  let transporterPromise = null;

  const getTransporter = () => {
    if (!transporterPromise) {
      transporterPromise = import('nodemailer').then((mod) => {
        const nodemailer = mod?.default || mod;
        return nodemailer.createTransport(transportOptions);
      });
      // A failed import / bad config must not poison the adapter forever.
      transporterPromise.catch(() => {
        transporterPromise = null;
      });
    }
    return transporterPromise;
  };

  return {
    send: async ({
      to,
      subject,
      html,
      text,
      metadata,
      from: fromOverride,
    } = {}) => {
      const recipients = normalizeRecipients(to);
      if (!recipients.length) throw recipientError();
      const transporter = await getTransporter();
      const info = await transporter.sendMail({
        from: fromOverride || from,
        replyTo: replyTo || undefined,
        to: recipients.join(', '),
        subject: subject || '',
        html: html || undefined,
        text: text || undefined,
        // nodemailer drops unknown top-level keys, so metadata rides along as
        // a custom header for provider-side tracing.
        headers: metadata
          ? { 'X-Sinav-Metadata': JSON.stringify(metadata) }
          : undefined,
      });
      return {
        messageId: info?.messageId || null,
        accepted: info?.accepted || recipients,
        rejected: info?.rejected || [],
        response: info?.response || null,
      };
    },
    verify: async () => {
      const transporter = await getTransporter();
      return transporter.verify();
    },
    close: async () => {
      if (!transporterPromise) return;
      const transporter = await transporterPromise.catch(() => null);
      transporterPromise = null;
      transporter?.close?.();
    },
  };
};
