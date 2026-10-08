import { DomainError, withTransaction, writeAudit } from 'app-shared';
import { toNum, iso, upper, esc, fmtMoney, fmtDateTr, findUser, round2, LIVE_STATUSES } from '../shared/helpers.js';
import { loadPriceByKey, evaluateCoupon, splitVat } from '../shared/pricing.js';
import { brandForBin } from '../ports/payment-fake.js';

const PROFILE_SQL = `SELECT billing_profile_id AS id, billing_profile_code AS code, billing_profile_party_type AS "partyType", billing_profile_full_name AS "fullName",
  billing_profile_company_title AS "companyTitle", billing_profile_tax_office AS "taxOffice", billing_profile_tax_number AS "taxNumber",
  billing_profile_national_id AS "nationalId", billing_profile_email AS email, billing_profile_address_line AS "addressLine",
  billing_profile_district AS district, billing_profile_city AS city, billing_profile_postal_code AS "postalCode", billing_profile_country AS country
  FROM billing.billing_profile WHERE billing_profile_user_account_id = $1 AND billing_profile_is_default`;

const maskId = (v) => (v ? `${'*'.repeat(Math.max(0, v.length - 4))}${v.slice(-4)}` : null);
export const profileDto = (p) => p && ({
  partyType: p.partyType, fullName: p.fullName, companyTitle: p.companyTitle, taxOffice: p.taxOffice, taxNumber: p.taxNumber,
  nationalIdMasked: maskId(p.nationalId), hasNationalId: !!p.nationalId, email: p.email, addressLine: p.addressLine, district: p.district,
  city: p.city, postalCode: p.postalCode, country: p.country,
});

const str = (v, max) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));

/** Yalnız doğrular; kayıt `saveProfile` ile. `existing` verilirse nationalId boş bırakılınca korunur. */
export const normalizeProfile = (input, existing = null) => {
  const i = input || {};
  const partyType = i.partyType === 'corporate' ? 'corporate' : i.partyType === 'individual' || !i.partyType ? 'individual' : null;
  if (!partyType) throw new DomainError('BILLING_PROFILE_INVALID', 'partyType invalid', { field: 'partyType' });
  const out = {
    partyType, fullName: str(i.fullName, 150), companyTitle: str(i.companyTitle, 200), taxOffice: str(i.taxOffice, 100), taxNumber: str(i.taxNumber, 20),
    nationalId: i.nationalId === undefined ? existing?.nationalId ?? null : str(i.nationalId, 11), email: str(i.email, 254),
    addressLine: str(i.addressLine, 300), district: str(i.district, 80), city: str(i.city, 80), postalCode: str(i.postalCode, 10),
    country: str(i.country, 2)?.toUpperCase() || 'TR',
  };
  const need = (field) => { if (!out[field]) throw new DomainError('BILLING_PROFILE_INVALID', `${field} required`, { field }); };
  ['fullName', 'addressLine', 'city'].forEach(need);
  if (partyType === 'corporate') ['companyTitle', 'taxOffice', 'taxNumber'].forEach(need);
  if (out.nationalId && !/^\d{11}$/.test(out.nationalId)) throw new DomainError('BILLING_PROFILE_INVALID', 'nationalId must be 11 digits', { field: 'nationalId' });
  if (out.taxNumber && !/^\d{10,11}$/.test(out.taxNumber)) throw new DomainError('BILLING_PROFILE_INVALID', 'taxNumber must be 10-11 digits', { field: 'taxNumber' });
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(out.email)) throw new DomainError('BILLING_PROFILE_INVALID', 'email invalid', { field: 'email' });
  return out;
};

export const loadProfile = async (run, userId) => (await run(PROFILE_SQL, [Number(userId)])).rows[0] || null;

