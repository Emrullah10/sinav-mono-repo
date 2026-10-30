// Taksonomi, katalog, personel, yasal metin, öğretmen başlangıçları.
import { insert, upsert, sp, tx, readJson, newRep, bump, err, PgArr } from './db.mjs';

const need = (rep, file) => { const d = readJson(file); if (!d) { rep.notes.push('dosya yok, atlandı'); } return d; };

export const loadMaps = async (ctx) => {
  const q = async (sql, kf, vf) => Object.fromEntries((await ctx.db.query(sql, [ctx.tenant])).rows.map((r) => [r[kf], r[vf]]));
  ctx.m.exam = await q('SELECT exam_key k, exam_id v FROM content.exam WHERE exam_tenant_code=$1', 'k', 'v');
  ctx.m.area = await q('SELECT subject_area_key k, subject_area_id v FROM content.subject_area WHERE subject_area_tenant_code=$1', 'k', 'v');
  ctx.m.track = await q('SELECT exam_track_key k, exam_track_id v FROM content.exam_track WHERE exam_track_tenant_code=$1', 'k', 'v');
  ctx.m.qt = await q('SELECT question_type_key k, question_type_id v FROM content.question_type WHERE question_type_tenant_code=$1', 'k', 'v');
  ctx.m.skill = await q('SELECT skill_key k, skill_id v FROM content.skill WHERE skill_tenant_code=$1', 'k', 'v');
  ctx.m.rubric = await q('SELECT rubric_key k, rubric_id v FROM content.rubric WHERE rubric_tenant_code=$1', 'k', 'v');
  ctx.m.product = await q('SELECT product_key k, product_id v FROM billing.product WHERE product_tenant_code=$1', 'k', 'v');
  ctx.m.price = await q('SELECT price_key k, price_id v FROM billing.price WHERE price_tenant_code=$1', 'k', 'v');
  ctx.m.campaign = await q('SELECT campaign_key k, campaign_id v FROM billing.campaign WHERE campaign_tenant_code=$1', 'k', 'v');
};

