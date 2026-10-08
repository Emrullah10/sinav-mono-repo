import { Outlet } from 'react-router-dom';
import styles from './FocusLayout.module.scss';

// Odak modu: gezinme yok. Sayfa kendi TopBar'ını (kapat · ilerleme · süre) getirir; içerik 760px'e kadar ortalı.
export default function FocusLayout() {
  return (
    <main className={styles.focus} id="main">
      <Outlet />
    </main>
  );
}
