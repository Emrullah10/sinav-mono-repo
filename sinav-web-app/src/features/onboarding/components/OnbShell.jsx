import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check } from 'lucide-react';
import classNames from 'classnames';
import Button from '@components/Button/Button';
import Routes from '@shared/constant/route-paths';
import styles from './OnbShell.module.scss';

const STEPS = ['exam', 'goal', 'date', 'availability', 'level', 'plan'];

// ONB/DIAG-03/04 ortak kabuk: marka, adım göstergesi, geri, başlık, içerik ve alt eylem alanı.
export default function OnbShell({ step, title, subtitle, backTo, footer, children, wide = false }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const idx = STEPS.indexOf(step);
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <span className={styles.brand}>{t('app.name')}</span>
        <Button variant="tertiary" size="sm" onClick={() => nav(Routes.signIn)}>{t('auth.signIn.title')}</Button>
      </header>
      <nav className={styles.steps} aria-label={t('onb.steps.label')}>
        <ol>
          {STEPS.map((s, i) => (
            <li key={s} className={classNames(i < idx && styles.done, i === idx && styles.cur)} aria-current={i === idx ? 'step' : undefined}>
              <span className={styles.dot} aria-hidden>{i < idx ? <Check size={14} /> : i + 1}</span>
              <span className={styles.lbl}>{t(`onb.steps.${s}`)}</span>
            </li>
          ))}
        </ol>
      </nav>
      <section className={classNames(styles.body, wide && styles.wide)}>
        {backTo && <Button variant="tertiary" size="sm" startIcon={<ArrowLeft size={16} />} onClick={() => nav(backTo)} className={styles.back}>{t('common.back')}</Button>}
        <h1 className="t-heading-1">{title}</h1>
        {subtitle && <p className="muted t-body-l">{subtitle}</p>}
        <div className={styles.content}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </section>
    </div>
  );
}