// ---------------------------------------------------------------- taxonomy
export const seedTaxonomy = async (ctx) => {
  const rep = newRep('taxonomy.json');
  const d = need(rep, 'taxonomy.json'); if (!d) return rep;
  await tx(ctx, async () => {
    const m = (ctx.m = { exam: {}, area: {}, track: {}, qt: {}, skill: {}, rubric: {} });
    for (const e of d.exams ?? []) {
      const r = await upsert(ctx, 'content', 'exam', { key: e.key }, { name: e.name, short_name: e.shortName, provider_name: e.provider ?? null, description: e.description ?? null, status: e.status, sort_order: e.sortOrder ?? 0 });
      m.exam[e.key] = r.id; bump(rep, 'sınav', r.created);
    }
    for (const a of d.subjectAreas ?? []) {
      const r = await upsert(ctx, 'content', 'subject_area', { key: a.key }, { name: a.name, sort_order: a.sortOrder ?? 0 });
      m.area[a.key] = r.id; bump(rep, 'konu alanı', r.created);
    }
    for (const t of d.tracks ?? []) {
      const r = await upsert(ctx, 'content', 'exam_track', { key: t.key }, {
        exam_id: m.exam[t.exam], name: t.name, delivery_mode: t.deliveryMode, content_language: t.language ?? 'en',
        subject_area_id: t.area ? m.area[t.area] : null, status: t.status, notice: t.notice ?? null, is_default: !!t.isDefault, sort_order: t.sortOrder ?? 0,
      });
      m.track[t.key] = r.id; bump(rep, 'iz', r.created);
    }
    for (const t of d.tracks ?? []) {
      if (t.fallbackTrack) await ctx.db.query('UPDATE content.exam_track SET exam_track_fallback_track_id=$1 WHERE exam_track_id=$2', [m.track[t.fallbackTrack], m.track[t.key]]);
    }
    for (const s of d.sessions ?? []) {
      const r = await upsert(ctx, 'content', 'exam_session', { key: s.key }, {
        exam_id: m.exam[s.exam], delivery_mode: s.deliveryMode, name: s.name ?? null, status: s.status, exam_date: s.date, exam_time: s.time ?? null,
        application_start: s.applicationStart ?? null, application_end: s.applicationEnd ?? null, late_application_end: s.lateApplicationEnd ?? null,
        result_date: s.resultDate ?? null, is_estimated: !!s.isEstimated, source_url: s.sourceUrl ?? null,
      });
      bump(rep, 'oturum', r.created);
    }
    let i = 0;
    for (const t of d.questionTypes ?? []) {
      const r = await upsert(ctx, 'content', 'question_type', { key: t.key }, {
        name: t.name, short_name: t.shortName ?? null, question_format: t.format, description: t.description ?? null, icon_key: t.iconKey ?? null,
        default_target_seconds: t.defaultTargetSeconds ?? null, sort_order: ++i, is_active: true,
      });
      m.qt[t.key] = r.id; bump(rep, 'soru tipi', r.created);
    }
    i = 0;
    for (const s of d.skills ?? []) { // ebeveyn önce gelir
      const r = await upsert(ctx, 'content', 'skill', { key: s.key }, {
        parent_id: s.parent ? m.skill[s.parent] ?? null : null, name: s.name, description: s.description ?? null,
        path: s.key, depth: s.key.split('.').length - 1, sort_order: ++i, is_active: true,
      });
      m.skill[s.key] = r.id; bump(rep, 'beceri', r.created);
    }
    for (const [qt, list] of Object.entries(d.questionTypeSkills ?? {})) {
      let n = 0;
      for (const sk of list) {
        if (!m.skill[sk] || !m.qt[qt]) { err(rep, `${qt}→${sk}`, 'bilinmeyen beceri/tip'); continue; }
        const r = await upsert(ctx, 'content', 'question_type_skill', { question_type_id: m.qt[qt], skill_id: m.skill[sk] }, { sort_order: ++n });
        bump(rep, 'tip-beceri', r.created);
      }
    }
    for (const b of d.blueprints ?? []) {
      const total = b.sections.reduce((a, s) => a + s.count, 0);
      let expect = 1, bad = false;
      for (const s of b.sections) { if (s.first !== expect || s.last - s.first + 1 !== s.count) bad = true; expect = s.last + 1; }
      if (total !== b.questionCount || bad) { err(rep, b.name, `bölümler tutarsız (toplam ${total} / ${b.questionCount})`); continue; }
      for (const tk of b.tracks) {
        const r = await upsert(ctx, 'content', 'blueprint', { track_id: m.track[tk], version_no: b.versionNo }, {
          name: b.name, is_active: true, question_count: b.questionCount, duration_seconds: b.durationSeconds, options_per_question: b.optionsPerQuestion,
          scoring_method: b.scoringMethod, scoring_params: b.scoringParams, score_min: b.scoreMin, score_max: b.scoreMax,
        });
        bump(rep, 'blueprint', r.created);
        let pos = 0;
        for (const s of b.sections) {
          const sr = await upsert(ctx, 'content', 'blueprint_section', { blueprint_id: r.id, position: ++pos }, {
            question_type_id: m.qt[s.type], question_count: s.count, first_question_no: s.first, last_question_no: s.last,
          });
          bump(rep, 'bölüm', sr.created);
        }
      }
    }
    for (const g of d.goalPresets ?? []) {
      const r = await upsert(ctx, 'content', 'goal_preset', { exam_id: m.exam[g.exam], target_score: g.score }, { label: g.label, description: g.description ?? null, is_default: !!g.isDefault, sort_order: g.score });
      bump(rep, 'hedef çipi', r.created);
    }
    i = 0;
    for (const g of d.goalReasons ?? []) {
      const r = await upsert(ctx, 'content', 'goal_reason', { key: g.key }, { exam_id: g.exam ? m.exam[g.exam] : null, label: g.label, sort_order: ++i });
      bump(rep, 'hedef nedeni', r.created);
    }
    for (const ru of d.rubrics ?? []) {
      const r = await upsert(ctx, 'content', 'rubric', { key: ru.key }, { name: ru.name, applies_to: ru.appliesTo });
      m.rubric[ru.key] = r.id; bump(rep, 'rubrik', r.created);
      let p = 0;
      for (const c of ru.criteria) {
        const cr = await upsert(ctx, 'content', 'rubric_criterion', { rubric_id: r.id, key: c.key }, { name: c.name, description: c.description ?? null, max_points: c.maxPoints, position: ++p });
        bump(rep, 'rubrik ölçütü', cr.created);
      }
    }
    i = 0;
    for (const c of d.articleCategories ?? []) {
      const r = await upsert(ctx, 'content', 'article_category', { article_type: c.type, key: c.key }, { name: c.name, description: c.description ?? null, sort_order: ++i });
      bump(rep, 'makale kategorisi', r.created);
    }
    for (const a of d.articleAuthors ?? []) {
      const r = await upsertAuthor(ctx, a); bump(rep, 'yazar', r.created);
    }
  });
  await loadMaps(ctx);
  return rep;
};