export const saveProfile = async (tx, { caller, userId, data }) => {
  const sql = `INSERT INTO billing.billing_profile (billing_profile_tenant_code, billing_profile_organization_id, billing_profile_user_account_id, billing_profile_party_type,
      billing_profile_full_name, billing_profile_company_title, billing_profile_tax_office, billing_profile_tax_number, billing_profile_national_id, billing_profile_email,
      billing_profile_address_line, billing_profile_district, billing_profile_city, billing_profile_postal_code, billing_profile_country, billing_profile_is_default,
      billing_profile_created_by, billing_profile_updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true,$3,$3)
    ON CONFLICT (billing_profile_user_account_id) WHERE billing_profile_is_default DO UPDATE SET
      billing_profile_party_type=EXCLUDED.billing_profile_party_type, billing_profile_full_name=EXCLUDED.billing_profile_full_name,
      billing_profile_company_title=EXCLUDED.billing_profile_company_title, billing_profile_tax_office=EXCLUDED.billing_profile_tax_office,
      billing_profile_tax_number=EXCLUDED.billing_profile_tax_number, billing_profile_national_id=EXCLUDED.billing_profile_national_id,
      billing_profile_email=EXCLUDED.billing_profile_email, billing_profile_address_line=EXCLUDED.billing_profile_address_line,
      billing_profile_district=EXCLUDED.billing_profile_district, billing_profile_city=EXCLUDED.billing_profile_city,
      billing_profile_postal_code=EXCLUDED.billing_profile_postal_code, billing_profile_country=EXCLUDED.billing_profile_country, billing_profile_updated_by=$3`;
  const d = data;
  await tx.query(sql, [Number(caller.callerTenantCode), Number(caller.callerOrganizationId), Number(userId), d.partyType, d.fullName, d.companyTitle, d.taxOffice,
    d.taxNumber, d.nationalId, d.email, d.addressLine, d.district, d.city, d.postalCode, d.country]);
};

export const snapshotOf = (d) => ({
  partyType: d.partyType, fullName: d.fullName, companyTitle: d.companyTitle, taxOffice: d.taxOffice, taxNumber: d.taxNumber,
  nationalId: d.nationalId, email: d.email, addressLine: d.addressLine, district: d.district, city: d.city, postalCode: d.postalCode, country: d.country,
});

const methodDto = (m) => ({
  code: String(m.code), provider: m.provider, brand: m.brand, last4: m.last4, expMonth: m.expMonth, expYear: m.expYear, holderName: m.holder,
  isDefault: m.isDefault, status: m.status,
});
const METHOD_SQL = `SELECT payment_method_id AS id, payment_method_code AS code, payment_method_provider AS provider, payment_method_status AS status,
  payment_method_card_brand AS brand, payment_method_card_last4 AS last4, payment_method_exp_month AS "expMonth", payment_method_exp_year AS "expYear",
  payment_method_holder_name AS holder, payment_method_is_default AS "isDefault" FROM billing.payment_method`;

