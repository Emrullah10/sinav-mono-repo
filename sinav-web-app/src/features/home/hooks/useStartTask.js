import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@api';
import useApiMutation from '@hooks/useApiMutation';
import Routes, { path } from '@shared/constant/route-paths';
import { notify } from '@shared/utils/notify';
import { queryClient } from '@shared/providers/QueryProvider';
import { TODAY_KEY } from './useToday';

// POST /plan-tasks/{code}/start → görev türüne göre ilgili ekrana yönlendirir.
export default function useStartTask() {
  const nav = useNavigate();
  const { t } = useTranslation();
  return useApiMutation((code) => api.learningPlanTaskStart(code), {
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: TODAY_KEY });
      if (r.empty) return notify(t('home.empty'), 'info');
      const kind = r.task?.kind;
      if (kind === 'note' && r.note) return nav(path(Routes.note, { id: r.note.itemCode }));
      if (kind === 'mock_exam' && r.exam) return nav(path(Routes.examIntro, { id: r.exam.formCode }));
      if (kind === 'translation') return nav(Routes.translation);
      if (kind === 'vocab_review') return nav(Routes.vocabReview);
      if (kind === 'diagnostic') return nav(Routes.diagnosticTest);
      if (r.session?.code) return nav(path(Routes.session, { code: r.session.code }));
      return undefined;
    },
  });
}
