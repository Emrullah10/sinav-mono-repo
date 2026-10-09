import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from '@shared/axios/axios';
import useApiMutation from '@hooks/useApiMutation';
import Card from '@components/Card/Card';
import Select from '@components/Select/Select';
import TextInput from '@components/TextInput/TextInput';
import Button from '@components/Button/Button';
import Modal from '@components/Modal/Modal';
import Banner from '@components/Banner/Banner';
import SysShell from '../components/SysShell';

const ROLES = ['guest', 'learner', 'content_editor', 'content_reviewer', 'platform_support']; // superadmin sunucuda korunur

// Oturum sonlandırma. POST /api/gateway/sessions/revoke-by-role | revoke-by-user (platform:session:revoke).
export default function Sessions() {
  const { t } = useTranslation();
  const [role, setRole] = useState('learner');
  const [userId, setUserId] = useState('');
  const [confirm, setConfirm] = useState(null); // { type, label, run }
  const [result, setResult] = useState(null);
  const byRole = useApiMutation(() => axios.post('/api/gateway/sessions/revoke-by-role', { role }), { onSuccess: (d) => { setResult(t('sysx.sessions.doneRole', { n: d.revokedCount, role: t(`sysx.role.${d.role}`, { defaultValue: d.role }) })); setConfirm(null); }, onError: () => setConfirm(null) });
  const byUser = useApiMutation(() => axios.post('/api/gateway/sessions/revoke-by-user', { userId }), { onSuccess: (d) => { setResult(t('sysx.sessions.doneUser', { id: d.userId })); setUserId(''); setConfirm(null); }, onError: () => setConfirm(null) });
  const pending = byRole.isPending || byUser.isPending;
  return (
    <SysShell title={t('sysx.sessions.title')} subtitle={t('sysx.sessions.subtitle')}>
      {result && <Banner tone="success" onClose={() => setResult(null)}>{result}</Banner>}
      <Card>
        <div className="stack-sm">
          <h2 className="t-heading-3">{t('sysx.sessions.byRole')}</h2>
          <Select label={t('sysx.sessions.role')} value={role} onChange={(e) => setRole(e.target.value)} options={ROLES.map((r) => ({ value: r, label: t(`sysx.role.${r}`) }))} />
          <div><Button variant="destructive" onClick={() => setConfirm({ label: t('sysx.sessions.confirmRole', { role: t(`sysx.role.${role}`) }), run: () => byRole.mutate() })}>{t('sysx.sessions.revoke')}</Button></div>
        </div>
      </Card>
      <Card>
        <div className="stack-sm">
          <h2 className="t-heading-3">{t('sysx.sessions.byUser')}</h2>
          <TextInput label={t('sysx.sessions.userId')} inputMode="numeric" value={userId} onChange={(e) => setUserId(e.target.value.replace(/\D/g, ''))} helper={t('sysx.sessions.userHelp')} />
          <div><Button variant="destructive" disabled={!userId} onClick={() => setConfirm({ label: t('sysx.sessions.confirmUser', { id: userId }), run: () => byUser.mutate() })}>{t('sysx.sessions.revoke')}</Button></div>
        </div>
      </Card>
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={t('sysx.sessions.confirmTitle')}
        footer={<><Button variant="tertiary" onClick={() => setConfirm(null)}>{t('common.cancel')}</Button><Button variant="destructive" loading={pending} onClick={() => confirm?.run()}>{t('sysx.sessions.revoke')}</Button></>}>
        <p className="t-body-m">{confirm?.label}</p>
      </Modal>
    </SysShell>
  );
}
