import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import BubbleLoader from '@components/BubbleLoader/BubbleLoader';
import ErrorState from '@components/ErrorState/ErrorState';
import Routes from '@shared/constant/route-paths';
import { ensureSession } from '@shared/auth/session';
import useApiMutation from '@hooks/useApiMutation';
import api from '@api';

// MKT-07 derin bağlantısı (/seviye-tespiti): misafir oturumu aç, kaydı olan sürdürür, yoksa ONB-01'e gider.
export default function Entry() {
  const nav = useNavigate();
  const go = useApiMutation(async () => {
    await ensureSession();
    const r = await api.learningEnrollmentActiveGet();
    return r?.data?.data?.enrollment ? { to: Routes.onbDiagnostic } : { to: Routes.onbExam };
  }, { onSuccess: (r) => nav(r.to, { replace: true }), onError: () => {} });
  useEffect(() => { go.mutate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (go.isError) return <ErrorState error={go.error} onRetry={() => go.mutate()} />;
  if (go.isSuccess) return <Navigate to={go.data.to} replace />;
  return <BubbleLoader fullscreen />;
}
