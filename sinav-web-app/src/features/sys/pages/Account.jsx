import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import { applySession } from '@shared/auth/session';
import Card from '@components/Card/Card';
import Chip from '@components/Chip/Chip';
import Button from '@components/Button/Button';
import Skeleton from '@components/Skeleton/Skeleton';
import ErrorState from '@components/ErrorState/ErrorState';
import EmptyState from '@components/EmptyState/EmptyState';
import SysShell from '../components/SysShell';

// Hesabım ve üyelikler; personel rol/organizasyon değiştirir. GET /account, POST /session/switch (session:switch).
export default function Account() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useApiQuery(['identity', 'account'], () => api.identityAccountGet());
  const sw = useApiMutation((membershipCode) => api.identitySessionSwitch({ membershipCode }), {
    successMessage: 'sysx.account.switched',
    onSuccess: (session) => { applySession({ data: { data: session } }); qc.invalidateQueries(); },
  });
  return (
    <SysShell title={t('sysx.account.title')} subtitle={t('sysx.account.subtitle')}>
      {isLoading && <Skeleton height={160} />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {data && (
        <>
          <Card>
            <p className="t-title">{data.displayName || data.email}</p>
            <p className="muted t-body-s">{data.email} · {t(`sysx.account.status.${data.status}`, { defaultValue: data.status })}</p>
          </Card>
          {data.memberships.length === 0 && <EmptyState title={t('sysx.account.noMemberships')} />}
          {data.memberships.map((m) => (
            <Card key={m.code}>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <div className="grow">
                  <strong>{t(`sysx.role.${m.role}`, { defaultValue: m.role })}</strong>
                  <p className="muted t-body-s">{m.organizationName} · {t(`sysx.account.org.${m.organizationType}`, { defaultValue: m.organizationType })}</p>
                </div>
                {m.current ? <Chip size="sm" tone="success">{t('sysx.account.current')}</Chip> : <Button size="sm" variant="secondary" loading={sw.isPending} onClick={() => sw.mutate(m.code)}>{t('sysx.account.switch')}</Button>}
              </div>
            </Card>
          ))}
        </>
      )}
    </SysShell>
  );
}
