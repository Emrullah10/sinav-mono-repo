import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Pin, PinOff, Pencil, Trash2, Send, Square } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import { queryClient } from '@shared/providers/QueryProvider';
import { apiErrorCode, getApiErrorMessage } from '@shared/utils/apiError';
import Routes from '@shared/constant/route-paths';
import Button from '@components/Button/Button';
import IconButton from '@components/IconButton/IconButton';
import Segmented from '@components/Segmented/Segmented';
import Banner from '@components/Banner/Banner';
import Chip from '@components/Chip/Chip';
import TextInput from '@components/TextInput/TextInput';
import Modal from '@components/Modal/Modal';
import Skeleton from '@components/Skeleton/Skeleton';
import ErrorState from '@components/ErrorState/ErrorState';
import useTutorStream from '../hooks/useTutorStream';
import Message from '../components/Message';
import ReportModal from '../components/ReportModal';
import styles from './Chat.module.scss';

const MODES = ['free', 'explain', 'sentence_xray', 'translation_coach'];
const PRESETS = ['simpler', 'example'];

// TUTOR-02/05/06/07: sohbet. "yeni" kodu = henüz kaydedilmemiş sohbet (ilk mesajda oluşturulur; bağlam adres parametrelerinden).
export default function Chat() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { code } = useParams();
  const location = useLocation();
  const [sp] = useSearchParams();
  const isNew = code === 'yeni';
  const stream = useTutorStream();

  const conv = useApiQuery(['tutor', 'conversation', code], () => api.tutorConversationGet(code), { enabled: !isNew });
  const overview = useApiQuery(['tutor', 'overview'], () => api.tutorOverviewGet({ limit: 30 }));
  const usage = conv.data?.usage ?? overview.data?.usage;

  const [mode, setMode] = useState(location.state?.starter?.mode || sp.get('mode') || 'free');
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(null); // { content, preset }
  const [error, setError] = useState(null);
  const [reporting, setReporting] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const endRef = useRef(null);
  const sentStarter = useRef(false);
  const busy = useRef(false);

  const conversation = conv.data?.conversation;
  const messages = useMemo(() => conv.data?.messages || [], [conv.data]);
  const streaming = stream.streaming;
  useEffect(() => { if (conversation?.mode && !streaming) setMode(conversation.mode); }, [conversation?.mode, streaming]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [messages.length, stream.text, pending]);

  const llmDown = overview.data?.llmAvailable === false;
  const exhausted = usage?.enabled && usage.limit != null && usage.remaining === 0;

  const contextBody = () => {
    const kind = sp.get('kind');
    if (!kind) return undefined;
    return { kind, ...(sp.get('sessionCode') ? { sessionCode: sp.get('sessionCode'), position: Number(sp.get('position')) } : {}), ...(sp.get('itemCode') ? { itemCode: sp.get('itemCode') } : {}) };
  };

  const send = async ({ content, preset }) => {
    const text = content.trim();
    if (!text || busy.current) return;
    busy.current = true;
    setError(null);
    setPending({ content: text, preset });
    setDraft('');
    let cc = code;
    try {
      if (isNew) {
        const context = contextBody();
        const created = await api.tutorConversationCreate({ mode, ...(context ? { context } : {}) });
        cc = created.data.data.code;
      }
      const result = await stream.send(cc, { content: text, mode, ...(preset ? { preset } : {}), clientRef: uuid() });
      if (result?.event === 'error') setError(result.code);
      // Akış bitti; kayıtlı sohbeti çek (SSE'den hemen sonraki ilk GET gateway→tutor bağlantısında 400 dönebiliyor; kısa bekleyip yeniden dene).
      for (let i = 0; i < 4; i += 1) {
        try {
          await queryClient.fetchQuery({ queryKey: ['tutor', 'conversation', cc], queryFn: async () => (await api.tutorConversationGet(cc)).data.data, staleTime: 0 });
          break;
        } catch { await new Promise((r) => { setTimeout(r, 400 * (i + 1)); }); }
      }
      queryClient.invalidateQueries({ queryKey: ['tutor', 'overview'] });
      setPending(null);
      stream.reset();
      if (isNew) nav(Routes.tutorChat.replace(':code', cc), { replace: true });
    } catch (e) {
      setError(apiErrorCode(e) || e.code || 'TUTOR_INTERNAL_ERROR');
      setPending(null);
      stream.reset();
      if (!stream.messageCode) setDraft(text);
      queryClient.invalidateQueries({ queryKey: ['tutor'] });
    } finally {
      busy.current = false;
    }
  };

  useEffect(() => {
    const s = location.state?.starter;
    if (s && !sentStarter.current && isNew) { sentStarter.current = true; send({ content: s.text }); }
  });

  const update = useApiMutation((body) => api.tutorConversationUpdate(code, body), {
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tutor'] }); setRenaming(null); },
  });
  const remove = useApiMutation(() => api.tutorConversationDelete(code), {
    successMessage: 'tutor.deleted',
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tutor'] }); nav(Routes.tutor, { replace: true }); },
  });

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!exhausted && !llmDown) send({ content: draft }); } };
  const lastBot = [...messages].reverse().find((m) => m.role === 'assistant' && m.status === 'complete');
  const canPreset = !stream.streaming && !pending && lastBot && messages[messages.length - 1]?.code === lastBot.code;
  const errorText = error ? (error === 'QUOTA_EXCEEDED' ? t('tutor.limit.title') : getApiErrorMessage({ response: { data: { error: { code: error } } } })) : null;

  if (!isNew && conv.isError) return <div className={styles.page}><ErrorState error={conv.error} onRetry={conv.refetch} /></div>;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <IconButton label={t('common.back')} onClick={() => nav(Routes.tutor)}><ArrowLeft size={20} /></IconButton>
        <div className="grow">
          <h1 className="t-heading-3">{conversation?.title || t('tutor.newChat')}</h1>
          {conversation?.context && <Chip size="sm">{conversation.context.label}</Chip>}
          {isNew && sp.get('kind') && <Chip size="sm">{t(`enums.tutor_context_kind.${sp.get('kind')}`)}</Chip>}
        </div>
        {conversation && (
          <>
            <IconButton label={t(conversation.pinned ? 'tutor.unpin' : 'tutor.pin')} onClick={() => update.mutate({ pinned: !conversation.pinned })}>{conversation.pinned ? <PinOff size={20} /> : <Pin size={20} />}</IconButton>
            <IconButton label={t('tutor.rename')} onClick={() => setRenaming(conversation.title)}><Pencil size={20} /></IconButton>
            <IconButton label={t('tutor.delete')} onClick={() => setConfirmDelete(true)}><Trash2 size={20} /></IconButton>
          </>
        )}
      </header>

      <div className={styles.thread} role="log" aria-label={t('tutor.thread')}>
        {!isNew && conv.isLoading && <Skeleton height={120} />}
        {isNew && !pending && <p className="muted t-body-m">{t('tutor.empty.body')}</p>}
        {messages.map((m) => <Message key={m.code} message={m} onReport={setReporting} />)}
        {pending && <Message message={{ role: 'user', content: pending.content }} />}
        {pending && <Message live message={{ role: 'assistant', content: stream.text, blocks: stream.blocks }} />}
        {canPreset && (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {PRESETS.map((p) => <Chip key={p} onClick={() => send({ content: t(`tutor.preset.${p}`), preset: p })}>{t(`tutor.preset.${p}`)}</Chip>)}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className={styles.composer}>
        {llmDown && <Banner tone="warning" title={t('tutor.llmDown.title')}>{t('tutor.llmDown.body')}</Banner>}
        {exhausted && (
          <Banner tone="accent" title={t('tutor.limit.title')} action={<Button size="sm" onClick={() => nav(Routes.plans)}>{t('tutor.limit.cta')}</Button>}>
            {t('tutor.limit.body', { limit: usage.limit })}
          </Banner>
        )}
        {errorText && !exhausted && <Banner tone="error" onClose={() => setError(null)}>{errorText}</Banner>}
        <Segmented fullWidth label={t('tutor.mode')} value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m, label: t(`enums.tutor_mode.${m}`) }))} />
        <TextInput label={t('tutor.composer.label')} multiline rows={3} maxLength={4000} value={draft} disabled={exhausted || llmDown} placeholder={t('tutor.composer.placeholder')} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} />
        <div className="row">
          {usage?.enabled && <span className="t-caption muted tnum">{usage.limit == null ? t('tutor.usage.unlimited') : t('tutor.usage.left', { remaining: usage.remaining, limit: usage.limit })}</span>}
          <div className="grow" />
          {stream.streaming ? (
            <Button variant="secondary" startIcon={<Square size={16} />} onClick={stream.stop}>{t('tutor.stop')}</Button>
          ) : (
            <Button startIcon={<Send size={16} />} disabled={!draft.trim() || exhausted || llmDown} onClick={() => send({ content: draft })}>{t('tutor.send')}</Button>
          )}
        </div>
      </div>

      <ReportModal messageCode={reporting} onClose={() => setReporting(null)} onDone={() => queryClient.invalidateQueries({ queryKey: ['tutor', 'conversation', code] })} />
      <Modal open={renaming != null} onClose={() => setRenaming(null)} title={t('tutor.rename')}
        footer={<><Button variant="tertiary" onClick={() => setRenaming(null)}>{t('common.cancel')}</Button><Button loading={update.isPending} disabled={!renaming?.trim()} onClick={() => update.mutate({ title: renaming.trim() })}>{t('common.save')}</Button></>}>
        <TextInput label={t('tutor.titleLabel')} maxLength={120} value={renaming || ''} onChange={(e) => setRenaming(e.target.value)} />
      </Modal>
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title={t('tutor.deleteConfirm.title')}
        footer={<><Button variant="tertiary" onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</Button><Button variant="destructive" loading={remove.isPending} onClick={() => remove.mutate()}>{t('tutor.delete')}</Button></>}>
        <p>{t('tutor.deleteConfirm.body')}</p>
      </Modal>
    </div>
  );
}
