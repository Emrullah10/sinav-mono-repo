import api from '@api';
import useApiQuery from '@hooks/useApiQuery';

export const ENROLLMENT_KEY = ['learning', 'enrollment', 'active'];

// Etkin kayıt (yoksa enrollment: null). Misafir ve öğrenci için geçerli.
export default function useEnrollment(options = {}) {
  const q = useApiQuery(ENROLLMENT_KEY, () => api.learningEnrollmentActiveGet(), options);
  return { ...q, enrollment: q.data?.enrollment ?? null };
}
