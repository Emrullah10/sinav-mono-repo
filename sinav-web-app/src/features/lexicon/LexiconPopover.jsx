import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, GraduationCap, Languages, Plus, Volume2, X } from 'lucide-react';
import api from '@api';
import { queryClient } from '@shared/providers/QueryProvider';
import { apiErrorCode, getApiErrorMessage } from '@shared/utils/apiError';
import Routes, { path } from '@shared/constant/route-paths';
import { lexiconForm, normalizeSentence } from '@sinav/domain';
import Button from '@components/Button/Button';
import IconButton from '@components/IconButton/IconButton';
import Skeleton from '@components/Skeleton/Skeleton';
import styles from './Lexicon.module.scss';

const NO_RETRY = ['CONTENT_LEXICON_LIMIT', 'CONTENT_LEXICON_WORD_INVALID', 'CONTENT_LEXICON_SENTENCE_INVALID'];
const retry = (n, e) => n < 1 && !NO_RETRY.includes(apiErrorCode(e));
const data = (res) => res?.data?.data;
const wordKey = (form) => ['content', 'lexiconWord', form];
const sentenceKey = (text) => ['content', 'lexiconSentence', normalizeSentence(text)];
const cardKey = (code) => ['learning', 'vocab', 'card', String(code)];

const speak = (text) => {
  const s = window.speechSynthesis;
  if (!s) return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9;
  s.speak(u);
};

function Failure({ error, onRetry }) {
  const { t } = useTranslation();
  return (
    <div className="stack-sm">
      <p className={`t-body-m ${styles.error}`}>{getApiErrorMessage(error)}</p>
      {apiErrorCode(error) !== 'CONTENT_LEXICON_LIMIT' && <Button variant="secondary" size="sm" onClick={onRetry}>{t('lex.retry')}</Button>}
    </div>
  );
}

function useAskTutor(onClose) {
  const nav = useNavigate();
  return (mode, text, onAsk) => {
    onClose();
    if (onAsk) onAsk(text);
    else nav(path(Routes.tutorChat, { code: 'yeni' }), { state: { starter: { mode, text } } });
  };
}

