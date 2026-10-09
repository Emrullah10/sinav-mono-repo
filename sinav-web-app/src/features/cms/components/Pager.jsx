import { useTranslation } from 'react-i18next';
import Button from '@components/Button/Button';
import s from './Cms.module.scss';

export default function Pager({ page, pageSize, total, onPage }) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil((total || 0) / pageSize));
  return (
    <div className={s.pager}>
      <span className="muted t-body-s tnum">{t('cmsx.pager.total', { count: total || 0, page, pages })}</span>
      <div className="row">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t('common.back')}</Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t('cmsx.pager.next')}</Button>
      </div>
    </div>
  );
}
