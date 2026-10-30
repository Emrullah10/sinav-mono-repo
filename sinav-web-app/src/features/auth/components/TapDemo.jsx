import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { tokenize } from '@sinav/domain';
import styles from './TapDemo.module.scss';

const DEMO_WORDS = ['regular', 'exercise', 'can', 'significantly', 'improve', 'your', 'memory'];
const LONG_MS = 450;

// Karşılama: dokun-çevir denemesi. Hesap ve ağ gerektirmez (anlamlar çeviri anahtarlarında, intro.demo.*).
export default function TapDemo() {
  const { t } = useTranslation();
  const [pick, setPick] = useState(null); // { word } | { sentence: true }
  const press = useRef(null);
  const { tokens } = tokenize(t('intro.demo.sentence'));
  const down = () => {
    clearTimeout(press.current?.timer);
    const p = { fired: false };
    p.timer = setTimeout(() => { p.fired = true; setPick({ sentence: true }); }, LONG_MS);
    press.current = p;
  };
  const up = () => press.current && !press.current.fired && clearTimeout(press.current.timer);
  return (
    <div className={styles.demo}>
      <p className={classNames('reading t-reading-l', styles.sentence)} lang="en">
        {tokens.map((tok, i) => {
          const w = tok.word ? tok.text.toLowerCase() : null;
          const hl = pick?.sentence ? styles.hlSentence : w && pick?.word === w ? styles.hlWord : null;
          if (!w || !DEMO_WORDS.includes(w)) return <span key={i} className={hl || undefined}>{tok.text}</span>;
          return (
            <span
              key={i}
              role="button"
              tabIndex={0}
              className={classNames(styles.w, hl)}
              onPointerDown={down}
              onPointerUp={up}
              onPointerLeave={up}
              onContextMenu={(e) => press.current?.fired && e.preventDefault()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setPick({ word: w }))}
              onClick={() => {
                if (press.current?.fired) { press.current = null; return; }
                setPick({ word: w });
              }}
            >
              {tok.text}
            </span>
          );
        })}
      </p>
      <div className={classNames(styles.result, pick && styles.active)} aria-live="polite">
        {pick?.word ? (
          <>
            <p className="t-title" lang="en">{pick.word}</p>
            <p className="t-body-m">{t(`intro.demo.${pick.word}`)}</p>
          </>
        ) : pick?.sentence ? (
          <p className="t-body-l">{t('intro.demo.translation')}</p>
        ) : (
          <p className="t-body-m muted">{t('intro.demo.hint')}</p>
        )}
      </div>
    </div>
  );
}
