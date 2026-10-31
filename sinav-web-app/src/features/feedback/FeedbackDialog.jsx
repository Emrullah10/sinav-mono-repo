import { useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { ImagePlus, Mic, MonitorUp, Square, Trash2, X } from 'lucide-react';
import api from '@api';
import { getApiErrorMessage } from '@shared/utils/apiError';
import { notify } from '@shared/utils/notify';
import { useAuthStore } from '@store/authStore';
import Modal from '@components/Modal/Modal';
import Segmented from '@components/Segmented/Segmented';
import TextInput from '@components/TextInput/TextInput';
import Button from '@components/Button/Button';
import Banner from '@components/Banner/Banner';
import IconButton from '@components/IconButton/IconButton';
import { useFeedbackStore } from './feedbackStore';
import useVoiceRecorder from './useVoiceRecorder';
import { canCaptureScreen, captureScreenFrame, compressImage, formatDuration } from './media';
import styles from './Feedback.module.scss';

const KINDS = ['bug', 'suggestion', 'other'];
const APP_VERSION = typeof __APP_VERSION__ === 'undefined' ? undefined : __APP_VERSION__;

const deviceContext = () => ({
  userAgent: navigator.userAgent,
  viewport: `${window.innerWidth}x${window.innerHeight}`,
  pixelRatio: window.devicePixelRatio || 1,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  online: navigator.onLine,
  colorScheme: window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
});

function Body({ onSent }) {
  const { t, i18n } = useTranslation();
  const { pathname, search } = useLocation();
  const fb = useFeedbackStore();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const voice = useVoiceRecorder((audio) => fb.setAudio(audio));
  const full = fb.images.length >= 3;

  const addBlob = async (blob, source) => {
    if (useFeedbackStore.getState().images.length >= 3) return notify(t('feedback.attach.limit'), 'info');
    if (blob.size > 25 * 1024 * 1024) return notify(t('feedback.attach.tooLarge'), 'error');
    try {
      fb.addImage({ ...(await compressImage(blob)), source });
    } catch {
      notify(t('feedback.attach.unreadable'), 'error');
    }
    return undefined;
  };
  const addFiles = async (files, source) => {
    for (const f of [...files].filter((x) => x.type.startsWith('image/'))) await addBlob(f, source);
  };
  const screenshot = async () => {
    setBusy(true);
    fb.setHidden(true); // pencere görüntüye girmesin
    try {
      await new Promise((r) => setTimeout(r, 250));
      const blob = await captureScreenFrame();
      if (blob) await addBlob(blob, 'screenshot');
    } catch (e) {
      if (e?.name !== 'NotAllowedError' && e?.name !== 'AbortError') notify(t('feedback.attach.unreadable'), 'error');
    } finally {
      fb.setHidden(false);
      setBusy(false);
    }
  };
  const onPaste = (e) => {
    const imgs = [...(e.clipboardData?.items || [])].filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter(Boolean);
    if (!imgs.length) return;
    e.preventDefault();
    addFiles(imgs, 'paste');
  };

  const send = useMutation({
    mutationFn: () =>
      api.identityFeedbackSend({
        kind: fb.kind,
        message: fb.message.trim(),
        screen: `${pathname}${search}`.slice(0, 200),
        platform: 'web',
        appVersion: APP_VERSION,
        locale: i18n.language,
        context: deviceContext(),
        attachments: [
          ...fb.images.map((i) => ({ data: i.data, source: i.source })),
          ...(fb.audio ? [{ data: fb.audio.data, durationMs: fb.audio.durationMs }] : []),
        ],
      }, { timeout: 90000 }),
    onSuccess: onSent,
  });
  const canSend = (fb.message.trim().length >= 3 || fb.images.length > 0 || !!fb.audio) && !voice.recording && !busy;

  return (
    <div className="stack" onPaste={onPaste} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files, 'file'); }}>
      <p className="t-body-m muted">{t('feedback.intro')}</p>
      <Segmented label={t('feedback.kindLabel')} value={fb.kind} onChange={fb.setKind} fullWidth options={KINDS.map((k) => ({ value: k, label: t(`feedback.kind.${k}`) }))} />
      <TextInput label={t(`feedback.message.${fb.kind}`)} multiline rows={4} maxLength={5000} value={fb.message} onChange={(e) => fb.setMessage(e.target.value)} autoFocus />

      <div className="stack-sm">
        <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {canCaptureScreen() && (
            <Button size="sm" variant="secondary" startIcon={<MonitorUp size={16} />} disabled={full || busy || voice.recording} onClick={screenshot}>{t('feedback.attach.screenshot')}</Button>
          )}
          <Button size="sm" variant="secondary" startIcon={<ImagePlus size={16} />} disabled={full || busy} onClick={() => fileRef.current?.click()}>{t('feedback.attach.file')}</Button>
          {!fb.audio && (voice.recording ? (
            <Button size="sm" variant="destructive" startIcon={<Square size={14} />} onClick={voice.stop}>{t('feedback.voice.stop')}</Button>
          ) : (
            <Button size="sm" variant="secondary" startIcon={<Mic size={16} />} disabled={busy} onClick={voice.start}>{t('feedback.voice.record')}</Button>
          ))}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files, 'file'); e.target.value = ''; }} />
        </div>
        <p className="t-caption muted">{t('feedback.attach.hint')} {t('feedback.attach.paste')}</p>

        {voice.recording && (
          <div className={styles.recording} role="status" aria-live="polite">
            <span className={styles.dot} aria-hidden /> {t('feedback.voice.recording', { time: formatDuration(voice.elapsed) })} · {t('feedback.voice.max')}
          </div>
        )}
        {voice.error && <Banner tone="warning">{t(voice.error === 'denied' ? 'feedback.voice.denied' : 'feedback.voice.unsupported')}</Banner>}

        {fb.images.length > 0 && (
          <ul className={styles.thumbs}>
            {fb.images.map((img, i) => (
              <li key={img.id} className={styles.thumb}>
                <img src={img.preview} alt={t('feedback.attach.photo', { n: i + 1 })} />
                <IconButton label={t('feedback.attach.remove')} className={styles.remove} onClick={() => fb.removeImage(img.id)}><X size={16} /></IconButton>
              </li>
            ))}
          </ul>
        )}
        {fb.audio && (
          <div className={styles.audio}>
            <audio controls src={fb.audio.url} aria-label={t('feedback.voice.label', { time: formatDuration(fb.audio.durationMs) })} />
            <IconButton label={t('feedback.voice.remove')} onClick={() => fb.setAudio(null)}><Trash2 size={18} /></IconButton>
          </div>
        )}
      </div>

      <p className="t-caption muted">{t('feedback.context')}</p>
      {send.isError && <Banner tone="error">{getApiErrorMessage(send.error)}</Banner>}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        <Button variant="tertiary" onClick={fb.hide}>{t('common.cancel')}</Button>
        <Button loading={send.isPending} disabled={!canSend} onClick={() => send.mutate()}>{t('feedback.send')}</Button>
      </div>
    </div>
  );
}

/** Kökte bir kez: oturum açmış herkes (misafir dahil) için geri bildirim penceresi. useFeedbackStore().show() ile açılır. */
export default function FeedbackDialog() {
  const { t } = useTranslation();
  const authed = useAuthStore((s) => s.status === 'authenticated');
  const { open, hidden, hide, reset } = useFeedbackStore();
  const [sent, setSent] = useState(false);
  const close = () => {
    hide();
    if (sent) {
      reset();
      setSent(false);
    }
  };
  if (!authed) return null;
  return (
    <Modal open={open && !hidden} onClose={close} title={t('feedback.title')} maxWidth={600}>
      {sent ? (
        <div className="stack">
          <Banner tone="success" title={t('feedback.sent.title')}>{t('feedback.sent.body')}</Banner>
          <div className="row" style={{ justifyContent: 'flex-end' }}><Button onClick={close}>{t('feedback.sent.done')}</Button></div>
        </div>
      ) : (
        <Body onSent={() => setSent(true)} />
      )}
    </Modal>
  );
}
