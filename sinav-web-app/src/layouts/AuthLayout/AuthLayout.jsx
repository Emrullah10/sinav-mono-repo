import { Outlet } from 'react-router-dom';
import styles from './AuthLayout.module.scss';

export default function AuthLayout() {
  return (
    <main className={styles.auth} id="main">
      <div className={styles.form}><Outlet /></div>
    </main>
  );
}
