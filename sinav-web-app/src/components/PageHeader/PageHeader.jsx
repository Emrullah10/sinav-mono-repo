import styles from './PageHeader.module.scss';

export default function PageHeader({ eyebrow, title, subtitle, actions, back }) {
  return (
    <header className={styles.h}>
      <div className="grow">
        {back}
        {eyebrow && <p className="t-caption muted">{eyebrow}</p>}
        <h1 className="t-heading-1">{title}</h1>
        {subtitle && <p className="muted t-body-m">{subtitle}</p>}
      </div>
      {actions && <div className={`row ${styles.actions}`}>{actions}</div>}
    </header>
  );
}
