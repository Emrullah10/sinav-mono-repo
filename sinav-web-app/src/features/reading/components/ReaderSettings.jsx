import { useTranslation } from 'react-i18next';
import Modal from '@components/Modal/Modal';
import Segmented from '@components/Segmented/Segmented';

const Row = ({ label, children }) => <div className="stack-sm"><span className="t-title">{label}</span>{children}</div>;

/** Okuma ayarları: anında uygulanır ve sunucuya yazılır (Ayarlar sayfasıyla aynı kayıt). */
export default function ReaderSettings({ open, onClose, prefs, update }) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} title={t('read.reader.settings')}>
      <div className="stack">
        <Row label={t('read.set.font')}>
          <Segmented fullWidth label={t('read.set.font')} value={prefs.font === 'figtree' ? 'figtree' : 'literata'} onChange={(v) => update({ readingFont: v })} options={[{ value: 'literata', label: 'Literata' }, { value: 'figtree', label: 'Figtree' }]} />
        </Row>
        <Row label={t('read.set.size')}>
          <Segmented fullWidth label={t('read.set.size')} value={prefs.scale} onChange={(v) => update({ readingTextScale: v })} options={[{ value: -1, label: 'A−' }, { value: 0, label: 'A' }, { value: 1, label: 'A+' }, { value: 2, label: 'A++' }]} />
        </Row>
        <Row label={t('read.set.spacing')}>
          <Segmented fullWidth label={t('read.set.spacing')} value={prefs.spacing} onChange={(v) => update({ readingLineSpacing: v })} options={[{ value: 0, label: t('read.set.spacingNormal') }, { value: 1, label: t('read.set.spacingWide') }]} />
        </Row>
        <Row label={t('read.set.theme')}>
          <Segmented fullWidth label={t('read.set.theme')} value={prefs.theme} onChange={(v) => update({ theme: v })} options={[{ value: 'system', label: t('read.set.themeSystem') }, { value: 'light', label: t('read.set.themeLight') }, { value: 'dark', label: t('read.set.themeDark') }]} />
        </Row>
      </div>
    </Modal>
  );
}
