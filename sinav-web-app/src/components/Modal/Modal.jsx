import { Dialog, useMediaQuery } from '@mui/material';
import { X } from 'lucide-react';
import IconButton from '@components/IconButton/IconButton';
import styles from './Modal.module.scss';

// Masaüstünde ortalanmış modal (≤560px), telefonda alt sayfaya (sheet) dönüşür.
export default function Modal({ open, onClose, title, children, footer, maxWidth = 560, dismissible = true }) {
  const mobile = useMediaQuery('(max-width: 599px)');
  return (
    <Dialog
      open={open}
      onClose={dismissible ? onClose : undefined}
      fullWidth
      maxWidth={false}
      aria-labelledby="modal-title"
      slotProps={{
        paper: { className: styles.paper, style: mobile ? { position: 'fixed', bottom: 0, margin: 0, maxWidth: '100%', width: '100%', borderRadius: '24px 24px 0 0' } : { maxWidth, borderRadius: 24 } },
        backdrop: { style: { background: 'var(--color-bg-scrim)' } },
      }}
    >
      <div className={styles.head}>
        <h2 id="modal-title" className="t-heading-3 grow">{title}</h2>
        {dismissible && <IconButton label="Kapat" onClick={onClose}><X size={20} /></IconButton>}
      </div>
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.foot}>{footer}</div>}
    </Dialog>
  );
}
