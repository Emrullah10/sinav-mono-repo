import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import TextInput from '@components/TextInput/TextInput';
import QuestionForm from './QuestionForm';

// Soru türü yapılandırılmış form; diğer türler (not, metin, kelime, makale…) JSON gövde olarak düzenlenir.
// `value` her zaman nesnedir; JSON geçersizse `onValidity(false)` bildirilir.
export default function BodyEditor({ kind, value, onChange, onValidity, questionTypes, disabled }) {
  const { t } = useTranslation();
  const [raw, setRaw] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [err, setErr] = useState(null);
  if (kind === 'question') return <QuestionForm value={value} onChange={onChange} questionTypes={questionTypes} disabled={disabled} />;
  return (
    <TextInput
      label={t('cmsx.body.json')}
      helper={t('cmsx.body.jsonHelp')}
      error={err}
      multiline
      rows={18}
      spellCheck={false}
      value={raw}
      disabled={disabled}
      style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}
      onChange={(e) => {
        setRaw(e.target.value);
        try {
          const parsed = JSON.parse(e.target.value);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('obj');
          setErr(null); onValidity?.(true); onChange(parsed);
        } catch {
          setErr(t('cmsx.body.jsonInvalid')); onValidity?.(false);
        }
      }}
    />
  );
}
