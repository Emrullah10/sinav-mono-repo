import { useTranslation } from 'react-i18next';
import TextInput from '@components/TextInput/TextInput';
import Select from '@components/Select/Select';
import s from './Cms.module.scss';

const LABELS = ['A', 'B', 'C', 'D', 'E'];
const HINT_KINDS = ['focus', 'rule', 'eliminate', 'solution'];

// Soru gövdesi şeması: docs/api/content.md "Gövde şekilleri / question".
export const emptyQuestion = () => ({
  questionTypeKey: '', stem: '', stemFormat: 'plain', difficulty: 3, estimatedSeconds: 45, shortReason: '', explanation: '',
  options: LABELS.map((label, i) => ({ label, position: i + 1, text: '', isCorrect: i === 0, rationale: '' })),
  hints: HINT_KINDS.map((kind, i) => ({ stepNo: i + 1, kind, body: '', eliminatesLabels: [] })),
});

// Boş ipuçları gönderilmez.
export const cleanQuestion = (b) => ({ ...b, hints: (b.hints || []).filter((h) => h.body?.trim()) });

export default function QuestionForm({ value, onChange, questionTypes = [], disabled }) {
  const { t } = useTranslation();
  const set = (patch) => onChange({ ...value, ...patch });
  const setOpt = (i, patch) => set({ options: value.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  const setCorrect = (i) => set({ options: value.options.map((o, j) => ({ ...o, isCorrect: i === j })) });
  const setHint = (i, patch) => set({ hints: value.hints.map((h, j) => (j === i ? { ...h, ...patch } : h)) });
  return (
    <div className="stack">
      <div className={s.grid2}>
        <Select label={t('cmsx.q.type')} value={value.questionTypeKey || ''} disabled={disabled} onChange={(e) => set({ questionTypeKey: e.target.value })}
          options={[{ value: '', label: t('cmsx.select') }, ...questionTypes.map((q) => ({ value: q.key, label: q.name }))]} />
        <Select label={t('cmsx.q.difficulty')} value={value.difficulty} disabled={disabled} onChange={(e) => set({ difficulty: Number(e.target.value) })}
          options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} />
      </div>
      <TextInput label={t('cmsx.q.stem')} multiline rows={4} value={value.stem || ''} disabled={disabled} onChange={(e) => set({ stem: e.target.value })} />
      <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="t-label-m">{t('cmsx.q.options')}</legend>
        {value.options.map((o, i) => (
          <div key={o.label} className={`${s.opt} ${o.isCorrect ? s.correct : ''}`}>
            <span className={s.label}>{o.label}</span>
            <div className="stack-sm">
              <TextInput aria-label={`${t('cmsx.q.optionText')} ${o.label}`} value={o.text} disabled={disabled} onChange={(e) => setOpt(i, { text: e.target.value })} />
              <TextInput aria-label={`${t('cmsx.q.rationale')} ${o.label}`} placeholder={o.isCorrect ? t('cmsx.q.rationaleCorrect') : t('cmsx.q.rationaleWrong')} value={o.rationale || ''} disabled={disabled} onChange={(e) => setOpt(i, { rationale: e.target.value })} />
              <label className="row t-body-s">
                <input type="radio" name="correct" checked={!!o.isCorrect} disabled={disabled} onChange={() => setCorrect(i)} /> {t('cmsx.q.markCorrect')}
              </label>
            </div>
          </div>
        ))}
      </fieldset>
      <TextInput label={t('cmsx.q.shortReason')} value={value.shortReason || ''} disabled={disabled} onChange={(e) => set({ shortReason: e.target.value })} />
      <TextInput label={t('cmsx.q.explanation')} multiline rows={4} value={value.explanation || ''} disabled={disabled} onChange={(e) => set({ explanation: e.target.value })} />
      <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="t-label-m">{t('cmsx.q.hints')}</legend>
        {value.hints.map((h, i) => (
          <TextInput key={h.stepNo} label={`${h.stepNo}. ${t(`enums.hint_kind.${h.kind}`, { defaultValue: h.kind })}`} value={h.body || ''} disabled={disabled} onChange={(e) => setHint(i, { body: e.target.value })} />
        ))}
      </fieldset>
    </div>
  );
}
