import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { ArrowLeft, Plus, Sparkles, Trash2 } from 'lucide-react';
import { tokens } from '@sinav/design-tokens';
import { BG_PATTERNS, BG_COLOR_KEYS, BG_MAX_CUSTOM, BG_SCALE, bgColorHex, normalizeBgSpec, newBgId } from '@sinav/domain';
import Routes from '@shared/constant/route-paths';
import { useResolvedTheme } from '@shared/providers/ThemeProvider';
import { bgStyle } from '@shared/utils/backgroundStyle';
import { notify } from '@shared/utils/notify';
import { useBackgroundStore } from '@store/backgroundStore';
import PageHeader from '@components/PageHeader/PageHeader';
import IconButton from '@components/IconButton/IconButton';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import Switch from '@components/Switch/Switch';
import Banner from '@components/Banner/Banner';
import BackgroundTile from '../components/BackgroundTile';
import useBackground from '../hooks/useBackground';
import styles from '../components/Background.module.scss';

const DEFAULT_SPEC = { pattern: 'contour', color: 'teal', intensity: 2, scale: 1, glow: true };

// Açık ve koyu temada aynı tasarımın yan yana önizlemesi (tema belirteçleriyle, sayfanın temasından bağımsız).
function SchemePreview({ spec, scheme, label }) {
  const { t } = useTranslation();
  const c = tokens[scheme];
  return (
    <figure className={styles.scheme} style={{ ...bgStyle(spec, scheme), backgroundColor: c.bg.canvas, borderColor: c.border.default }}>
      <figcaption className={styles.schemeLabel} style={{ background: c.bg.surface, color: c.text.secondary }}>{label}</figcaption>
      <div className={styles.sample} style={{ background: c.bg.surface, borderColor: c.border.default }}>
        <span style={{ color: c.text.primary }} className="t-title">{t('bg.studio.sampleTitle')}</span>
        <span style={{ color: c.text.secondary }} className="t-body-s">{t('bg.studio.sampleBody')}</span>
        <span className={styles.samplePill} style={{ background: c.accent.default }} />
      </div>
      <div className={classNames(styles.sample, styles.sampleSmall)} style={{ background: c.bg.surface, borderColor: c.border.default }}>
        <span className={styles.sampleLine} style={{ background: c.border.default }} />
        <span className={styles.sampleLine} style={{ background: c.border.default, width: '60%' }} />
      </div>
    </figure>
  );
}

function Field({ label, value, children }) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}><span className="t-title">{label}</span>{value != null && <span className="t-body-s muted tnum">{value}</span>}</div>
      {children}
    </div>
  );
}

