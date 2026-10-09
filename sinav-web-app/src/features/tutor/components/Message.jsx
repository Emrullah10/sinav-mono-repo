import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ThumbsUp, ThumbsDown, Flag, ShieldAlert } from 'lucide-react';
import classNames from 'classnames';
import api from '@api';
import useApiMutation from '@hooks/useApiMutation';
import Markdown from '@components/Markdown/Markdown';
import Chip from '@components/Chip/Chip';
import IconButton from '@components/IconButton/IconButton';
import Routes, { path } from '@shared/constant/route-paths';
import Blocks from './Blocks';
import styles from './Message.module.scss';

// Tek mesaj: kullanıcı baloncuğu ya da öğretmen yanıtı (metin + bloklar + kaynak çipleri + geri bildirim).
export default function Message({ message, live = false, onReport }) {
  const { t } = useTranslation();
  const isUser = message.role === 'user';
  const [vote, setVote] = useState(message.feedback ?? null);
  const feedback = useApiMutation((v) => api.tutorMessageFeedback(message.code, v), { onSuccess: (_d, v) => setVote(v) });
  const status = message.status;

  if (isUser) return <div className={styles.user}><p>{message.content}</p></div>;

  return (
    <article className={styles.bot} aria-live={live ? 'polite' : undefined} aria-busy={live || undefined}>
      <p className="t-caption muted">{t('tutor.teacher')}</p>
      <div className={classNames(styles.bubble, 'reading')}>
        {message.content ? <Markdown source={message.content} /> : <span className="muted">{t('tutor.thinking')}</span>}
        {live && message.content && <span className={styles.caret} aria-hidden />}
      </div>
      {message.blocks?.length > 0 && <div className="stack-sm"><Blocks blocks={message.blocks} /></div>}
      {message.sources?.length > 0 && (
        <div className={styles.row} aria-label={t('tutor.sources')}>
          {message.sources.map((s) => (
            <Link key={`${s.kind}${s.code}`} to={path(Routes.note, { id: s.code })} className={styles.link}><Chip size="sm">{s.title}</Chip></Link>
          ))}
        </div>
      )}
      {(status === 'interrupted' || status === 'failed') && <p className="t-caption muted">{t(`enums.tutor_message_status.${status}`)}</p>}
      {message.needsExpertReview && <p className={classNames('t-caption', styles.review)}><ShieldAlert size={14} aria-hidden /> {t('tutor.expertReview')}</p>}
      {!live && message.code && message.content && (
        <div className={styles.row}>
          <IconButton label={t('tutor.helpful')} aria-pressed={vote === true} className={vote === true ? styles.on : undefined} onClick={() => feedback.mutate(true)}><ThumbsUp size={18} /></IconButton>
          <IconButton label={t('tutor.notHelpful')} aria-pressed={vote === false} className={vote === false ? styles.on : undefined} onClick={() => feedback.mutate(false)}><ThumbsDown size={18} /></IconButton>
          <IconButton label={t('tutor.report.open')} onClick={() => onReport?.(message.code)}><Flag size={18} /></IconButton>
        </div>
      )}
    </article>
  );
}