function WordPanel({ req, onSwitch, onClose }) {
  const { t } = useTranslation();
  const form = lexiconForm(req.word);
  const q = useQuery({ queryKey: wordKey(form), queryFn: async () => data(await api.contentLexiconWord(req.word)), staleTime: Infinity, gcTime: 30 * 60 * 1000, retry });
  const entry = q.data;
  const card = useQuery({ queryKey: cardKey(entry?.itemCode), queryFn: async () => data(await api.learningVocabCardByItemGet(entry.itemCode)), enabled: Boolean(entry?.itemCode) });
  const add = useMutation({
    mutationFn: async () => {
      const itemCode = entry.itemCode || data(await api.contentLexiconWordItem(req.word)).itemCode;
      await api.learningVocabCardAdd(itemCode);
      return itemCode;
    },
    onSuccess: (itemCode) => {
      queryClient.setQueryData(wordKey(form), (old) => (old ? { ...old, itemCode } : old));
      queryClient.invalidateQueries({ queryKey: cardKey(itemCode) });
      queryClient.invalidateQueries({ queryKey: ['learning', 'vocab'] });
    },
  });
  const ask = useAskTutor(onClose);
  const sentenceText = req.sentences?.[req.index] || null;

  if (q.isPending) {
    return (
      <div className="stack-sm" aria-busy="true" aria-label={t('lex.loading')}>
        <h2 className="t-heading-2">{req.word}</h2>
        <Skeleton height={16} width="60%" />
        <Skeleton height={16} width="85%" />
        <Skeleton height={40} />
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="stack-sm">
        <h2 className="t-heading-2">{req.word}</h2>
        <Failure error={q.error} onRetry={() => q.refetch()} />
      </div>
    );
  }
  const inCards = Boolean(card.data?.card) || add.isSuccess;
  const headword = entry.lemma || entry.form;
  const itemCode = entry.itemCode || add.data;
  return (
    <div className="stack">
      <div className={styles.head}>
        <div className={styles.grow}>
          <h2 className="t-heading-2" lang="en">{headword}</h2>
          <p className="t-body-s muted">
            {[entry.partOfSpeech ? t(`enums.part_of_speech.${entry.partOfSpeech}`, { defaultValue: entry.partOfSpeech }) : null, entry.ipa].filter(Boolean).join('  ·  ')}
          </p>
        </div>
        <IconButton label={t('lex.listen')} tone="tonal" onClick={() => speak(headword)}><Volume2 size={20} /></IconButton>
      </div>
      {entry.formNote && <p className="t-body-s muted">{entry.formNote}</p>}
      {entry.isWord === false ? (
        !entry.formNote && <p className="t-body-m muted">{t('lex.notWord')}</p>
      ) : (
        <ol className={styles.meanings}>
          {entry.meanings.map((m, i) => (
            <li key={i}><span className="t-body-l">{m.tr}</span>{m.note && <span className="t-body-s muted"> — {m.note}</span>}</li>
          ))}
        </ol>
      )}
      {entry.examples?.[0] && (
        <div className={styles.example}>
          <p className="t-body-m" lang="en"><em>{entry.examples[0].en}</em></p>
          {entry.examples[0].tr && <p className="t-body-s muted">{entry.examples[0].tr}</p>}
        </div>
      )}
      {entry.synonyms?.length > 0 && <p className="t-body-s muted">{t('lex.synonyms')}: <span lang="en">{entry.synonyms.slice(0, 4).join(', ')}</span></p>}
      {add.isError && <p className={`t-body-s ${styles.error}`}>{getApiErrorMessage(add.error)}</p>}
      <div className={styles.actions}>
        {entry.isWord !== false && (inCards ? (
          <span className={styles.added}><Check size={16} aria-hidden /> {t('lex.added')}{itemCode && <> · <Link to={path(Routes.vocabWord, { id: itemCode })} onClick={onClose}>{t('lex.details')}</Link></>}</span>
        ) : (
          <Button block startIcon={<Plus size={16} />} loading={add.isPending || card.isFetching} onClick={() => add.mutate()}>{t('lex.add')}</Button>
        ))}
        <div className={styles.row}>
          {req.allowSentence && sentenceText && (
            <Button variant="secondary" size="sm" startIcon={<Languages size={16} />} onClick={() => onSwitch({ ...req, kind: 'sentence' })}>{t('lex.translateSentence')}</Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            startIcon={<GraduationCap size={16} />}
            onClick={() => ask('explain', sentenceText ? t('lex.askTutor.word', { word: headword, sentence: sentenceText }) : t('lex.askTutor.wordOnly', { word: headword }), req.onAsk)}
          >
            {t('lex.askTutor')}
          </Button>
        </div>
      </div>
      {entry.source === 'ai' && <p className="t-caption muted">{t('lex.aiNote')}</p>}
    </div>
  );
}

function SentencePanel({ req, onClose }) {
  const { t } = useTranslation();
  const text = req.sentences[req.index];
  const q = useQuery({
    queryKey: sentenceKey(text),
    queryFn: async () => {
      const r = data(await api.contentLexiconSentence(req.sentences, req.index));
      for (const x of r.translations) if (x.index !== req.index) queryClient.setQueryData(sentenceKey(req.sentences[x.index]), x.text);
      return r.translation;
    },
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    retry,
  });
  const ask = useAskTutor(onClose);
  return (
    <div className="stack">
      <div className={styles.head}>
        <p className={`t-reading-m ${styles.grow}`} lang="en">{text}</p>
        <IconButton label={t('lex.listen')} tone="tonal" onClick={() => speak(text)}><Volume2 size={20} /></IconButton>
      </div>
      <div className={styles.translation} aria-live="polite">
        {q.isPending ? (
          <div className="stack-sm" aria-label={t('lex.translating')}><Skeleton height={14} /><Skeleton height={14} width="70%" /></div>
        ) : q.isError ? <Failure error={q.error} onRetry={() => q.refetch()} /> : <p className="t-body-l">{q.data}</p>}
      </div>
      <Button variant="secondary" size="sm" startIcon={<GraduationCap size={16} />} onClick={() => ask('sentence_xray', t('lex.askTutor.sentence', { sentence: text }), req.onAsk)}>{t('lex.askTutor')}</Button>
      <p className="t-caption muted">{t('lex.aiNote')}</p>
    </div>
  );
}

const MARGIN = 8;
const narrow = () => window.matchMedia('(max-width: 640px)').matches;

/** Dokun-çevir penceresi: geniş ekranda kelimenin yanında, dar ekranda alttan sayfa. Esc, dışarı tıklama ve kaydırma kapatır. */
export default function LexiconPopover({ req, onSwitch, onClose }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const sheet = narrow();

  useLayoutEffect(() => {
    if (sheet || !ref.current || !req.anchor) return;
    const a = req.anchor;
    const { offsetWidth: w, offsetHeight: h } = ref.current;
    const left = Math.min(Math.max(MARGIN, a.left + a.width / 2 - w / 2), window.innerWidth - w - MARGIN);
    const below = a.bottom + MARGIN;
    const top = below + h <= window.innerHeight - MARGIN || a.top - h - MARGIN < MARGIN ? Math.min(below, window.innerHeight - h - MARGIN) : a.top - h - MARGIN;
    setPos({ left, top: Math.max(MARGIN, top) });
  }, [req, sheet]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || e.target.closest?.('[data-lx]')) return;
      onClose();
    };
    const onScroll = () => !sheet && onClose();
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose, sheet]);

  // İçerik yüklenince yükseklik değişir; konum yeniden hesaplanır.
  useEffect(() => {
    if (sheet || !ref.current || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      if (!ref.current || !req.anchor) return;
      const a = req.anchor;
      const h = ref.current.offsetHeight;
      setPos((p) => (p ? { ...p, top: Math.max(MARGIN, a.bottom + MARGIN + h <= window.innerHeight - MARGIN ? a.bottom + MARGIN : a.top - h - MARGIN) } : p));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [req, sheet]);

  return createPortal(
    <>
      {sheet && <div className={styles.scrim} aria-hidden />}
      <div
        ref={ref}
        role="dialog"
        aria-modal="false"
        aria-label={req.kind === 'sentence' ? t('lex.sentence.title') : req.word}
        className={sheet ? styles.sheet : styles.popover}
        style={sheet ? undefined : { left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      >
        <div className={styles.bar}>
          {req.kind === 'sentence' && <span className="t-label-m muted">{t('lex.sentence.title')}</span>}
          <IconButton label={t('common.close')} className={styles.close} onClick={onClose}><X size={18} /></IconButton>
        </div>
        {req.kind === 'word'
          ? <WordPanel key={`w:${req.word}`} req={req} onSwitch={onSwitch} onClose={onClose} />
          : <SentencePanel key={`s:${req.sentences[req.index]}`} req={req} onClose={onClose} />}
      </div>
    </>,
    document.body,
  );
}
