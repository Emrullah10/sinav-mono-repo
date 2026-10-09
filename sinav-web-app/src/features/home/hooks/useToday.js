import api from '@api';
import useApiQuery from '@hooks/useApiQuery';

export const TODAY_KEY = ['learning', 'today'];

// HOME-01: GET /today (plan günü, seri, hedef, vadesi gelenler, hak).
export default function useToday(options = {}) {
  return useApiQuery(TODAY_KEY, () => api.learningTodayGet(), options);
}

export const dateLocale = (lng) => (lng?.startsWith('en') ? 'en-GB' : 'tr-TR');
export const formatDate = (iso, lng, opts = { day: 'numeric', month: 'long', weekday: 'long' }) => {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat(dateLocale(lng), opts).format(d);
};
