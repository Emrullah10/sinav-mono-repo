import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@api';
import useApiMutation from '@hooks/useApiMutation';
import Modal from '@components/Modal/Modal';
import Button from '@components/Button/Button';
import OptionRow from '@components/OptionRow/OptionRow';
import TextInput from '@components/TextInput/TextInput';

const REASONS = ['wrong_info', 'unclear', 'off_topic', 'inappropriate', 'other'];

// TUTOR-07: yanıtı bildir. POST /messages/{code}/reports
export default function ReportModal({ messageCode, onClose, onDone }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('wrong_info');
  const [note, setNote] = useState('');
  const m = useApiMutation(() => api.tutorMessageReport(messageCode, { reason, ...(note.trim() ? { note: note.trim() } : {}) }), {
    successMessage: 'tutor.report.sent',
    onSuccess: () => { onDone?.(); onClose(); },
  });
  return (
    <Modal open={!!messageCode} onClose={onClose} title={t('tutor.report.title')}
      footer={<><Button variant="tertiary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={m.isPending} onClick={() => m.mutate()}>{t('tutor.report.send')}</Button></>}>
      <div className="stack-sm">
        <p className="muted t-body-m">{t('tutor.report.body')}</p>
        <div className="stack-sm" role="radiogroup" aria-label={t('tutor.report.title')}>
          {REASONS.map((r, i) => (
            <OptionRow key={r} letter={String.fromCharCode(65 + i)} lang="tr" state={reason === r ? 'selected' : 'default'} onClick={() => setReason(r)}>{t(`enums.report_reason.${r}`)}</OptionRow>
          ))}
        </div>
        <TextInput label={t('tutor.report.note')} multiline rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}
