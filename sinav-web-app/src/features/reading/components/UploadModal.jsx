import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FileUp } from 'lucide-react';
import api from '@api';
import { queryClient } from '@shared/providers/QueryProvider';
import { notify } from '@shared/utils/notify';
import { getApiErrorMessage } from '@shared/utils/apiError';
import Routes, { path } from '@shared/constant/route-paths';
import Modal from '@components/Modal/Modal';
import Button from '@components/Button/Button';
import Banner from '@components/Banner/Banner';
import ProgressBar from '@components/ProgressBar/ProgressBar';
import { readingKeys } from '../hooks/readingKeys';
import styles from './Reading.module.scss';

const data = (res) => res?.data?.data;

/** PDF yükleme: dosya + hak beyanı → ilerleme → kitap ayrıntısı (metin arka planda hazırlanır). */
export default function UploadModal({ open, onClose, quota }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const input = useRef(null);
  const abort = useRef(null);
  const [file, setFile] = useState(null);
  const [rights, setRights] = useState(false);
  const [percent, setPercent] = useState(null);
  const [error, setError] = useState(null);

  const reset = () => { setFile(null); setRights(false); setPercent(null); setError(null); };
  const close = () => { abort.current?.abort(); reset(); onClose(); };
  const maxBytes = quota?.file?.maxBytes || 50 * 1048576;
  const full = quota && quota.books.used >= quota.books.limit;

  const choose = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError(null);
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { setError(t('read.upload.notPdf')); return; }
    if (f.size > maxBytes) { setError(t('apiErrors.READING_PDF_TOO_LARGE')); return; }
    setFile(f);
  };
  const submit = async () => {
    const form = new FormData();
    form.append('file', file);
    form.append('rightsConfirmed', 'true');
    const ctrl = new AbortController();
    abort.current = ctrl;
    setPercent(0);
    setError(null);
    try {
      const book = data(await api.contentReadingUpload(form, { signal: ctrl.signal, onUploadProgress: (ev) => setPercent(ev.total ? Math.round((ev.loaded / ev.total) * 100) : 0) }));
      queryClient.invalidateQueries({ queryKey: readingKeys.library });
      notify(t(book.duplicate ? 'read.upload.duplicate' : 'read.upload.done'), 'success');
      reset();
      onClose();
      nav(path(Routes.book, { code: book.code }));
    } catch (e) {
      setPercent(null);
      if (ctrl.signal.aborted) return;
      setError(getApiErrorMessage(e));
    }
  };

  const uploading = percent !== null;
  const footer = uploading
    ? <Button variant="secondary" onClick={() => abort.current?.abort()}>{t('read.upload.cancel')}</Button>
    : !full && <Button disabled={!file || !rights} onClick={submit}>{t('read.upload.submit')}</Button>;

  return (
    <Modal open={open} onClose={close} title={t('read.upload.title')} footer={footer} dismissible={!uploading}>
      <div className="stack">
        {full ? (
          <Banner tone="warning" title={t('read.upload.limitTitle')} action={quota.tier !== 'premium' ? <Button size="sm" onClick={() => nav(Routes.premium)}>{t('read.detail.upgrade')}</Button> : undefined}>
            {t('read.upload.limitBody', { limit: quota.books.premiumLimit })}
          </Banner>
        ) : uploading ? (
          <div className="stack-sm">
            <p className={`t-title ${styles.fileName}`}>{file?.name}</p>
            <ProgressBar value={percent} label={t('read.upload.progress', { n: percent })} />
            <p className="t-body-s muted">{t('read.upload.progress', { n: percent })}</p>
            <p className="t-body-s muted">{t('read.upload.after')}</p>
          </div>
        ) : (
          <>
            <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={choose} />
            <button type="button" className={styles.drop} onClick={() => input.current?.click()}>
              <FileUp size={28} color="var(--color-accent-default)" aria-hidden />
              <span className={`t-title ${styles.fileName}`}>{file ? file.name : t('read.upload.choose')}</span>
              <span className="t-caption muted">{file ? t('read.upload.change') : t('read.upload.limits', { mb: Math.round(maxBytes / 1048576), pages: quota?.file?.maxPages || 1500 })}</span>
            </button>
            {quota && <p className="t-body-s muted">{t('read.uploads.quota', { used: quota.books.used, limit: quota.books.limit })}</p>}
            <label className={styles.check}>
              <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />
              <span className="t-body-s">{t('read.upload.rights')}</span>
            </label>
          </>
        )}
        {error && <Banner tone="danger">{error}</Banner>}
      </div>
    </Modal>
  );
}