export const upsertAuthor = async (ctx, a) => {
  const key = a.key ?? a.ref ?? a.slug ?? (a.displayName ?? a.name ?? '').toLowerCase().replace(/\s+/g, '-');
  const name = a.displayName ?? a.name;
  const ex = await ctx.db.query(`SELECT article_author_id id FROM content.article_author WHERE article_author_tenant_code=$1 AND (article_author_metadata->>'key'=$2 OR article_author_display_name=$3)`, [ctx.tenant, key, name]);
  if (ex.rows[0]) return { id: ex.rows[0].id, created: false };
  const id = await insert(ctx, 'content', 'article_author', { display_name: name, title: a.title ?? null, bio: a.bio ?? null, metadata: { key } });
  return { id, created: true };
};

// ---------------------------------------------------------------- catalog
export const seedCatalog = async (ctx) => {
  const rep = newRep('catalog.json');
  const d = need(rep, 'catalog.json'); if (!d) return rep;
  await tx(ctx, async () => {
    const campaign = {};
    for (const c of d.campaigns ?? []) {
      const r = await upsert(ctx, 'billing', 'campaign', { key: c.key }, { name: c.name, kind: c.kind, status: c.status ?? 'active', capacity: c.capacity ?? null, starts_at: c.startsAt ?? null, ends_at: c.endsAt ?? null, launch_date: c.launchDate ?? null, terms_md: c.termsMd ?? null });
      campaign[c.key] = r.id; bump(rep, 'kampanya', r.created);
    }
    const product = {};
    for (const p of d.products ?? []) {
      const r = await upsert(ctx, 'billing', 'product', { key: p.key }, { name: p.name, description: p.description ?? null, kind: p.kind, status: 'active', is_public: !!p.isPublic, trial_days: p.trialDays ?? 0, badge_key: p.badge ?? null, sort_order: p.sortOrder ?? 0 });
      product[p.key] = r.id; bump(rep, 'ürün', r.created);
      const pr = p.price;
      const pri = await upsert(ctx, 'billing', 'price', { key: p.key }, {
        product_id: r.id, campaign_id: pr.campaign ? campaign[pr.campaign] : null, amount: pr.amount, currency: 'TRY', interval: pr.interval, interval_count: 1,
        period_end_rule: pr.periodEndRule, max_installments: pr.maxInstallments ?? 1, is_active: true, valid_from: '2026-10-01T00:00:00+03:00',
      }, { update: false }); // fiyat geçmişi korunur
      bump(rep, 'fiyat', pri.created);
      const feats = p.features === 'premium' ? d.premiumFeatures : p.features;
      for (const f of feats) {
        const fr = await upsert(ctx, 'billing', 'product_feature', { product_id: r.id, feature: f.feature }, { limit_value: f.limit ?? null, limit_period: f.period ?? null, is_enabled: f.enabled ?? true });
        bump(rep, 'özellik limiti', fr.created);
      }
    }
    for (const sp of d.storeProducts ?? []) {
      if (!product[sp.product]) { err(rep, sp.storeId, `ürün yok: ${sp.product}`); continue; }
      const r = await upsert(ctx, 'billing', 'store_product', { channel: sp.channel, store_id: sp.storeId }, { product_id: product[sp.product], is_active: true });
      bump(rep, 'mağaza ürünü', r.created);
    }
    const price = Object.fromEntries((await ctx.db.query('SELECT price_key k, price_id v FROM billing.price WHERE price_tenant_code=$1', [ctx.tenant])).rows.map((r) => [r.k, r.v]));
    for (const o of d.retentionOffers ?? []) {
      if (o.price && !price[o.price]) { err(rep, o.cancelReason, `fiyat yok: ${o.price}`); continue; }
      const r = await upsert(ctx, 'billing', 'retention_offer', { cancel_reason: o.cancelReason, kind: o.kind }, { price_id: o.price ? price[o.price] : null, params: o.params ?? {}, title: o.title, body: o.body, is_active: true, sort_order: o.sortOrder ?? 0 });
      bump(rep, 'tutma teklifi', r.created);
    }
    for (const c of d.coupons ?? []) {
      const r = await upsert(ctx, 'billing', 'coupon', { key: c.key }, { discount_type: c.discountType, discount_value: c.discountValue, currency: c.currency ?? null, status: c.status ?? 'active', max_redemptions: c.maxRedemptions ?? null, per_user_limit: c.perUserLimit ?? 1 });
      bump(rep, 'kupon', r.created);
    }
  });
  await loadMaps(ctx);
  return rep;
};

