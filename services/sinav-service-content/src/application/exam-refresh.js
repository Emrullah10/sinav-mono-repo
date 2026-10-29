// Sınav sonrası soru yenileme: bir oturum "yapıldı"ya geçince o sınavın planı (blueprint) kadar
// yeni soru üretim işi kuyruğa girer — her soru tipi sınavdaki sayısıyla. Taslaklar editör onayına düşer.
// Bir oturum için yalnız bir kez (exam_session_metadata.questionRefresh); eski sınavlar geriye dönük tetiklenmez.

const RECENT_DAYS = 30;
// Metin tipleri: soru sayısı → metin sayısı (okuma 4, cloze 5 soru/metin; paragraf 1).
const PASSAGE_OF = {
  reading: { passageKind: 'reading', perPassage: 4, skillKeys: ['reading'] },
  cloze: { passageKind: 'cloze', perPassage: 5, skillKeys: ['grammar'] },
  paragraph_completion: { passageKind: 'paragraph', perPassage: 1, skillKeys: ['discourse.paragraph-completion'] },
  irrelevant_sentence: { passageKind: 'paragraph', perPassage: 1, skillKeys: ['discourse.irrelevant-sentence'] },
};

export const makeExamRefresh = ({ rawQuery, nowFn, generation }) => {
  /** Oturumun sınav planı: aynı sınav + teslim biçimindeki parkurun etkin planı; yoksa sınavın herhangi bir etkin planı. */
  const sectionsFor = async (sessionId) => {
    const { rows } = await rawQuery(
      `SELECT qt.question_type_key AS type, s.blueprint_section_question_count AS n, b.blueprint_id AS "blueprintId",
              (t.exam_track_delivery_mode = es.exam_session_delivery_mode) AS "sameMode", t.exam_track_is_default AS "isDefault"
         FROM content.exam_session es
         JOIN content.exam e ON e.exam_id = es.exam_session_exam_id
         JOIN content.exam_track t ON t.exam_track_exam_id = e.exam_id
         JOIN content.blueprint b ON b.blueprint_track_id = t.exam_track_id AND b.blueprint_is_active
         JOIN content.blueprint_section s ON s.blueprint_section_blueprint_id = b.blueprint_id
         JOIN content.question_type qt ON qt.question_type_id = s.blueprint_section_question_type_id
        WHERE es.exam_session_id = $1
        ORDER BY "sameMode" DESC, "isDefault" DESC, b.blueprint_id, s.blueprint_section_position`, [sessionId]);
    if (!rows.length) return [];
    return rows.filter((r) => r.blueprintId === rows[0].blueprintId).map((r) => ({ type: r.type, n: Number(r.n) }));
  };

  /** Plan bölümü → üretim işi girdisi. */
  const jobInput = ({ type, n }, examKey) => {
    const p = PASSAGE_OF[type];
    if (!p) return { kind: 'question', questionTypeKey: type, count: n, examKey };
    return { kind: 'passage', passageKind: p.passageKind, questionTypeKey: p.passageKind === 'paragraph' ? type : undefined, skillKeys: p.skillKeys, count: Math.ceil(n / p.perPassage), examKey };
  };

  /** Oturum yapıldıysa ve daha önce kuyruğa alınmadıysa sınav kadar soru üretimini kuyruğa al. */
  const queueAfterExam = async (session) => {
    const ageDays = (nowFn() - new Date(`${session.date}T00:00:00+03:00`)) / 86400000;
    if (!(ageDays >= 0 && ageDays <= RECENT_DAYS)) return null;
    const meta = (await rawQuery(`SELECT exam_session_metadata->'questionRefresh' AS q, e.exam_key AS "examKey" FROM content.exam_session es JOIN content.exam e ON e.exam_id = es.exam_session_exam_id WHERE es.exam_session_id = $1`, [session.id])).rows[0];
    if (!meta || meta.q) return null;
    const sections = await sectionsFor(session.id);
    if (!sections.length) {
      console.warn(`[exam-refresh] ${session.key}: sınav planı yok, soru üretimi atlandı`);
      return null;
    }
    const jobs = [];
    const errors = [];
    for (const sec of sections) {
      try {
        const j = await generation.createJob({ caller: null, ...jobInput(sec, meta.examKey), topic: null, instructions: `Fresh practice set after the ${session.key} exam.` });
        jobs.push(j.code);
      } catch (e) { errors.push(`${sec.type}: ${e.message}`.slice(0, 200)); }
    }
    const record = { queuedAt: nowFn().toISOString(), questions: sections.reduce((a, s) => a + s.n, 0), jobCodes: jobs, errors };
    await rawQuery(`UPDATE content.exam_session SET exam_session_metadata = exam_session_metadata || jsonb_build_object('questionRefresh', $2::jsonb) WHERE exam_session_id = $1`, [session.id, JSON.stringify(record)]);
    return record;
  };

  return Object.freeze({ queueAfterExam, sectionsFor });
};
