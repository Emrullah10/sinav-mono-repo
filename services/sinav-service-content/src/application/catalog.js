import { DomainError } from 'app-shared';
import { num, iso, dateOnly, timeOnly, pageOf, catalogVersion, cacheGetJson, cacheSetJson, trunc } from '../shared/helpers.js';
import { getPublishedItem } from '../shared/item-read.js';

const sessionDto = (r) => ({
  key: r.key, name: r.name, deliveryMode: r.deliveryMode, status: r.status, examDate: dateOnly(r.examDate), examTime: timeOnly(r.examTime),
  applicationStart: dateOnly(r.applicationStart), applicationEnd: dateOnly(r.applicationEnd), lateApplicationEnd: dateOnly(r.lateApplicationEnd), resultDate: dateOnly(r.resultDate),
  isEstimated: r.isEstimated, sourceUrl: r.sourceUrl,
});
const SESSION_SELECT = `
  SELECT s.exam_session_key AS key, s.exam_session_name AS name, s.exam_session_delivery_mode AS "deliveryMode", s.exam_session_status AS status, s.exam_session_exam_date AS "examDate",
         s.exam_session_exam_time AS "examTime", s.exam_session_application_start AS "applicationStart", s.exam_session_application_end AS "applicationEnd",
         s.exam_session_late_application_end AS "lateApplicationEnd", s.exam_session_result_date AS "resultDate", s.exam_session_is_estimated AS "isEstimated", s.exam_session_source_url AS "sourceUrl",
         s.exam_session_exam_id AS "examId", e.exam_key AS "examKey", e.exam_name AS "examName"
    FROM content.exam_session s JOIN content.exam e ON e.exam_id = s.exam_session_exam_id`;