// ---------------------------------------------------------------- staff
const STAFF = [
  ['editor@sinav.local', 'Editör', 'content_editor'],
  ['reviewer@sinav.local', 'Gözden geçiren', 'content_reviewer'],
  ['admin@sinav.local', 'Yönetici', 'superadmin'],
  ['support@sinav.local', 'Destek', 'platform_support'],
];
export const seedStaff = async (ctx) => {
  const rep = newRep('staff (kod içi)');
  await tx(ctx, async () => {
    for (const [email, name, role] of STAFF) {
      let u = (await ctx.db.query('SELECT user_account_id id, user_account_organization_id org FROM identity.user_account WHERE user_account_tenant_code=$1 AND user_account_email_normalized=$2', [ctx.tenant, email])).rows[0];
      const createdUser = !u;
      if (!u) {
        const o = await ctx.db.query(`INSERT INTO identity.organization (organization_tenant_code, organization_type, organization_name, organization_locale) VALUES ($1,'individual',$2,'tr') RETURNING organization_id id`, [ctx.tenant, `${name} (kişisel)`]);
        const org = o.rows[0].id;
        const ua = await ctx.db.query(`INSERT INTO identity.user_account (user_account_tenant_code, user_account_organization_id, user_account_status, user_account_email, user_account_email_normalized, user_account_email_verified_at, user_account_display_name, user_account_locale)
          VALUES ($1,$2,'active',$3,$3,now(),$4,'tr') RETURNING user_account_id id`, [ctx.tenant, org, email, name]);
        u = { id: ua.rows[0].id, org };
      }
      bump(rep, 'kullanıcı', createdUser);
      const m1 = await upsert(ctx, 'identity', 'membership', { user_account_id: u.id, organization_id: ctx.org }, { role, status: 'active', is_default: true, joined_at: new Date() }, { update: false });
      bump(rep, 'üyelik (platform)', m1.created);
      const m2 = await upsert(ctx, 'identity', 'membership', { user_account_id: u.id, organization_id: u.org }, { role: 'learner', status: 'active', is_default: false, joined_at: new Date() }, { update: false });
      bump(rep, 'üyelik (kişisel)', m2.created);
      const p = await upsert(ctx, 'identity', 'user_preference', { user_account_id: u.id }, { organization_id: u.org }, { update: false });
      bump(rep, 'tercih', p.created);
    }
  });
  return rep;
};

