import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import OptionRow from '@components/OptionRow/OptionRow';
import Card from '@components/Card/Card';
import TapText from '@features/lexicon/TapText';
import styles from './Blocks.module.scss';

function MiniQuestion({ block }) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState(null);
  const answered = picked != null;
  const stateOf = (label) => {
    if (!answered) return 'default';
    if (block.answerLabel && label === block.answerLabel) return 'correct';
    if (label === picked) return block.answerLabel ? 'wrong' : 'selected';
    return 'default';
  };
  return (
    <Card tone="accent" className={styles.block}>
      <p className="t-label-m">{t('tutor.block.miniQuestion')}</p>
      <p className="reading t-reading-m" lang="en"><TapText text={block.stem} sentences={answered} sentenceLock="lex.lock.answerFirst" /></p>
      <div className="stack-sm">
        {block.options.map((o) => (
          <OptionRow key={o.label} letter={o.label} state={stateOf(o.label)} disabled={answered} onClick={() => setPicked(o.label)}
            statusLabel={answered && block.answerLabel ? (o.label === block.answerLabel ? t('tutor.block.correct') : o.label === picked ? t('tutor.block.wrong') : undefined) : undefined}>
            {o.text}
          </OptionRow>
        ))}
      </div>
      {answered && block.explanation && <p className="t-body-m">{block.explanation}</p>}
    </Card>
  );
}

function SentenceXray({ block }) {
  const { t } = useTranslation();
  return (
    <Card className={styles.block}>
      <p className="t-label-m">{t('tutor.block.xray')}</p>
      <p className="reading t-reading-m" lang="en"><TapText text={block.sentence} /></p>
      <ol className={styles.parts}>
        {block.parts.map((p) => (
          <li key={p.no} className={p.main ? styles.main : undefined}>
            <span className="reading t-reading-s" lang="en">{p.text}</span>
            <span className="t-caption muted">{p.role}{p.function ? ` · ${p.function}` : ''}</span>
          </li>
        ))}
      </ol>
      {block.skeleton && <p className={styles.skeleton}>{block.skeleton}</p>}
      {block.translation && <p className="t-body-m muted">{block.translation}</p>}
    </Card>
  );
}

function TableBlock({ block }) {
  return (
    <Card className={styles.block}>
      {block.title && <p className="t-label-m">{block.title}</p>}
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead><tr>{block.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>{block.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </Card>
  );
}

export default function Blocks({ blocks = [] }) {
  return blocks.map((b, i) => {
    if (b.type === 'mini_question') return <MiniQuestion key={i} block={b} />;
    if (b.type === 'sentence_xray') return <SentenceXray key={i} block={b} />;
    if (b.type === 'table') return <TableBlock key={i} block={b} />;
    return null;
  });
}