// Desen stüdyosu (Premium; ücretsiz kullanıcı serbestçe dener, kaydetmek Premium ister).
// Ayarlanan desen, çalışırken tüm uygulamanın arkasında canlı görünür (draft); çıkınca kayıtlı seçime döner.
export default function BackgroundStudio() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const scheme = useResolvedTheme();
  const custom = useBackgroundStore((s) => s.custom);
  const selection = useBackgroundStore((s) => s.selection);
  const setDraft = useBackgroundStore((s) => s.setDraft);
  const { premium, save } = useBackground();

  const startId = params.get('id') || (selection.key === 'custom' ? selection.id : null);
  const start = custom.find((c) => c.id === startId);
  const [editingId, setEditingId] = useState(start?.id || null);
  const [spec, setSpec] = useState(() => normalizeBgSpec(start) || DEFAULT_SPEC);

  useEffect(() => { setDraft(spec); }, [spec, setDraft]);
  useEffect(() => () => setDraft(null), [setDraft]);

  const set = (patch) => setSpec((s) => normalizeBgSpec({ ...s, ...patch }));
  const full = !editingId && custom.length >= BG_MAX_CUSTOM;
  const back = () => nav(Routes.meSettings);

  const submit = () => {
    if (!premium) { nav(Routes.premium); return; }
    const id = editingId || newBgId();
    const list = editingId ? custom.map((c) => (c.id === id ? { id, ...spec } : c)) : [...custom, { id, ...spec }];
    save.mutate({ customBackgrounds: list, background: { key: 'custom', id } }, {
      onSuccess: () => { setEditingId(id); notify(t('bg.studio.saved'), 'success'); },
    });
  };
  const remove = (id) => {
    save.mutate({ customBackgrounds: custom.filter((c) => c.id !== id) }, {
      onSuccess: () => {
        if (editingId === id) setEditingId(null);
        notify(t('bg.studio.deleted'), 'success');
      },
    });
  };
  const edit = (c) => { setEditingId(c.id); setSpec(normalizeBgSpec(c)); };
  const fresh = () => { setEditingId(null); setSpec(DEFAULT_SPEC); };

  return (
    <div className={styles.studioPage}>
      <PageHeader
        back={<IconButton label={t('common.back')} onClick={back}><ArrowLeft size={20} /></IconButton>}
        title={t('bg.studio.title')}
        subtitle={t('bg.studio.subtitle')}
      />
      <div className={styles.studio}>
        <div className={styles.previewCol}>
          <div className={styles.schemes}>
            <SchemePreview spec={spec} scheme="light" label={t('bg.studio.previewLight')} />
            <SchemePreview spec={spec} scheme="dark" label={t('bg.studio.previewDark')} />
          </div>
          {custom.length > 0 && (
            <Card className="stack-sm">
              <div className={styles.fieldHead}>
                <span className="t-title">{t('bg.mine')}</span>
                <span className="t-body-s muted tnum">{t('bg.mineCount', { n: custom.length, max: BG_MAX_CUSTOM })}</span>
              </div>
              <div className={styles.mine}>
                {custom.map((c, i) => (
                  <div key={c.id} className={styles.mineItem}>
                    <BackgroundTile size="sm" role="button" spec={c} scheme={scheme} label={`${t('bg.custom')} ${i + 1}`} selected={editingId === c.id} onClick={() => edit(c)} />
                    <IconButton className={styles.mineDelete} label={`${t('bg.studio.delete')} · ${t('bg.custom')} ${i + 1}`} onClick={() => remove(c.id)}><Trash2 size={16} /></IconButton>
                  </div>
                ))}
                {custom.length < BG_MAX_CUSTOM && (
                  <button type="button" className={classNames(styles.create, styles.createSm, !editingId && styles.createActive)} onClick={fresh}>
                    <span className={styles.createIcon} aria-hidden><Plus size={18} /></span>
                    <span className={styles.label}>{t('bg.studio.new')}</span>
                  </button>
                )}
              </div>
            </Card>
          )}
        </div>

        <Card className={styles.controls}>
          <Field label={t('bg.studio.pattern')}>
            <div className={styles.patterns} role="radiogroup" aria-label={t('bg.studio.pattern')}>
              {BG_PATTERNS.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={spec.pattern === p} className={classNames(styles.patternBtn, spec.pattern === p && styles.on)} onClick={() => set({ pattern: p })}>
                  <span className={styles.swatch} style={bgStyle({ ...spec, pattern: p, intensity: 5, scale: 0.6, glow: false }, scheme)} aria-hidden />
                  <span>{t(`bg.pattern.${p}`)}</span>
                </button>
              ))}
            </div>
          </Field>

          <Field label={t('bg.studio.colorLabel')} value={t(`bg.color.${spec.color}`)}>
            <div className={styles.colors} role="radiogroup" aria-label={t('bg.studio.colorLabel')}>
              {BG_COLOR_KEYS.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={spec.color === k} aria-label={t(`bg.color.${k}`)} title={t(`bg.color.${k}`)} className={classNames(styles.color, spec.color === k && styles.on)} style={{ '--sw': bgColorHex(k, scheme) }} onClick={() => set({ color: k })} />
              ))}
            </div>
          </Field>

          <Field label={t('bg.studio.intensity')} value={`${spec.intensity}/5`}>
            <input type="range" className={styles.range} min={1} max={5} step={1} value={spec.intensity} aria-label={t('bg.studio.intensity')} onChange={(e) => set({ intensity: Number(e.target.value) })} />
          </Field>

          <Field label={t('bg.studio.scale')} value={`${spec.scale.toFixed(1)}×`}>
            <input type="range" className={styles.range} min={BG_SCALE[0]} max={BG_SCALE[1]} step={0.1} value={spec.scale} aria-label={t('bg.studio.scale')} onChange={(e) => set({ scale: Number(e.target.value) })} />
          </Field>

          <Switch label={t('bg.studio.glow')} description={t('bg.studio.glowHint')} checked={spec.glow} onChange={(v) => set({ glow: v })} />

          {!premium && <p className={styles.tryFree}><Sparkles size={16} aria-hidden />{t('bg.studio.tryFree')}</p>}
          {premium && full && <Banner tone="warning">{t('bg.studio.limit')}</Banner>}

          <div className={styles.actions}>
            <Button variant="secondary" onClick={back}>{t('bg.studio.cancel')}</Button>
            <Button onClick={submit} loading={save.isPending} disabled={premium && full} startIcon={premium ? undefined : <Sparkles size={16} />}>
              {!premium ? t('bg.studio.unlock') : editingId ? t('bg.studio.update') : t('bg.studio.save')}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
