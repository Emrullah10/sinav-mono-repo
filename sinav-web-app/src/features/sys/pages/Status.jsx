import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import axios from '@shared/axios/axios';
import useApiQuery from '@hooks/useApiQuery';
import { apiErrorCode } from '@shared/utils/apiError';
import Routes from '@shared/constant/route-paths';
import Card from '@components/Card/Card';
import Chip from '@components/Chip/Chip';
import Banner from '@components/Banner/Banner';
import Button from '@components/Button/Button';
import Skeleton from '@components/Skeleton/Skeleton';
import ErrorState from '@components/ErrorState/ErrorState';
import SysShell from '../components/SysShell';
import s from '../components/Sys.module.scss';

// SYS-05 yönetici görünümü: servis sağlığı + bakım durumu. GET /api/gateway/health/services (platform:metric:read).
// Bakım modu açıkken gateway her uca 503 MAINTENANCE döner; bu yüzden durum bu yanıttan çıkarılır.
export default function Status() {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useApiQuery(['gateway', 'health'], () => axios.get('/api/gateway/health/services'), { refetchInterval: 15000, retry: false });
  const maintenance = apiErrorCode(error) === 'MAINTENANCE';
  const services = data?.services || [];
  const down = services.filter((x) => !x.up).length;
  return (
    <SysShell title={t('sysx.status.title')} subtitle={t('sysx.status.subtitle')}
      actions={<Button variant="secondary" startIcon={<RefreshCw size={16} />} loading={isFetching} onClick={() => refetch()}>{t('sysx.status.refresh')}</Button>}>
      <Banner tone={maintenance ? 'warning' : 'success'} title={maintenance ? t('sysx.status.maintOn') : t('sysx.status.maintOff')}>
        {maintenance ? <Link className={s.link} to={Routes.maintenance}>{t('sysx.status.maintPage')}</Link> : t('sysx.status.maintHow')}
      </Banner>
      {isLoading && <Skeleton height={160} />}
      {error && !maintenance && <ErrorState error={error} onRetry={refetch} />}
      {data && (
        <>
          <Banner tone={down ? 'error' : 'success'}>{down ? t('sysx.status.someDown', { n: down }) : t('sysx.status.allUp')}</Banner>
          <div className={s.grid}>
            {services.map((x) => (
              <Card key={x.service}>
                <div className="row">
                  {x.up ? <CheckCircle2 size={20} aria-hidden /> : <XCircle size={20} aria-hidden />}
                  <strong className="grow">{x.service.replace('sinav-service-', '')}</strong>
                  <Chip size="sm" tone={x.up ? 'success' : 'danger'}>{x.up ? t('sysx.status.up') : t('sysx.status.down')}</Chip>
                </div>
                <p className="muted t-body-s tnum">{x.latencyMs != null ? `${x.latencyMs} ms` : '—'}</p>
              </Card>
            ))}
          </div>
          <p className="muted t-caption">{t('sysx.status.updated', { time: new Date(dataUpdatedAt).toLocaleTimeString('tr-TR') })}</p>
        </>
      )}
    </SysShell>
  );
}
