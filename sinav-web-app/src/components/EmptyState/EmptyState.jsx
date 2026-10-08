import styles from './EmptyState.module.scss';

// Boş durum = başlık + tek cümle + tek eylem (tasarım §9.5).
export default function EmptyState({ icon, title, body, action }) {
  return (
    <div className={styles.es}>
      {icon && <div className={styles.icon} aria-hidden>{icon}</div>}
      <h3 className="t-heading-3">{title}</h3>
      {body && <p className="muted t-body-m">{body}</p>}
      {action}
    </div>
  );
}