export const makeProfile = ({ rawQuery, nowFn, provider, renew }) => {
  const getBillingProfile = async ({ caller }) => {
    const uid = Number(caller.callerUserId);
    const p = await loadProfile(rawQuery, uid);
    const u = await findUser(uid, rawQuery);
    return { profile: profileDto(p), prefill: { fullName: u?.displayName || null, email: u?.email || null } };
  };

  const putBillingProfile = async ({ caller, ...body }) => {
    const uid = Number(caller.callerUserId);
    const existing = await loadProfile(rawQuery, uid);
    const data = normalizeProfile(body, existing);
    await withTransaction((tx) => saveProfile(tx, { caller, userId: uid, data }));
    await writeAudit({ caller, action: 'billing.profile.update', schema: 'billing', table: 'billing_profile' });
    return { profile: profileDto(await loadProfile(rawQuery, uid)) };
  };

  const validateCoupon = async ({ caller, couponCode, priceKey }) => {
    const price = await loadPriceByKey(priceKey, rawQuery);
    if (!price) throw new DomainError('PRICE_NOT_FOUND', 'Price not found');
    const r = await evaluateCoupon({ couponKey: couponCode, price, userId: Number(caller.callerUserId), now: nowFn() });
    if (!r.ok) return { valid: false, reason: r.reason, reasonKey: `billing.coupon.${r.reason}` };
    const total = round2(price.amount - r.discount);
    return {
      valid: true, couponCode: upper(couponCode), discountType: r.coupon.discountType, discountValue: r.coupon.discountValue,
      discountAmount: r.discount, subtotal: price.amount, total, taxAmount: splitVat(total).tax, currency: price.currency,
    };
  };

  // Sahte taksit kuralları: BIN (ilk 6 hane) marka belirler; amex tek çekim; diğerleri fiyatın max_installments'ına kadar
  // (2, 3, 6, 9, 12 adımları). Faiz yok (sahte). Tutar kuponla düşer.
  const listInstallments = async ({ caller, priceKey, priceCode, bin, couponCode }) => {
    const price = await loadPriceByKey(priceKey || priceCode, rawQuery);
    if (!price) throw new DomainError('PRICE_NOT_FOUND', 'Price not found');
    let total = price.amount;
    if (couponCode) {
      const r = await evaluateCoupon({ couponKey: couponCode, price, userId: Number(caller.callerUserId), now: nowFn() });
      if (r.ok) total = round2(price.amount - r.discount);
    }
    const digits = String(bin || '').replace(/\D/g, '').slice(0, 6);
    const known = digits.length >= 6;
    const brand = digits.length >= 1 ? brandForBin(digits) : null;
    const steps = [1, 2, 3, 6, 9, 12].filter((n) => n <= price.maxInstallments);
    const allowed = !known || brand === 'amex' || total <= 0 ? [1] : steps;
    return {
      priceKey: price.priceKey, bin: digits || null, brand, bank: known ? 'Sahte Banka' : null, currency: price.currency, total,
      options: allowed.map((count) => ({ count, perInstallment: round2(total / count), total, interestRate: 0 })),
    };
  };

  const listPaymentMethods = async ({ caller }) => {
    const { rows } = await rawQuery(`${METHOD_SQL} WHERE payment_method_user_account_id = $1 AND payment_method_status = 'active' ORDER BY payment_method_is_default DESC, payment_method_id DESC`, [Number(caller.callerUserId)]);
    return { items: rows.map(methodDto) };
  };

  const loadOwnMethod = async (run, uid, code) => {
    const m = (await run(`${METHOD_SQL} WHERE payment_method_code = $1 AND payment_method_user_account_id = $2 AND payment_method_status = 'active'`, [Number(code) || 0, uid])).rows[0];
    if (!m) throw new DomainError('PAYMENT_METHOD_NOT_FOUND', 'Payment method not found');
    return m;
  };

  const addPaymentMethod = async ({ caller, card }) => {
    if (typeof provider.tokenizeCard !== 'function') throw new DomainError('PAYMENT_PROVIDER_NOT_CONFIGURED', 'Card tokenization is not available');
    const uid = Number(caller.callerUserId);
    const t = await provider.tokenizeCard(card);
    const code = await withTransaction(async (tx) => {
      await tx.query(`UPDATE billing.payment_method SET payment_method_is_default = false WHERE payment_method_user_account_id = $1 AND payment_method_is_default`, [uid]);
      const ins = await tx.query(
        `INSERT INTO billing.payment_method (payment_method_tenant_code, payment_method_organization_id, payment_method_user_account_id, payment_method_provider, payment_method_provider_token,
            payment_method_card_brand, payment_method_card_last4, payment_method_exp_month, payment_method_exp_year, payment_method_holder_name, payment_method_is_default, payment_method_created_by, payment_method_updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$3,$3) RETURNING payment_method_code AS code`,
        [Number(caller.callerTenantCode), Number(caller.callerOrganizationId), uid, provider.name, t.token, t.card.brand, t.card.last4, t.card.expMonth, t.card.expYear, t.card.holder]);
      const mid = (await tx.query(`SELECT payment_method_id AS id FROM billing.payment_method WHERE payment_method_code = $1`, [ins.rows[0].code])).rows[0].id;
      await tx.query(`UPDATE billing.subscription SET subscription_payment_method_id = $2 WHERE subscription_user_account_id = $1 AND subscription_status = ANY($3::varchar[])`, [uid, mid, LIVE_STATUSES]);
      return ins.rows[0].code;
    });
    await writeAudit({ caller, action: 'billing.payment_method.add', schema: 'billing', table: 'payment_method', entityCode: Number(code) });
    // Ödeme sorunu (past_due) varsa yeni kartla hemen yeniden dene.
    let retry = null;
    const pd = (await rawQuery(`SELECT subscription_code AS code FROM billing.subscription WHERE subscription_user_account_id = $1 AND subscription_status = 'past_due'`, [uid])).rows[0];
    if (pd && renew) retry = await renew.retryPastDue(Number(pd.code)).catch(() => null);
    return { paymentMethod: methodDto(await loadOwnMethod(rawQuery, uid, code)), retry };
  };

  const removePaymentMethod = async ({ caller, code }) => {
    const uid = Number(caller.callerUserId);
    const m = await loadOwnMethod(rawQuery, uid, code);
    const res = await withTransaction(async (tx) => {
      await tx.query(`UPDATE billing.payment_method SET payment_method_status = 'removed', payment_method_removed_at = now(), payment_method_is_default = false, payment_method_updated_by = $2 WHERE payment_method_id = $1`, [m.id, uid]);
      const aff = await tx.query(`UPDATE billing.subscription SET subscription_payment_method_id = NULL WHERE subscription_payment_method_id = $1 AND subscription_status = ANY($2::varchar[]) RETURNING subscription_code`, [m.id, LIVE_STATUSES]);
      if (m.isDefault) {
        await tx.query(`UPDATE billing.payment_method SET payment_method_is_default = true WHERE payment_method_id = (
          SELECT payment_method_id FROM billing.payment_method WHERE payment_method_user_account_id = $1 AND payment_method_status = 'active' ORDER BY payment_method_id DESC LIMIT 1)`, [uid]);
        const nd = await tx.query(`SELECT payment_method_id AS id FROM billing.payment_method WHERE payment_method_user_account_id = $1 AND payment_method_status='active' AND payment_method_is_default`, [uid]);
        if (nd.rows[0]) await tx.query(`UPDATE billing.subscription SET subscription_payment_method_id = $2 WHERE subscription_user_account_id = $1 AND subscription_status = ANY($3::varchar[])`, [uid, nd.rows[0].id, LIVE_STATUSES]);
      }
      return { affectedSubscriptions: aff.rowCount };
    });
    await writeAudit({ caller, action: 'billing.payment_method.remove', schema: 'billing', table: 'payment_method', entityCode: Number(code) });
    return { removed: true, ...res };
  };

  const setDefaultPaymentMethod = async ({ caller, code }) => {
    const uid = Number(caller.callerUserId);
    const m = await loadOwnMethod(rawQuery, uid, code);
    await withTransaction(async (tx) => {
      await tx.query(`UPDATE billing.payment_method SET payment_method_is_default = false WHERE payment_method_user_account_id = $1 AND payment_method_is_default AND payment_method_id <> $2`, [uid, m.id]);
      await tx.query(`UPDATE billing.payment_method SET payment_method_is_default = true WHERE payment_method_id = $1`, [m.id]);
      await tx.query(`UPDATE billing.subscription SET subscription_payment_method_id = $2 WHERE subscription_user_account_id = $1 AND subscription_status = ANY($3::varchar[])`, [uid, m.id, LIVE_STATUSES]);
    });
    return { paymentMethod: methodDto(await loadOwnMethod(rawQuery, uid, code)) };
  };

  // ── Faturalar ──
  const listInvoices = async ({ caller }) => {
    const { rows } = await rawQuery(
      `SELECT i.invoice_code AS code, pay.payment_code AS "paymentCode", i.invoice_status AS status, i.invoice_invoice_number AS "invoiceNumber", i.invoice_subtotal AS subtotal,
              i.invoice_tax_amount AS tax, i.invoice_total AS total, i.invoice_currency AS currency, i.invoice_issued_at AS "issuedAt", i.invoice_created_at AS "createdAt",
              p.product_name AS "planName"
         FROM billing.invoice i JOIN billing.payment pay ON pay.payment_id = i.invoice_payment_id
         JOIN billing.price pr ON pr.price_id = pay.payment_price_id JOIN billing.product p ON p.product_id = pr.price_product_id
        WHERE i.invoice_user_account_id = $1 ORDER BY i.invoice_id DESC LIMIT 100`, [Number(caller.callerUserId)]);
    return {
      items: rows.map((r) => ({
        code: String(r.code), paymentCode: String(r.paymentCode), status: r.status, invoiceNumber: r.invoiceNumber, planName: r.planName, subtotal: toNum(r.subtotal), taxAmount: toNum(r.tax),
        total: toNum(r.total), currency: r.currency, issuedAt: iso(r.issuedAt), createdAt: iso(r.createdAt), documentAvailable: true, eArchiveReady: r.status === 'issued',
      })),
    };
  };

  const loadInvoice = async (uid, code) => {
    const r = (await rawQuery(
      `SELECT i.invoice_code AS code, i.invoice_status AS status, i.invoice_invoice_number AS "invoiceNumber", i.invoice_subtotal AS subtotal, i.invoice_tax_amount AS tax,
              i.invoice_total AS total, i.invoice_currency AS currency, i.invoice_issued_at AS "issuedAt", i.invoice_created_at AS "createdAt", i.invoice_billing_snapshot AS snap,
              pay.payment_code AS "paymentCode", pay.payment_paid_at AS "paidAt", pay.payment_installment_count AS installments, pay.payment_discount_amount AS discount,
              p.product_name AS "planName"
         FROM billing.invoice i JOIN billing.payment pay ON pay.payment_id = i.invoice_payment_id
         JOIN billing.price pr ON pr.price_id = pay.payment_price_id JOIN billing.product p ON p.product_id = pr.price_product_id
        WHERE i.invoice_code = $1 AND i.invoice_user_account_id = $2`, [Number(code) || 0, uid])).rows[0];
    if (!r) throw new DomainError('INVOICE_NOT_FOUND', 'Invoice not found');
    return r;
  };

  /** e-Arşiv entegratörü yokken: basit text/html makbuz (PDF değil). `format=json` ile veri. */
  const getInvoiceDocument = async ({ caller, code, format, res }) => {
    const uid = Number(caller.callerUserId);
    const r = await loadInvoice(uid, code);
    const doc = {
      code: String(r.code), status: r.status, invoiceNumber: r.invoiceNumber, pending: r.status !== 'issued',
      note: r.status === 'issued' ? null : 'e-Arşiv fatura entegrasyonu tamamlanana kadar bu belge ödeme makbuzudur; fatura hazır olunca e-postayla gönderilir.',
      planName: r.planName, subtotal: toNum(r.subtotal), taxAmount: toNum(r.tax), total: toNum(r.total), currency: r.currency, paidAt: iso(r.paidAt), createdAt: iso(r.createdAt),
      paymentCode: String(r.paymentCode), billing: { fullName: r.snap?.fullName, companyTitle: r.snap?.companyTitle, taxOffice: r.snap?.taxOffice, taxNumber: r.snap?.taxNumber, addressLine: r.snap?.addressLine, district: r.snap?.district, city: r.snap?.city },
    };
    if (format === 'json') return doc;
    const row = (k, v) => `<tr><td style="padding:6px 12px 6px 0;color:#5E6B70">${esc(k)}</td><td style="padding:6px 0;text-align:right">${esc(v)}</td></tr>`;
    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Ödeme makbuzu ${esc(doc.paymentCode)}</title></head>
<body style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#13232A;max-width:560px;margin:32px auto;padding:0 16px">
<h1 style="font-size:22px;margin:0 0 4px">ODAK · Ödeme makbuzu</h1>
${doc.pending ? `<p style="background:#FFF4E5;border-radius:8px;padding:10px 12px;font-size:14px">${esc(doc.note)}</p>` : `<p>Fatura no: ${esc(doc.invoiceNumber)}</p>`}
<table style="width:100%;border-collapse:collapse;margin-top:12px">${row('Plan', doc.planName)}${row('Ödeme tarihi', doc.paidAt ? fmtDateTr(doc.paidAt) : '-')}${row('Ara toplam', fmtMoney(doc.subtotal))}${row('KDV', fmtMoney(doc.taxAmount))}${row('Toplam', fmtMoney(doc.total))}${row('Ödeme no', doc.paymentCode)}</table>
<p style="margin-top:20px;font-size:14px;color:#5E6B70">${esc(doc.billing.fullName || '')}${doc.billing.companyTitle ? ' · ' + esc(doc.billing.companyTitle) : ''}<br>${esc(doc.billing.addressLine || '')} ${esc(doc.billing.district || '')} ${esc(doc.billing.city || '')}</p></body></html>`;
    res.status(200).type('html').send(html);
    return undefined;
  };

  return Object.freeze({ getBillingProfile, putBillingProfile, validateCoupon, listInstallments, listPaymentMethods, addPaymentMethod, removePaymentMethod, setDefaultPaymentMethod, listInvoices, getInvoiceDocument });
};
