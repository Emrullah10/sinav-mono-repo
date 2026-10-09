import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import api from '@api';
import i18n from '@shared/translation/i18n';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import { queryClient } from '@shared/providers/QueryProvider';
import { useThemeStore } from '@store/themeStore';
import { useAuthStore } from '@store/authStore';
import { signOut } from '@shared/auth/session';
import Routes from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Segmented from '@components/Segmented/Segmented';
import Select from '@components/Select/Select';
import Switch from '@components/Switch/Switch';
import TextInput from '@components/TextInput/TextInput';
import Button from '@components/Button/Button';
import Modal from '@components/Modal/Modal';
import Banner from '@components/Banner/Banner';
import ErrorState from '@components/ErrorState/ErrorState';
import { SkeletonList } from '@components/Skeleton/Skeleton';
import styles from '../components/page.module.scss';

const SCALES = [-1, 0, 1, 2];
const MODES = ['learning', 'quick', 'timed', 'standard', 'relaxed'];

function Section({ title, children }) {
  return <section className="stack-sm" aria-label={title}><h2 className="t-heading-2">{title}</h2><Card className="stack-sm">{children}</Card></section>;
}

// ME-09: ayarlar ve tercihler. Kimlik: hesap, şifre, tercihler, bildirimler, onaylar, veri dışa aktarma · öğrenme: sınav varsayılanları · öğretmen geçmişi.
export default function Settings() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const setTheme = useThemeStore((s) => s.setMode);
  const account = useApiQuery(['me', 'account'], () => api.identityAccountGet());
  const prefs = useApiQuery(['me', 'prefs'], () => api.identityPreferencesGet());
  const notif = useApiQuery(['me', 'notif'], () => api.identityNotificationPrefsGet());
  const learner = useApiQuery(['me', 'learner'], () => api.learningSettingsGet());
  const exp = useApiQuery(['me', 'export'], () => api.identityDataExportGet());
  const consents = useApiQuery(['me', 'consents'], () => api.identityConsentsList());

  const [name, setName] = useState(null);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [clearing, setClearing] = useState(false);

  const keep = (key) => (d) => queryClient.setQueryData(key, d);
  const savePrefs = useApiMutation((b) => api.identityPreferencesUpdate(b), { onSuccess: keep(['me', 'prefs']) });
  const saveNotif = useApiMutation((b) => api.identityNotificationPrefsUpdate(b), { onSuccess: keep(['me', 'notif']) });
  const saveLearner = useApiMutation((b) => api.learningSettingsUpdate(b), { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me', 'learner'] }) });
  const saveAccount = useApiMutation((b) => api.identityAccountUpdate(b), {
    successMessage: 'me.set.saved',
    onSuccess: (d, b) => {
      queryClient.invalidateQueries({ queryKey: ['me', 'account'] });
      if (b.displayName != null) { const s = useAuthStore.getState(); s.login({ user: { ...s.user, displayName: d.displayName }, permissions: s.permissions }); }
      if (b.locale) i18n.changeLanguage(b.locale);
      setName(null);
    },
  });
  const savePw = useApiMutation(() => api.identityAccountPasswordSet({ ...(account.data?.hasPassword ? { currentPassword: pw.current } : {}), newPassword: pw.next }), {
    successMessage: 'me.set.pwSaved',
    onSuccess: () => { setPw({ current: '', next: '' }); queryClient.invalidateQueries({ queryKey: ['me', 'account'] }); },
  });
  const consent = useApiMutation((b) => api.identityConsentRecord(b), { onSuccess: keep(['me', 'consents']) });
  const requestExport = useApiMutation(() => api.identityDataExportRequest(), { successMessage: 'me.set.exportRequested', onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me', 'export'] }) });
  const clearHistory = useApiMutation(() => api.tutorConversationsDeleteAll(), {
    successMessage: 'me.set.historyCleared',
    onSuccess: () => { setClearing(false); queryClient.invalidateQueries({ queryKey: ['tutor'] }); },
  });

  const a = account.data;
  const p = prefs.data;
  const n = notif.data;
  const l = learner.data;
  const err = [account, prefs, notif, learner].find((q) => q.isError);
  if (err) return <div className={styles.page}><ErrorState error={err.error} onRetry={err.refetch} /></div>;
  if (!a || !p || !n || !l) return <div className={styles.page}><SkeletonList rows={4} height={140} /></div>;
  const marketing = consents.data?.find((c) => c.type === 'marketing_email');
  const dirtyName = name != null && name.trim() && name.trim() !== a.displayName;

  const P = (patch) => savePrefs.mutate(patch);
  const N = (patch) => saveNotif.mutate(patch);
  const scaleOpts = SCALES.map((v) => ({ value: v, label: t(`me.set.scale.${v}`) }));

  return (
    <div className={styles.page}>
      <PageHeader title={t('me.set.title')} />

      <Section title={t('me.set.account')}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <TextInput className="grow" label={t('me.set.displayName')} maxLength={80} value={name ?? a.displayName ?? ''} onChange={(e) => setName(e.target.value)} />
          <Button disabled={!dirtyName} loading={saveAccount.isPending && saveAccount.variables?.displayName != null} onClick={() => saveAccount.mutate({ displayName: name.trim() })}>{t('common.save')}</Button>
        </div>
        <Segmented label={t('me.set.language')} value={a.locale} onChange={(v) => saveAccount.mutate({ locale: v })} options={[{ value: 'tr', label: 'Türkçe' }, { value: 'en', label: 'English' }]} />
        <p className="t-body-s muted">{t('me.set.email', { email: a.email })}</p>
      </Section>

      <Section title={t('me.set.password')}>
        {a.hasPassword && <TextInput label={t('me.set.currentPw')} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />}
        <TextInput label={t('me.set.newPw')} type="password" autoComplete="new-password" helper={t('me.set.pwHelp')} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        <div><Button disabled={pw.next.length < 8 || (a.hasPassword && !pw.current)} loading={savePw.isPending} onClick={() => savePw.mutate()}>{a.hasPassword ? t('me.set.changePw') : t('me.set.addPw')}</Button></div>
      </Section>

      <Section title={t('me.set.appearance')}>
        <div className="stack-sm"><span className="t-title">{t('me.set.theme')}</span>
          <Segmented label={t('me.set.theme')} value={p.theme} onChange={(v) => { setTheme(v); P({ theme: v }); }} options={['system', 'light', 'dark'].map((v) => ({ value: v, label: t(`me.set.themes.${v}`) }))} /></div>
        <div className="stack-sm"><span className="t-title">{t('me.set.uiScale')}</span><Segmented label={t('me.set.uiScale')} value={p.uiTextScale} onChange={(v) => P({ uiTextScale: v })} options={scaleOpts} /></div>
        <Select label={t('me.set.readingFont')} value={p.readingFont} onChange={(e) => P({ readingFont: e.target.value })} options={['literata', 'figtree', 'atkinson_hyperlegible'].map((v) => ({ value: v, label: t(`me.set.fonts.${v}`) }))} />
        <div className="stack-sm"><span className="t-title">{t('me.set.readingScale')}</span><Segmented label={t('me.set.readingScale')} value={p.readingTextScale} onChange={(v) => P({ readingTextScale: v })} options={scaleOpts} /></div>
        <div className="stack-sm"><span className="t-title">{t('me.set.lineSpacing')}</span><Segmented label={t('me.set.lineSpacing')} value={p.readingLineSpacing} onChange={(v) => P({ readingLineSpacing: v })} options={[{ value: 0, label: t('me.set.spacing.0') }, { value: 1, label: t('me.set.spacing.1') }]} /></div>
        <Switch label={t('me.set.reduceMotion')} checked={p.reduceMotion} onChange={(v) => P({ reduceMotion: v })} />
        <Switch label={t('me.set.sound')} checked={p.soundEnabled} onChange={(v) => P({ soundEnabled: v })} />
        <Switch label={t('me.set.shortcuts')} description={t('me.set.shortcutsHelp')} checked={p.keyboardShortcutsEnabled} onChange={(v) => P({ keyboardShortcutsEnabled: v })} />
        <Switch label={t('me.set.examTimer')} checked={p.showExamTimer} onChange={(v) => P({ showExamTimer: v })} />
      </Section>

      <Section title={t('me.set.notifications')}>
        <Switch label={t('me.set.daily')} checked={n.dailyReminderEnabled} onChange={(v) => N({ dailyReminderEnabled: v })} />
        {n.dailyReminderEnabled && <TextInput label={t('me.set.dailyTime')} type="time" value={n.dailyReminderTime || ''} onChange={(e) => e.target.value && N({ dailyReminderTime: e.target.value })} />}
        <Switch label={t('me.set.review')} checked={n.reviewRemindersEnabled} onChange={(v) => N({ reviewRemindersEnabled: v })} />
        <Switch label={t('me.set.mockSuggest')} checked={n.mockSuggestionsEnabled} onChange={(v) => N({ mockSuggestionsEnabled: v })} />
        <Switch label={t('me.set.weekly')} checked={n.weeklyReportEmailEnabled} onChange={(v) => N({ weeklyReportEmailEnabled: v })} />
        <div className={styles.two}>
          <TextInput label={t('me.set.quietStart')} type="time" value={n.quietHoursStart || ''} onChange={(e) => e.target.value && N({ quietHoursStart: e.target.value })} />
          <TextInput label={t('me.set.quietEnd')} type="time" value={n.quietHoursEnd || ''} onChange={(e) => e.target.value && N({ quietHoursEnd: e.target.value })} />
        </div>
      </Section>

      <Section title={t('me.set.exam')}>
        <Select label={t('me.set.defaultMode')} value={l.defaultMockMode} onChange={(e) => saveLearner.mutate({ defaultMockMode: e.target.value })} options={MODES.map((m) => ({ value: m, label: t(`enums.study_mode.${m}`) }))} />
        <div className="stack-sm"><span className="t-title">{t('me.set.extraTime')}</span>
          <Segmented label={t('me.set.extraTime')} value={l.extraTimePercent} onChange={(v) => saveLearner.mutate({ extraTimePercent: v })} options={[0, 25, 50].map((v) => ({ value: v, label: v === 0 ? t('me.set.none') : `%${v}` }))} />
          <span className="t-body-s muted">{t('me.set.extraTimeHelp')}</span></div>
        <Button variant="tertiary" onClick={() => nav(Routes.meGoal)}>{t('me.nav.goal')}</Button>
      </Section>

      <Section title={t('me.set.privacy')}>
        {marketing && <Switch label={t('me.set.marketing')} checked={marketing.granted} onChange={(v) => consent.mutate({ type: 'marketing_email', granted: v })} />}
        <div className="stack-sm">
          <span className="t-title">{t('me.set.dataExport')}</span>
          <p className="t-body-s muted">{exp.data ? t('me.set.exportStatus', { status: t(`me.set.exportStatuses.${exp.data.status}`), date: dayjs(exp.data.requestedAt).format('D MMMM YYYY') }) : t('me.set.exportHelp')}</p>
          <div><Button variant="secondary" loading={requestExport.isPending} disabled={['requested', 'processing'].includes(exp.data?.status)} onClick={() => requestExport.mutate()}>{t('me.set.requestExport')}</Button></div>
        </div>
        <div className="stack-sm">
          <span className="t-title">{t('me.set.tutorHistory')}</span>
          <div><Button variant="secondary" onClick={() => setClearing(true)}>{t('me.set.clearHistory')}</Button></div>
        </div>
      </Section>

      <Section title={t('me.set.session')}>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => signOut().then(() => nav(Routes.welcome, { replace: true }))}>{t('me.signOut')}</Button>
          <Button variant="destructive" onClick={() => nav(Routes.meDelete)}>{t('me.set.deleteAccount')}</Button>
        </div>
        {a.deletionScheduledFor && <Banner tone="warning">{t('me.set.deletionScheduled', { date: dayjs(a.deletionScheduledFor).format('D MMMM YYYY') })}</Banner>}
      </Section>

      <Modal open={clearing} onClose={() => setClearing(false)} title={t('me.set.clearHistory')}
        footer={<><Button variant="tertiary" onClick={() => setClearing(false)}>{t('common.cancel')}</Button><Button variant="destructive" loading={clearHistory.isPending} onClick={() => clearHistory.mutate()}>{t('me.set.clearConfirm')}</Button></>}>
        <p>{t('me.set.clearBody')}</p>
      </Modal>
    </div>
  );
}
