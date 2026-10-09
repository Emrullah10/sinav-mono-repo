import { DomainError, writeAudit, fetchInternal, internalHeaders, INTERNAL_TIMEOUTS } from 'app-shared';
import { num, iso, pageOf, reqCode, userRef, asArray, clampInt } from '../shared/helpers.js';
import { computeFormBalance } from '../shared/bodies.js';

const ENUMS = ['content_kind', 'content_status', 'revision_status', 'access_tier', 'hint_kind', 'note_kind', 'part_of_speech', 'exam_form_type', 'article_type', 'passage_kind', 'text_format', 'reading_question_kind', 'report_reason', 'report_status', 'generation_job_status', 'question_format', 'content_origin'];
const REPORT_TARGETS = ['resolved', 'rejected', 'in_review'];
const identityUrl = () => `${(process.env.SERVICE_IDENTITY_REST_URL || process.env.IDENTITY_REST_URL || 'http://127.0.0.1:2001').replace(/\/$/, '')}/api/sinav-service-identity/v1`;

export const makeCmsMisc = ({ rawQuery, nowFn, fetchFn }) => {
  // ── CMS-02: taksonomi ──
  const taxonomy = async () => {
    const [qts, qtSkills, skills, exams, tracks, areas, cats, authors, rubrics, criteria, ...enumRows] = await Promise.all([
      rawQuery(`SELECT question_type_id AS id, question_type_key AS key, question_type_name AS name, question_type_short_name AS "shortName", question_type_question_format AS "questionFormat", question_type_icon_key AS "iconKey", question_type_default_target_seconds AS "defaultTargetSeconds" FROM content.question_type WHERE question_type_is_active ORDER BY question_type_sort_order, question_type_id`),
      rawQuery(`SELECT qs.question_type_skill_question_type_id AS "typeId", s.skill_key AS key FROM content.question_type_skill qs JOIN content.skill s ON s.skill_id = qs.question_type_skill_skill_id ORDER BY qs.question_type_skill_sort_order`),
      rawQuery(`SELECT s.skill_key AS key, s.skill_name AS name, s.skill_path AS path, s.skill_depth AS depth, p.skill_key AS "parentKey", e.exam_key AS "examKey" FROM content.skill s LEFT JOIN content.skill p ON p.skill_id = s.skill_parent_id LEFT JOIN content.exam e ON e.exam_id = s.skill_exam_id WHERE s.skill_is_active ORDER BY s.skill_path`),
      rawQuery(`SELECT exam_key AS key, exam_name AS name, exam_short_name AS "shortName", exam_status AS status FROM content.exam ORDER BY exam_sort_order, exam_id`),
      rawQuery(
        `SELECT t.exam_track_key AS key, t.exam_track_name AS name, e.exam_key AS "examKey", t.exam_track_delivery_mode AS "deliveryMode", t.exam_track_status AS status, t.exam_track_content_language AS "contentLanguage",
                sa.subject_area_key AS "subjectAreaKey", fb.exam_track_key AS "fallbackTrackKey",
                (SELECT b.blueprint_code FROM content.blueprint b WHERE b.blueprint_track_id = t.exam_track_id AND b.blueprint_is_active) AS "blueprintCode"
           FROM content.exam_track t JOIN content.exam e ON e.exam_id = t.exam_track_exam_id LEFT JOIN content.subject_area sa ON sa.subject_area_id = t.exam_track_subject_area_id
           LEFT JOIN content.exam_track fb ON fb.exam_track_id = t.exam_track_fallback_track_id ORDER BY t.exam_track_sort_order, t.exam_track_id`),
      rawQuery(`SELECT subject_area_key AS key, subject_area_name AS name FROM content.subject_area ORDER BY subject_area_sort_order, subject_area_id`),
      rawQuery(`SELECT article_category_article_type AS "articleType", article_category_key AS key, article_category_name AS name FROM content.article_category ORDER BY article_category_article_type, article_category_sort_order`),
      rawQuery(`SELECT article_author_code AS code, article_author_display_name AS "displayName", article_author_title AS title FROM content.article_author ORDER BY article_author_id`),
      rawQuery(`SELECT rubric_id AS id, rubric_key AS key, rubric_name AS name, rubric_applies_to AS "appliesTo" FROM content.rubric ORDER BY rubric_id`),
      rawQuery(`SELECT rubric_criterion_rubric_id AS "rubricId", rubric_criterion_key AS key, rubric_criterion_name AS name, rubric_criterion_max_points AS "maxPoints" FROM content.rubric_criterion ORDER BY rubric_criterion_position`),
      ...ENUMS.map((e) => rawQuery(`SELECT ${e}_value AS value, ${e}_label AS label FROM enums.${e} ORDER BY ${e}_sort_order`)),
    ]);
    return {
      questionTypes: qts.rows.map(({ id, ...t }) => ({ ...t, skillKeys: qtSkills.rows.filter((s) => s.typeId === id).map((s) => s.key) })),
      skills: skills.rows, exams: exams.rows, tracks: tracks.rows.map((t) => ({ ...t, blueprintCode: num(t.blueprintCode) })), subjectAreas: areas.rows,
      articleCategories: cats.rows, articleAuthors: authors.rows.map((a) => ({ ...a, code: Number(a.code) })),
      rubrics: rubrics.rows.map(({ id, ...r }) => ({ ...r, criteria: criteria.rows.filter((c) => c.rubricId === id).map(({ rubricId, ...c }) => c) })),
      enums: Object.fromEntries(ENUMS.map((e, i) => [e.replace(/_([a-z])/g, (_m, c) => c.toUpperCase()), enumRows[i].rows])),
    };
  };

  // ── CMS-08: hata bildirimleri ──
  const REPORT_SELECT = `
    SELECT cr.content_report_code AS code, cr.content_report_reason AS reason, cr.content_report_note AS note, cr.content_report_context AS context, cr.content_report_status AS status,
           cr.content_report_created_at AS "createdAt", cr.content_report_resolved_at AS "resolvedAt", cr.content_report_resolution_note AS "resolutionNote",
           i.item_code AS "itemCode", i.item_kind AS "itemKind", i.item_title AS "itemTitle", i.item_status AS "itemStatus", r.item_revision_revision_no AS "revisionNo",
           COALESCE(left(qu.question_stem, 200), left(pa.passage_body, 200), nt.note_title, ve.vocab_entry_headword, i.item_title) AS preview,
           ru.user_account_code AS "reporterCode", ru.user_account_display_name AS "reporterName", rb.user_account_code AS "resolverCode", rb.user_account_display_name AS "resolverName",
           (SELECT count(*)::int FROM content.content_report x WHERE x.content_report_item_id = i.item_id AND x.content_report_status IN ('open','in_review')) AS "openForItem"
      FROM content.content_report cr JOIN content.item i ON i.item_id = cr.content_report_item_id
      LEFT JOIN content.item_revision r ON r.item_revision_id = cr.content_report_item_revision_id
      LEFT JOIN content.question qu ON qu.question_item_revision_id = r.item_revision_id LEFT JOIN content.passage pa ON pa.passage_item_revision_id = r.item_revision_id
      LEFT JOIN content.note nt ON nt.note_item_revision_id = r.item_revision_id LEFT JOIN content.vocab_entry ve ON ve.vocab_entry_item_revision_id = r.item_revision_id
      LEFT JOIN identity.user_account ru ON ru.user_account_id = cr.content_report_reporter_user_account_id LEFT JOIN identity.user_account rb ON rb.user_account_id = cr.content_report_resolved_by`;
  const reportDto = (r) => ({
    code: Number(r.code), reason: r.reason, note: r.note, context: r.context, status: r.status, createdAt: iso(r.createdAt), resolvedAt: iso(r.resolvedAt), resolutionNote: r.resolutionNote,
    item: { code: Number(r.itemCode), kind: r.itemKind, title: r.itemTitle, status: r.itemStatus, revisionNo: r.revisionNo, preview: r.preview, openReportCount: r.openForItem },
    reporter: userRef(r.reporterCode, r.reporterName), resolvedBy: userRef(r.resolverCode, r.resolverName),
  });
  const listReports = async ({ query = {} }) => {
    const { page, pageSize, offset } = pageOf(query);
    const statuses = asArray(query.status).length ? asArray(query.status) : ['open', 'in_review'];
    const params = [statuses];
    let w = 'cr.content_report_status = ANY($1::varchar[])';
    if (query.reason) { params.push(String(query.reason)); w += ` AND cr.content_report_reason = $${params.length}`; }
    if (query.itemCode) { params.push(Number(query.itemCode)); w += ` AND i.item_code = $${params.length}`; }
    const [rows, total] = await Promise.all([
      rawQuery(`${REPORT_SELECT} WHERE ${w} ORDER BY cr.content_report_created_at DESC LIMIT ${pageSize} OFFSET ${offset}`, params),
      rawQuery(`SELECT count(*)::int AS n FROM content.content_report cr JOIN content.item i ON i.item_id = cr.content_report_item_id WHERE ${w}`, params),
    ]);
    return { items: rows.rows.map(reportDto), page, pageSize, total: total.rows[0].n };
  };
  const getReport = async ({ code }) => {
    const { rows } = await rawQuery(`${REPORT_SELECT} WHERE cr.content_report_code = $1`, [reqCode(code, 'CONTENT_REPORT_NOT_FOUND', 'Report not found')]);
    if (!rows.length) throw new DomainError('CONTENT_REPORT_NOT_FOUND', 'Report not found');
    return reportDto(rows[0]);
  };
  const resolveReport = async ({ caller, code, status = 'resolved', note = null, notify = true }) => {
    if (!REPORT_TARGETS.includes(status)) throw new DomainError('CONTENT_REPORT_INVALID', `status must be one of ${REPORT_TARGETS.join(', ')}`, { field: 'status' });
    if (status !== 'in_review' && !String(note || '').trim()) throw new DomainError('CONTENT_REPORT_INVALID', 'note is required when resolving or rejecting', { field: 'note' });
    const rc = reqCode(code, 'CONTENT_REPORT_NOT_FOUND', 'Report not found');
    const cur = await rawQuery(`SELECT content_report_id AS id, content_report_status AS status, content_report_reporter_user_account_id AS "reporterId" FROM content.content_report WHERE content_report_code = $1`, [rc]);
    if (!cur.rows.length) throw new DomainError('CONTENT_REPORT_NOT_FOUND', 'Report not found');
    if (['resolved', 'rejected'].includes(cur.rows[0].status)) throw new DomainError('CONTENT_REPORT_ALREADY_RESOLVED', 'Report is already closed');
    const closing = status !== 'in_review';
    const uid = Number(caller.callerUserId);
    const upd = await rawQuery(
      `UPDATE content.content_report SET content_report_status = $2, content_report_resolved_by = CASE WHEN $3 THEN $4::bigint ELSE content_report_resolved_by END,
              content_report_resolved_at = CASE WHEN $3 THEN $5::timestamptz ELSE NULL END, content_report_resolution_note = COALESCE($6, content_report_resolution_note), content_report_updated_by = $4
        WHERE content_report_id = $1 AND content_report_status IN ('open','in_review') RETURNING content_report_id`, [cur.rows[0].id, status, closing, uid, nowFn(), note]);
    if (!upd.rows.length) throw new DomainError('CONTENT_REPORT_ALREADY_RESOLVED', 'Report is already closed');
    let notified = false;
    if (closing && notify && cur.rows[0].reporterId) {
      try {
        const res = await fetchInternal(`${identityUrl()}/internal/notifications`, {
          method: 'POST', headers: internalHeaders(), timeoutMs: INTERNAL_TIMEOUTS.bestEffort(), fetchFn,
          body: {
            userAccountId: Number(cur.rows[0].reporterId), kind: 'report_resolved',
            title: status === 'resolved' ? 'Bildirdiğin soru düzeltildi' : 'Bildirimini inceledik',
            body: status === 'resolved' ? 'Haber verdiğin için teşekkürler. İçeriği gözden geçirip düzelttik.' : 'Haber verdiğin için teşekkürler. İçeriği inceledik, şimdilik bir değişiklik gerekmedi.',
            deepLink: null, payload: { reportCode: rc, status }, dedupeKey: `report_resolved:${rc}`, channels: ['in_app'],
          },
        });
        notified = res.ok;
      } catch { notified = false; }
    }
    await writeAudit({ caller, action: `content.report.${status}`, schema: 'content', table: 'content_report', entityCode: rc, after: { note } });
    return { ...(await getReport({ code: rc })), notified };
  };

  // ── CMS-09: deneme formu otomatik doldurma ──
  const shuffleKey = () => Math.random();
  const autofill = async ({ query = {} }) => {
    const formType = query.formType || 'full';
    if (!['full', 'mini', 'question_type_drill'].includes(formType)) throw new DomainError('CONTENT_AUTOFILL_INVALID', 'formType must be full|mini|question_type_drill');
    const trackKey = String(query.track || '');
    const { rows: tr } = await rawQuery(
      `SELECT t.exam_track_id AS id, t.exam_track_exam_id AS "examId", t.exam_track_content_language AS lang, t.exam_track_name AS name, t.exam_track_fallback_track_id AS "fallbackId" FROM content.exam_track t WHERE t.exam_track_key = $1`, [trackKey]);
    if (!tr.length) throw new DomainError('CONTENT_TRACK_NOT_FOUND', 'Exam track not found');
    const t = tr[0];
    let bp = (await rawQuery(`SELECT * FROM content.blueprint WHERE blueprint_track_id = $1 AND blueprint_is_active`, [t.id])).rows[0];
    let contentExam = t.examId;
    if (!bp && t.fallbackId) {
      bp = (await rawQuery(`SELECT * FROM content.blueprint WHERE blueprint_track_id = $1 AND blueprint_is_active`, [t.fallbackId])).rows[0];
      contentExam = (await rawQuery(`SELECT exam_track_exam_id AS id FROM content.exam_track WHERE exam_track_id = $1`, [t.fallbackId])).rows[0]?.id || contentExam;
    }
    if (!bp) throw new DomainError('CONTENT_AUTOFILL_NO_BLUEPRINT', 'No active blueprint for this track');
    const { rows: secs } = await rawQuery(
      `SELECT s.blueprint_section_id AS id, s.blueprint_section_position AS position, s.blueprint_section_question_count AS count, s.blueprint_section_first_question_no AS first, qt.question_type_id AS "typeId", qt.question_type_key AS "typeKey", qt.question_type_question_format AS format
         FROM content.blueprint_section s JOIN content.question_type qt ON qt.question_type_id = s.blueprint_section_question_type_id WHERE s.blueprint_section_blueprint_id = $1 ORDER BY s.blueprint_section_position`, [bp.blueprint_id]);

    // Her bölüm için kaç soru isteniyor
    let plan = secs.map((s) => ({ ...s, need: s.count }));
    let totalQuestions = bp.blueprint_question_count;
    if (formType === 'mini') {
      const want = clampInt(query.count, 20, 5, bp.blueprint_question_count);
      const exact = plan.map((s) => (s.count * want) / bp.blueprint_question_count);
      plan = plan.map((s, i) => ({ ...s, need: Math.floor(exact[i]), rem: exact[i] - Math.floor(exact[i]) }));
      let left = want - plan.reduce((a, s) => a + s.need, 0);
      for (const s of [...plan].sort((a, b) => b.rem - a.rem)) { if (left <= 0) break; s.need += 1; left -= 1; }
      plan = plan.filter((s) => s.need > 0);
      totalQuestions = want;
    } else if (formType === 'question_type_drill') {
      const sec = secs.find((s) => s.typeKey === query.questionTypeKey);
      if (!sec) throw new DomainError('CONTENT_AUTOFILL_INVALID', 'questionTypeKey must be a question type of this blueprint', { field: 'questionTypeKey' });
      const want = clampInt(query.count, 10, 3, 50);
      plan = [{ ...sec, need: want }];
      totalQuestions = want;
    }

    const used = new Set();
    const picked = [];
    const shortfalls = [];
    for (const s of plan) {
      const { rows } = await rawQuery(
        `SELECT i.item_id AS id, i.item_code AS code, i.item_access_tier AS tier, qu.question_difficulty AS difficulty, left(qu.question_stem, 100) AS stem, pi.item_code AS "passageCode", qu.question_group_position AS gp,
                (SELECT count(*)::int FROM content.exam_form_question fq WHERE fq.exam_form_question_question_item_id = i.item_id) AS used
           FROM content.item i JOIN content.question qu ON qu.question_item_revision_id = i.item_published_revision_id LEFT JOIN content.item pi ON pi.item_id = qu.question_passage_item_id
          WHERE i.item_kind = 'question' AND i.item_status = 'published' AND qu.question_question_type_id = $1 AND i.item_language = $2
            AND (qu.question_passage_item_id IS NULL OR pi.item_status = 'published')
            AND (NOT EXISTS (SELECT 1 FROM content.item_exam x WHERE x.item_exam_item_id = i.item_id) OR EXISTS (SELECT 1 FROM content.item_exam x WHERE x.item_exam_item_id = i.item_id AND x.item_exam_exam_id = $3))
            AND NOT COALESCE(i.item_metadata->>'checkQuestion' = 'true', false)`, [s.typeId, t.lang, contentExam]);
      const free = rows.filter((r) => !used.has(Number(r.code)));
      const groups = new Map();
      for (const r of free) {
        const key = r.passageCode ? `p${r.passageCode}` : `q${r.code}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
      }
      const ordered = [...groups.values()].map((g) => ({ g: g.sort((a, b) => (a.gp || 0) - (b.gp || 0)), score: Math.min(...g.map((x) => x.used)) + shuffleKey() })).sort((a, b) => a.score - b.score);
      const chosen = [];
      for (const { g } of ordered) {
        if (chosen.length >= s.need) break;
        if (chosen.length + g.length <= s.need) chosen.push(...g);
      }
      for (const c of chosen) used.add(Number(c.code));
      if (chosen.length < s.need) shortfalls.push({ sectionPosition: s.position, questionTypeKey: s.typeKey, needed: s.need, found: chosen.length, missing: s.need - chosen.length });
      picked.push({ section: s, chosen });
    }
    const questions = [];
    let pos = 1;
    for (const { section, chosen } of picked) {
      let n = formType === 'full' ? section.first : pos;
      for (const c of chosen) {
        questions.push({ position: formType === 'full' ? n : pos, questionItemCode: Number(c.code), sectionPosition: section.position, questionTypeKey: section.typeKey, difficulty: c.difficulty, accessTier: c.tier, stem: c.stem, passageItemCode: num(c.passageCode) });
        n += 1; pos += 1;
      }
    }
    if (formType !== 'full') questions.forEach((x, i) => { x.position = i + 1; });
    const balance = await computeFormBalance(rawQuery, questions.map((x) => x.questionItemCode));
    return {
      trackKey, formType, blueprintCode: Number(bp.blueprint_code), title: formType === 'full' ? `${t.name} deneme` : formType === 'mini' ? `${t.name} mini deneme` : `${t.name} soru tipi çalışması`,
      questionCount: questions.length, targetQuestionCount: totalQuestions, durationSeconds: Math.round((bp.blueprint_duration_seconds * (formType === 'full' ? bp.blueprint_question_count : questions.length)) / bp.blueprint_question_count),
      questions, balance, shortfalls, complete: shortfalls.length === 0,
    };
  };

  // ── gece: item_stat ──
  const refreshItemStats = async () => {
    const res = await rawQuery(
      `WITH att AS (
         SELECT attempt_item_id AS item_id, count(*)::int AS n, avg(attempt_is_correct::int) AS cr, avg(attempt_time_ms)::int AS avgt, avg((attempt_hints_revealed > 0)::int) AS hint
           FROM learning.attempt WHERE attempt_try_no = 1 GROUP BY attempt_item_id),
       picks AS (
         SELECT item_id, jsonb_object_agg(lbl, c) AS picks FROM (
           SELECT attempt_item_id AS item_id, attempt_selected_label AS lbl, count(*)::int AS c FROM learning.attempt WHERE attempt_try_no = 1 AND attempt_selected_label IS NOT NULL GROUP BY 1, 2) x GROUP BY item_id),
       rep AS (SELECT content_report_item_id AS item_id, count(*)::int AS n FROM content.content_report WHERE content_report_status <> 'rejected' GROUP BY 1)
       INSERT INTO content.item_stat (item_stat_tenant_code, item_stat_organization_id, item_stat_item_id, item_stat_attempt_count, item_stat_correct_rate, item_stat_avg_time_ms, item_stat_option_pick_counts,
                                       item_stat_hint_usage_rate, item_stat_report_count, item_stat_computed_at)
       SELECT i.item_tenant_code, i.item_organization_id, i.item_id, COALESCE(att.n, 0), round(att.cr::numeric, 4), att.avgt, COALESCE(picks.picks, '{}'::jsonb), round(att.hint::numeric, 4), COALESCE(rep.n, 0), $1
         FROM content.item i LEFT JOIN att ON att.item_id = i.item_id LEFT JOIN picks ON picks.item_id = i.item_id LEFT JOIN rep ON rep.item_id = i.item_id
        WHERE i.item_kind = 'question' AND (att.item_id IS NOT NULL OR rep.item_id IS NOT NULL OR EXISTS (SELECT 1 FROM content.item_stat s WHERE s.item_stat_item_id = i.item_id))
       ON CONFLICT (item_stat_item_id) DO UPDATE SET item_stat_attempt_count = EXCLUDED.item_stat_attempt_count, item_stat_correct_rate = EXCLUDED.item_stat_correct_rate,
              item_stat_avg_time_ms = EXCLUDED.item_stat_avg_time_ms, item_stat_option_pick_counts = EXCLUDED.item_stat_option_pick_counts, item_stat_hint_usage_rate = EXCLUDED.item_stat_hint_usage_rate,
              item_stat_report_count = EXCLUDED.item_stat_report_count, item_stat_computed_at = EXCLUDED.item_stat_computed_at`, [nowFn()]);
    return { changed: res.rowCount ?? 0 };
  };

  return Object.freeze({ taxonomy, listReports, getReport, resolveReport, autofill, refreshItemStats });
};