// ---------------------------------------------------------------- legal
const LEGAL_TYPES = {
  kvkk_notice: 'KVKK Aydınlatma Metni', privacy_policy: 'Gizlilik Politikası', terms_of_use: 'Kullanım Koşulları', cookie_policy: 'Çerez Politikası',
  pre_information: 'Ön Bilgilendirme Formu', distance_sales: 'Mesafeli Satış Sözleşmesi', cancellation_refund: 'İptal ve İade Koşulları', marketing_consent_text: 'Ticari İleti Onay Metni',
};
const TASLAK = 'TASLAK — hukuk onayı bekliyor.';
export const seedLegal = async (ctx) => {
  const rep = newRep('legal.json');
  const d = readJson('legal.json');
  if (!d) rep.notes.push('dosya yok, minimal TASLAK metinler kullanılacak');
  const docs = [...(d?.documents ?? [])];
  const have = new Set(docs.map((x) => `${x.type}|${x.locale ?? 'tr'}`));
  const ex = await ctx.db.query(`SELECT legal_document_doc_type t, legal_document_locale l FROM identity.legal_document WHERE legal_document_tenant_code=$1`, [ctx.tenant]);
  ex.rows.forEach((r) => have.add(`${r.t}|${r.l}`));
  for (const [type, title] of Object.entries(LEGAL_TYPES)) {
    if (!have.has(`${type}|tr`)) docs.push({ type, locale: 'tr', version: '2026-10-draft', title, summaryMd: TASLAK, bodyMd: `> ${TASLAK}\n\n# ${title}\n\nBu metin yer tutucudur; yayın öncesinde hukuk danışmanı tarafından hazırlanacaktır.`, fallback: true });
  }
  await tx(ctx, async () => {
    for (const x of docs) {
      const id = `${x.type}/${x.locale ?? 'tr'}/${x.version}`;
      if (!LEGAL_TYPES[x.type]) { err(rep, id, 'bilinmeyen tür'); continue; }
      if (!x.title || !x.bodyMd || !x.version) { err(rep, id, 'title/version/bodyMd eksik'); continue; }
      try {
        await sp(ctx, async () => {
          const loc = x.locale ?? 'tr';
          const e = await ctx.db.query(`SELECT 1 FROM identity.legal_document WHERE legal_document_doc_type=$1 AND legal_document_locale=$2 AND legal_document_version=$3`, [x.type, loc, x.version]);
          if (e.rows[0]) return bump(rep, x.fallback ? 'fallback taslak' : 'belge', false);
          await ctx.db.query(`UPDATE identity.legal_document SET legal_document_is_current=false WHERE legal_document_doc_type=$1 AND legal_document_locale=$2 AND legal_document_is_current`, [x.type, loc]);
          const body = /TASLAK/.test(x.bodyMd) ? x.bodyMd : `> ${TASLAK}\n\n${x.bodyMd}`;
          await insert(ctx, 'identity', 'legal_document', { doc_type: x.type, version: x.version, locale: loc, title: x.title, summary_md: x.summaryMd ?? null, body_md: body, published_at: new Date(), is_current: true });
          bump(rep, x.fallback ? 'fallback taslak' : 'belge', true);
        });
      } catch (e) { err(rep, id, e.message); }
    }
  });
  return rep;
};

// ---------------------------------------------------------------- tutor
const MODES = ['free', 'explain', 'sentence_xray', 'translation_coach'];
const DEFAULT_STARTERS = [
  { mode: 'explain', text: 'Despite ile although farkı ne?' },
  { mode: 'free', text: 'Cloze testte nereden başlamalıyım?' },
  { mode: 'sentence_xray', text: 'Bu cümleyi parçalarına ayır' },
  { mode: 'free', text: 'Bana 10 phrasal verb sor' },
  { mode: 'explain', text: 'Bir dil bilgisi kuralını örneklerle açıkla' },
  { mode: 'sentence_xray', text: 'Uzun bir akademik cümlenin yapısını göster' },
  { mode: 'translation_coach', text: 'Bir cümleyi Türkçeye çevireyim, değerlendir' },
  { mode: 'translation_coach', text: 'Çeviri hatalarımı birlikte inceleyelim' },
];
export const seedTutor = async (ctx) => {
  const rep = newRep('tutor.json');
  const d = readJson('tutor.json');
  let list = d?.starters;
  if (!list?.length) { rep.notes.push('dosya yok/boş: varsayılan başlangıçlar'); list = DEFAULT_STARTERS; }
  const yds = ctx.m.exam?.yds ?? (await ctx.db.query(`SELECT exam_id FROM content.exam WHERE exam_tenant_code=$1 AND exam_key='yds'`, [ctx.tenant])).rows[0]?.exam_id ?? null;
  await tx(ctx, async () => {
    let i = 0;
    for (const raw of list) {
      const s = typeof raw === 'string' ? { mode: 'free', text: raw } : raw;
      const text = s.text ?? s.prompt ?? s.body;
      const mode = s.mode ?? 'free';
      if (!text || text.length > 200 || !MODES.includes(mode)) { err(rep, text ?? '(boş)', `geçersiz başlangıç (mode=${mode})`); continue; }
      const r = await upsert(ctx, 'tutor', 'starter_prompt', { mode, text }, { exam_id: yds, sort_order: s.sortOrder ?? ++i, is_active: true }, { update: false });
      bump(rep, 'başlangıç', r.created);
    }
  });
  return rep;
};
