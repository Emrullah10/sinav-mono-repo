import { useTranslation } from 'react-i18next';
import { Hand, MousePointerClick } from 'lucide-react';
import Button from '@components/Button/Button';
import { useUiStore } from '@store/uiStore';
import styles from './Lexicon.module.scss';

/** Dokun-çevir ipucu: ilk okuma ekranında bir kez gösterilir ("Anladım" ile kalıcı kapanır). */
export default function LexiconTip() {
  const { t } = useTranslation();
  const seen = useUiStore((s) => s.lexiconTipSeen);
  const setSeen = useUiStore((s) => s.setLexiconTipSeen);
  if (seen) return null;
  return (
    <aside className={styles.tip} aria-label={t('lex.tip.title')}>
      <h2 className="t-title">{t('lex.tip.title')}</h2>
      <p className={styles.tipRow}><MousePointerClick size={18} aria-hidden /><span className="t-body-m">{t('lex.tip.word')}</span></p>
      <p className={styles.tipRow}><Hand size={18} aria-hidden /><span className="t-body-m">{t('lex.tip.sentence')}</span></p>
      <div><Button variant="secondary" size="sm" onClick={() => setSeen(true)}>{t('lex.tip.ok')}</Button></div>
    </aside>
  );
}
