import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import Button from '@components/Button/Button';
import TextInput from '@components/TextInput/TextInput';
import useCountdown from '../hooks/useCountdown';
import styles from './CodeEntry.module.scss';

// AUTH-05: 6 haneli tek alan (yapıştırma/otomatik doldurma), 60 sn yeniden gönderme geri sayımı, e-postayı değiştir.
// onResend() → { retryAfterSeconds } döndürmeli (ya da fırlatmalı).
export default function CodeEntry({ email, initialRetry = 60, onSubmit, onResend, onChangeEmail, loading, error, submitLabel }) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [left, start] = useCountdown(initialRetry);
  const [info, setInfo] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const set = (v) => setCode(v.replace(/\D/g, '').slice(0, 6));
  const submit = (e) => {
    e?.preventDefault();
    if (code.length === 6) onSubmit(code);
  };
  const resend = async () => {
    try {
      const r = await onResend();
      start(r?.retryAfterSeconds ?? 60);
      setInfo(t('auth.code.resent'));
    } catch (err) {
      const ra = err?.response?.data?.error?.details?.retryAfter;
      if (ra) start(ra);
    }
  };
  return (
    <form onSubmit={submit} className={styles.form}>
      <div className={styles.addr}>
        <div className="grow">
          <p className="t-caption muted">{t('auth.code.sentTo')}</p>
          <p className="t-title">{email}</p>
        </div>
        <Button type="button" variant="tertiary" size="sm" startIcon={<Pencil size={16} />} onClick={onChangeEmail}>{t('auth.code.change')}</Button>
      </div>
      <TextInput
        ref={ref}
        label={t('auth.code.label')}
        value={code}
        onChange={(e) => set(e.target.value)}
        onPaste={(e) => { e.preventDefault(); set(e.clipboardData.getData('text')); }}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="[0-9]*"
        placeholder="••••••"
        className={styles.code}
        error={error}
        helper={t('auth.code.hint')}
        data-testid="code-input"
      />
      <Button type="submit" size="lg" block loading={loading} disabled={code.length !== 6}>{submitLabel || t('auth.code.verify')}</Button>
      <div className={styles.resend} aria-live="polite">
        {left > 0 ? <span className="muted t-body-s">{t('auth.code.resendIn', { s: left })}</span> : <Button type="button" variant="tertiary" size="sm" onClick={resend}>{t('auth.code.resend')}</Button>}
        {info && left > 0 && <span className="t-caption muted">{info}</span>}
      </div>
    </form>
  );
}
