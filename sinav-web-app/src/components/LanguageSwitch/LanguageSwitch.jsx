import { useTranslation } from 'react-i18next';
import api from '@api';
import Segmented from '@components/Segmented/Segmented';
import { useAuthStore } from '@store/authStore';

const OPTIONS = [
  { value: 'tr', label: 'TR', ariaLabel: 'Türkçe' },
  { value: 'en', label: 'EN', ariaLabel: 'English' },
];

// Giriş öncesi ekranlarda dil seçimi (sonradan Ayarlar'dan). Seçim tarayıcıda saklanır (i18n detector);
// oturum varsa hesabın dili de güncellenir (e-posta/bildirim dili). Misafir hesabı seçili dille açılır.
export default function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  const change = (lng) => {
    if (lng === i18n.language?.slice(0, 2)) return;
    i18n.changeLanguage(lng);
    if (useAuthStore.getState().status === 'authenticated') api.identityAccountUpdate({ locale: lng }).catch(() => {}); // en iyi çaba
  };
  return <Segmented label={t('me.set.language')} value={i18n.language?.slice(0, 2)} onChange={change} options={OPTIONS} compact />;
}
