import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@api';
import useApiMutation from '@hooks/useApiMutation';
import Routes, { path } from '@shared/constant/route-paths';
import { notify } from '@shared/utils/notify';
import { queryClient } from '@shared/providers/QueryProvider';

// POST /practice-sessions → oturum ekranına gider. body: { questionTypeKeys?, skillKeys?, count?, mode?, difficulty? }
export default function usePracticeStart() {
  const nav = useNavigate();
  const { t } = useTranslation();
  return useApiMutation((body) => api.learningPracticeSessionCreate(body), {
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['learning', 'study'] });
      if (r.cappedByQuota) notify(t('study.setup.capped', { n: r.count }), 'info');
      nav(path(Routes.session, { code: r.code }));
    },
  });
}
