import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, Palette } from 'lucide-react';
import { BG_PRESETS } from '@sinav/domain';
import Routes from '@shared/constant/route-paths';
import { useResolvedTheme } from '@shared/providers/ThemeProvider';
import { useBackgroundStore } from '@store/backgroundStore';
import Banner from '@components/Banner/Banner';
import Button from '@components/Button/Button';
import BackgroundTile from './BackgroundTile';
import useBackground from '../hooks/useBackground';
import styles from './Background.module.scss';

const same = (a, b) => a?.key === b?.key && (a?.key !== 'custom' || a?.id === b?.id);

// Ayarlar › Görünüm: Sade + 2 ücretsiz desen, 3 Premium hazır desen, kullanıcının stüdyoda kaydettikleri ve stüdyoya giriş.
export default function BackgroundPicker() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const scheme = useResolvedTheme();
  const selection = useBackgroundStore((s) => s.selection);
  const custom = useBackgroundStore((s) => s.custom);
  const lapsed = useBackgroundStore((s) => s.locked);
  const { premium, save } = useBackground();
  const [upsell, setUpsell] = useState(false);

  const pick = (sel, tier) => {
    if (tier === 'premium' && !premium) { setUpsell(true); return; }
    setUpsell(false);
    if (!same(sel, selection)) save.mutate({ background: sel });
  };

  return (
    <div className={`stack-sm ${styles.picker}`}>
      <div>
        <span className="t-title">{t('bg.title')}</span>
        <p className="t-body-s muted">{t('bg.subtitle')}</p>
      </div>
      {lapsed && <Banner tone="warning">{t('bg.lapsed')}</Banner>}
      <div className={styles.grid} role="radiogroup" aria-label={t('bg.title')}>
        {BG_PRESETS.map((p) => (
          <BackgroundTile key={p.key} spec={p.spec} scheme={scheme} label={t(`bg.preset.${p.key}`)} premium={p.tier === 'premium'} selected={same({ key: p.key }, selection)} onClick={() => pick({ key: p.key }, p.tier)} />
        ))}
        {custom.map((c, i) => (
          <BackgroundTile key={c.id} spec={c} scheme={scheme} label={`${t('bg.custom')} ${i + 1}`} selected={same({ key: 'custom', id: c.id }, selection)} onClick={() => pick({ key: 'custom', id: c.id }, 'premium')} />
        ))}
        <button type="button" className={styles.create} onClick={() => nav(Routes.meBackground)}>
          <span className={styles.createIcon} aria-hidden><Sparkles size={20} /></span>
          <span className={styles.label}>{t('bg.create')}</span>
          {!premium && <span className={styles.premiumInline}>{t('bg.premium')}</span>}
        </button>
      </div>
      {upsell && (
        <Banner tone="accent" title={t('bg.lockedTitle')} onClose={() => setUpsell(false)} action={<Button size="sm" startIcon={<Sparkles size={16} />} onClick={() => nav(Routes.premium)}>{t('bg.cta')}</Button>}>
          {t('bg.lockedBody')}
        </Banner>
      )}
      {custom.length > 0 && (
        <div><Button variant="tertiary" size="sm" startIcon={<Palette size={16} />} onClick={() => nav(Routes.meBackground)}>{t('bg.studio.title')}</Button></div>
      )}
    </div>
  );
}