export const makeCatalog = ({ rawQuery, nowFn }) => {
  // ── ONB-01: sınav listesi ──
  const listExams = async () => {
    const [exams, tracks, sessions] = await Promise.all([
      rawQuery(`SELECT exam_id AS id, exam_key AS key, exam_name AS name, exam_short_name AS "shortName", exam_provider_name AS "providerName", exam_description AS description, exam_status AS status FROM content.exam WHERE exam_status <> 'retired' ORDER BY exam_sort_order, exam_id`),
      rawQuery(
        `SELECT t.exam_track_exam_id AS "examId", t.exam_track_key AS key, t.exam_track_name AS name, t.exam_track_delivery_mode AS "deliveryMode", t.exam_track_content_language AS "contentLanguage",
                t.exam_track_status AS status, t.exam_track_notice AS notice, t.exam_track_is_default AS "isDefault", fb.exam_track_key AS "fallbackTrackKey", sa.subject_area_key AS "subjectAreaKey", sa.subject_area_name AS "subjectAreaName"
           FROM content.exam_track t LEFT JOIN content.exam_track fb ON fb.exam_track_id = t.exam_track_fallback_track_id LEFT JOIN content.subject_area sa ON sa.subject_area_id = t.exam_track_subject_area_id
          WHERE t.exam_track_status <> 'retired' ORDER BY t.exam_track_sort_order, t.exam_track_id`),
      rawQuery(`${SESSION_SELECT} WHERE s.exam_session_exam_date >= (now() AT TIME ZONE 'Europe/Istanbul')::date AND s.exam_session_status <> 'cancelled' ORDER BY s.exam_session_exam_date, s.exam_session_id`),
    ]);
    return {
      items: exams.rows.map((e) => ({
        key: e.key, name: e.name, shortName: e.shortName, providerName: e.providerName, description: e.description, status: e.status,
        tracks: tracks.rows.filter((t) => t.examId === e.id).map((t) => {
          const next = sessions.rows.find((s) => s.examId === e.id && s.deliveryMode === t.deliveryMode);
          return {
            key: t.key, name: t.name, deliveryMode: t.deliveryMode, contentLanguage: t.contentLanguage, status: t.status, notice: t.notice, isDefault: t.isDefault,
            fallbackTrackKey: t.fallbackTrackKey, subjectArea: t.subjectAreaKey ? { key: t.subjectAreaKey, name: t.subjectAreaName } : null, nextSession: next ? sessionDto(next) : null,
          };
        }),
        nextSession: (() => { const s = sessions.rows.find((x) => x.examId === e.id); return s ? sessionDto(s) : null; })(),
      })),
    };
  };

  // ── ONB-02/03, MKT-03/06: iz ayrıntısı (Redis 11, 1 sa) ──
  const buildTrack = async (key) => {
    const { rows } = await rawQuery(
      `SELECT t.exam_track_id AS id, t.exam_track_key AS key, t.exam_track_name AS name, t.exam_track_delivery_mode AS "deliveryMode", t.exam_track_content_language AS "contentLanguage",
              t.exam_track_status AS status, t.exam_track_notice AS notice, t.exam_track_is_default AS "isDefault", t.exam_track_fallback_track_id AS "fallbackId", t.exam_track_exam_id AS "examId",
              e.exam_key AS "examKey", e.exam_name AS "examName", e.exam_short_name AS "examShortName", sa.subject_area_key AS "subjectAreaKey", sa.subject_area_name AS "subjectAreaName"
         FROM content.exam_track t JOIN content.exam e ON e.exam_id = t.exam_track_exam_id LEFT JOIN content.subject_area sa ON sa.subject_area_id = t.exam_track_subject_area_id
        WHERE t.exam_track_key = $1 AND t.exam_track_status <> 'retired'`, [key]);
    if (!rows.length) return null;
    const t = rows[0];
    const fb = t.fallbackId ? (await rawQuery(`SELECT exam_track_id AS id, exam_track_key AS key, exam_track_name AS name, exam_track_exam_id AS "examId" FROM content.exam_track WHERE exam_track_id = $1`, [t.fallbackId])).rows[0] : null;
    // Blueprint: kendi etkin sürümü, yoksa yedek izinki (YÖKDİL → YDS içeriği)
    let bp = (await rawQuery(`SELECT * FROM content.blueprint WHERE blueprint_track_id = $1 AND blueprint_is_active`, [t.id])).rows[0];
    let contentTrackKey = t.key;
    if (!bp && fb) { bp = (await rawQuery(`SELECT * FROM content.blueprint WHERE blueprint_track_id = $1 AND blueprint_is_active`, [fb.id])).rows[0]; contentTrackKey = fb.key; }
    let blueprint = null;
    if (bp) {
      const { rows: secs } = await rawQuery(
        `SELECT s.blueprint_section_position AS position, s.blueprint_section_question_count AS "questionCount", s.blueprint_section_first_question_no AS "firstQuestionNo", s.blueprint_section_last_question_no AS "lastQuestionNo",
                s.blueprint_section_label_override AS "labelOverride", s.blueprint_section_target_seconds_per_question AS "targetSeconds", qt.question_type_id AS "typeId", qt.question_type_key AS "typeKey", qt.question_type_name AS "typeName",
                qt.question_type_short_name AS "typeShortName", qt.question_type_question_format AS "questionFormat", qt.question_type_description AS description, qt.question_type_icon_key AS "iconKey",
                qt.question_type_default_target_seconds AS "defaultTargetSeconds", sn.item_code AS "strategyNoteItemCode"
           FROM content.blueprint_section s JOIN content.question_type qt ON qt.question_type_id = s.blueprint_section_question_type_id
           LEFT JOIN content.item sn ON sn.item_id = qt.question_type_strategy_note_item_id AND sn.item_status = 'published'
          WHERE s.blueprint_section_blueprint_id = $1 ORDER BY s.blueprint_section_position`, [bp.blueprint_id]);
      const { rows: tskills } = await rawQuery(
        `SELECT qs.question_type_skill_question_type_id AS "typeId", sk.skill_key AS key, sk.skill_name AS name, sk.skill_path AS path
           FROM content.question_type_skill qs JOIN content.skill sk ON sk.skill_id = qs.question_type_skill_skill_id
          WHERE qs.question_type_skill_question_type_id = ANY($1::bigint[]) ORDER BY qs.question_type_skill_sort_order, sk.skill_path`, [secs.map((s) => s.typeId)]);
      blueprint = {
        code: Number(bp.blueprint_code), versionNo: bp.blueprint_version_no, name: bp.blueprint_name, questionCount: bp.blueprint_question_count, durationSeconds: bp.blueprint_duration_seconds,
        optionsPerQuestion: bp.blueprint_options_per_question, scoringMethod: bp.blueprint_scoring_method, scoringParams: bp.blueprint_scoring_params, scoreMin: Number(bp.blueprint_score_min),
        scoreMax: Number(bp.blueprint_score_max), effectiveFrom: dateOnly(bp.blueprint_effective_from), contentTrackKey,
        sections: secs.map((s) => ({
          position: s.position, questionCount: s.questionCount, firstQuestionNo: s.firstQuestionNo, lastQuestionNo: s.lastQuestionNo, label: s.labelOverride || s.typeName, targetSecondsPerQuestion: s.targetSeconds || s.defaultTargetSeconds,
          questionType: {
            key: s.typeKey, name: s.typeName, shortName: s.typeShortName, questionFormat: s.questionFormat, description: s.description, iconKey: s.iconKey, defaultTargetSeconds: s.defaultTargetSeconds,
            strategyNoteItemCode: num(s.strategyNoteItemCode), skills: tskills.filter((k) => k.typeId === s.typeId).map(({ key: k, name, path }) => ({ key: k, name, path })),
          },
        })),
      };
    }
    const examId = t.examId;
    const contentExamId = fb && !bp ? fb.examId : examId;
    const [skills, presets, reasons, sessions] = await Promise.all([
      rawQuery(
        `SELECT s.skill_key AS key, s.skill_name AS name, s.skill_description AS description, s.skill_path AS path, s.skill_depth AS depth, s.skill_sort_order AS "sortOrder", p.skill_key AS "parentKey"
           FROM content.skill s LEFT JOIN content.skill p ON p.skill_id = s.skill_parent_id WHERE s.skill_is_active AND (s.skill_exam_id IS NULL OR s.skill_exam_id = ANY($1::bigint[])) ORDER BY s.skill_path`, [[examId, contentExamId]]),
      rawQuery(
        `SELECT goal_preset_target_score AS "targetScore", goal_preset_label AS label, goal_preset_description AS description, goal_preset_is_default AS "isDefault"
           FROM content.goal_preset WHERE goal_preset_exam_id = $1 ORDER BY goal_preset_sort_order, goal_preset_target_score`, [examId]),
      rawQuery(`SELECT goal_reason_key AS key, goal_reason_label AS label FROM content.goal_reason WHERE goal_reason_exam_id IS NULL OR goal_reason_exam_id = $1 ORDER BY goal_reason_sort_order`, [examId]),
      rawQuery(`${SESSION_SELECT} WHERE s.exam_session_exam_id = $1 AND s.exam_session_delivery_mode = $2 AND s.exam_session_status <> 'cancelled' ORDER BY s.exam_session_exam_date`, [examId, t.deliveryMode]),
    ]);
    let goalPresets = presets.rows;
    if (!goalPresets.length && contentExamId !== examId) {
      goalPresets = (await rawQuery(`SELECT goal_preset_target_score AS "targetScore", goal_preset_label AS label, goal_preset_description AS description, goal_preset_is_default AS "isDefault" FROM content.goal_preset WHERE goal_preset_exam_id = $1 ORDER BY goal_preset_sort_order, goal_preset_target_score`, [contentExamId])).rows;
    }
    return {
      track: {
        key: t.key, name: t.name, deliveryMode: t.deliveryMode, contentLanguage: t.contentLanguage, status: t.status, notice: t.notice, isDefault: t.isDefault,
        exam: { key: t.examKey, name: t.examName, shortName: t.examShortName }, subjectArea: t.subjectAreaKey ? { key: t.subjectAreaKey, name: t.subjectAreaName } : null,
        fallbackTrack: fb ? { key: fb.key, name: fb.name } : null,
      },
      blueprint,
      skills: skills.rows,
      goalPresets: goalPresets.map((g) => ({ ...g, targetScore: Number(g.targetScore) })),
      goalReasons: reasons.rows,
      sessions: sessions.rows.map(sessionDto),
    };
  };

  const getTrack = async ({ key }) => {
    const ver = await catalogVersion();
    const ck = `content:catalog:v${ver}:${key}`;
    const hit = await cacheGetJson(ck);
    if (hit) return hit;
    const dto = await buildTrack(String(key));
    if (!dto) throw new DomainError('CONTENT_TRACK_NOT_FOUND', 'Exam track not found');
    await cacheSetJson(ck, dto, 3600);
    return dto;
  };

  // ── iCal ──
  const icsEscape = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const ymd = (d) => dateOnly(d).replace(/-/g, '');
  const nextDay = (d) => { const x = new Date(`${dateOnly(d)}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10).replace(/-/g, ''); };
  const buildIcs = (s) => {
    const stamp = nowFn().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const uidBase = String(s.key).replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
    const events = [];
    const allDay = (suffix, date, summary, desc) => date && events.push(['BEGIN:VEVENT', `UID:${uidBase}-${suffix}@sinav`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(date)}`, `DTEND;VALUE=DATE:${nextDay(date)}`, `SUMMARY:${icsEscape(summary)}`, `DESCRIPTION:${icsEscape(desc)}`, ...(s.sourceUrl ? [`URL:${s.sourceUrl}`] : []), 'END:VEVENT'].join('\r\n'));
    const est = s.isEstimated ? ' (tahmini)' : '';
    if (s.examTime) {
      const t = timeOnly(s.examTime).replace(':', '');
      const end = `${String(Math.min(23, Number(t.slice(0, 2)) + 3)).padStart(2, '0')}${t.slice(2)}00`;
      events.push(['BEGIN:VEVENT', `UID:${uidBase}-exam@sinav`, `DTSTAMP:${stamp}`, `DTSTART;TZID=Europe/Istanbul:${ymd(s.examDate)}T${t}00`, `DTEND;TZID=Europe/Istanbul:${ymd(s.examDate)}T${end}`, `SUMMARY:${icsEscape(`${s.name}${est}`)}`, `DESCRIPTION:${icsEscape(`${s.examName} sınav günü`)}`, ...(s.sourceUrl ? [`URL:${s.sourceUrl}`] : []), 'END:VEVENT'].join('\r\n'));
    } else allDay('exam', s.examDate, `${s.name}${est}`, `${s.examName} sınav günü`);
    allDay('application-start', s.applicationStart, `${s.name}: başvuru başlıyor`, 'Başvuru dönemi başlangıcı');
    allDay('application-end', s.applicationEnd, `${s.name}: son başvuru günü`, 'Başvuru dönemi bitişi');
    allDay('late-application-end', s.lateApplicationEnd, `${s.name}: geç başvuru son gün`, 'Geç başvuru bitişi');
    allDay('result', s.resultDate, `${s.name}: sonuçlar`, 'Sonuç açıklama tarihi');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sinav//Takvim//TR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsEscape(s.name)}`, ...events, 'END:VCALENDAR'].join('\r\n') + '\r\n';
  };
  const sessionIcs = async ({ key }) => {
    const norm = String(key).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const { rows } = await rawQuery(`${SESSION_SELECT} WHERE regexp_replace(lower(s.exam_session_key), '[^a-z0-9]+', '-', 'g') = $1 AND s.exam_session_status <> 'cancelled'`, [norm]);
    if (!rows.length) throw new DomainError('CONTENT_SESSION_NOT_FOUND', 'Exam session not found');
    return { filename: `${norm}.ics`, text: buildIcs(rows[0]) };
  };

  // ── MKT-01: öne çıkanlar ──
  const featured = async ({ placement }) => {
    const { rows } = await rawQuery(
      `SELECT f.featured_item_sort_order AS "sortOrder", i.item_code AS code FROM content.featured_item f JOIN content.item i ON i.item_id = f.featured_item_item_id
        WHERE f.featured_item_placement = $1 AND f.featured_item_is_active AND i.item_status = 'published' ORDER BY f.featured_item_sort_order, f.featured_item_id`, [placement]);
    const items = [];
    for (const r of rows) {
      const it = await getPublishedItem(rawQuery, Number(r.code));
      if (!it) continue;
      if (it.kind === 'question') {
        const b = it.body;
        const correct = b.options.find((o) => o.isCorrect);
        items.push({
          itemCode: it.code, kind: it.kind, title: it.title, questionTypeKey: b.questionTypeKey, stem: b.stem, stemFormat: b.stemFormat, difficulty: b.difficulty,
          options: b.options.map((o) => ({ label: o.label, text: o.text, rationale: o.rationale })), correctLabel: correct?.label || null,
          hints: b.hints.map((h) => ({ stepNo: h.stepNo, kind: h.kind, body: h.body, eliminatesLabels: h.eliminatesLabels })), shortReason: b.shortReason, explanation: b.explanation,
        });
      } else items.push({ itemCode: it.code, kind: it.kind, title: it.title });
    }
    return { placement, items };
  };

  // ── MKT-09/13: makaleler ──
  const ART_FROM = `
    FROM content.item i JOIN content.item_revision r ON r.item_revision_id = i.item_published_revision_id
    JOIN content.article a ON a.article_item_revision_id = r.item_revision_id JOIN content.article_category c ON c.article_category_id = a.article_category_id
    LEFT JOIN content.article_author au ON au.article_author_id = a.article_author_id
    WHERE i.item_kind = 'article' AND i.item_status = 'published'`;
  const ART_COLS = `i.item_code AS code, i.item_slug AS slug, a.article_article_type AS type, a.article_title AS title, a.article_excerpt AS excerpt, c.article_category_key AS "categoryKey", c.article_category_name AS "categoryName",
    au.article_author_display_name AS "authorName", au.article_author_title AS "authorTitle", a.article_reading_minutes AS "readingMinutes", i.item_published_at AS "publishedAt", a.article_cover_blob_id AS "coverBlobId",
    a.article_seo_title AS "seoTitle", a.article_seo_description AS "seoDescription", i.item_language AS language`;
  const articleListItem = (r) => ({
    code: Number(r.code), slug: r.slug, type: r.type, title: r.title, excerpt: r.excerpt, category: { key: r.categoryKey, name: r.categoryName },
    author: r.authorName ? { displayName: r.authorName, title: r.authorTitle } : null, readingMinutes: r.readingMinutes, publishedAt: iso(r.publishedAt), coverBlobId: num(r.coverBlobId),
    seoTitle: r.seoTitle, seoDescription: r.seoDescription, language: r.language,
  });
  const listArticles = async ({ query = {} }) => {
    const { page, pageSize, offset } = pageOf(query, { defSize: 20, maxSize: 200 });
    const params = [];
    const where = [];
    if (query.type) { params.push(String(query.type)); where.push(`a.article_article_type = $${params.length}`); }
    if (query.category) { params.push(String(query.category)); where.push(`c.article_category_key = $${params.length}`); }
    const w = where.length ? ` AND ${where.join(' AND ')}` : '';
    const [rows, total] = await Promise.all([
      rawQuery(`SELECT ${ART_COLS} ${ART_FROM}${w} ORDER BY i.item_published_at DESC, i.item_id DESC LIMIT ${pageSize} OFFSET ${offset}`, params),
      rawQuery(`SELECT count(*)::int AS n ${ART_FROM}${w}`, params),
    ]);
    return { items: rows.rows.map(articleListItem), page, pageSize, total: total.rows[0].n };
  };
  const getArticle = async ({ type, slug }) => {
    const { rows } = await rawQuery(
      `SELECT ${ART_COLS}, a.article_body_md AS "bodyMd", a.article_toc AS toc, a.article_cta_key AS "ctaKey", au.article_author_bio AS "authorBio", i.item_updated_at AS "updatedAt"
       ${ART_FROM} AND a.article_article_type = $1 AND i.item_slug = $2`, [String(type), String(slug)]);
    if (!rows.length) throw new DomainError('CONTENT_ARTICLE_NOT_FOUND', 'Article not found');
    const r = rows[0];
    const rel = await rawQuery(
      `SELECT ${ART_COLS} ${ART_FROM} AND a.article_article_type = $1 AND c.article_category_key = $2 AND i.item_code <> $3 ORDER BY i.item_published_at DESC LIMIT 3`, [r.type, r.categoryKey, r.code]);
    return { ...articleListItem(r), bodyMd: r.bodyMd, toc: r.toc, ctaKey: r.ctaKey, author: r.authorName ? { displayName: r.authorName, title: r.authorTitle, bio: r.authorBio } : null, updatedAt: iso(r.updatedAt), related: rel.rows.map(articleListItem) };
  };
  const searchArticles = async ({ query = {} }) => {
    const text = String(query.q || '').trim();
    if (text.length < 2) return { items: [], total: 0, q: text };
    const params = [text];
    let w = '';
    if (query.type) { params.push(String(query.type)); w = ` AND a.article_article_type = $${params.length}`; }
    const limit = Math.min(Number(query.limit) || 10, 30);
    const { rows } = await rawQuery(
      `SELECT ${ART_COLS}, ts_rank(to_tsvector('turkish', a.article_title || ' ' || a.article_body_md), websearch_to_tsquery('turkish', $1)) AS rank,
              ts_headline('turkish', a.article_body_md, websearch_to_tsquery('turkish', $1), 'MaxWords=28, MinWords=12, StartSel=<mark>, StopSel=</mark>') AS snippet
       ${ART_FROM}${w} AND to_tsvector('turkish', a.article_title || ' ' || a.article_body_md) @@ websearch_to_tsquery('turkish', $1) ORDER BY rank DESC, i.item_published_at DESC LIMIT ${limit}`, params);
    return { q: text, total: rows.length, items: rows.map((r) => ({ ...articleListItem(r), snippet: trunc(r.snippet, 400), rank: Number(r.rank) })) };
  };
  const listArticleCategories = async ({ query = {} }) => {
    const params = [];
    let w = '';
    if (query.type) { params.push(String(query.type)); w = `WHERE c.article_category_article_type = $1`; }
    const { rows } = await rawQuery(
      `SELECT c.article_category_article_type AS type, c.article_category_key AS key, c.article_category_name AS name, c.article_category_description AS description,
              (SELECT count(*)::int FROM content.article a JOIN content.item_revision r ON r.item_revision_id = a.article_item_revision_id JOIN content.item i ON i.item_published_revision_id = r.item_revision_id AND i.item_status = 'published'
                WHERE a.article_category_id = c.article_category_id) AS "articleCount"
         FROM content.article_category c ${w} ORDER BY c.article_category_article_type, c.article_category_sort_order, c.article_category_id`, params);
    return { items: rows };
  };

  return Object.freeze({ listExams, getTrack, sessionIcs, featured, listArticles, getArticle, searchArticles, listArticleCategories });
};
