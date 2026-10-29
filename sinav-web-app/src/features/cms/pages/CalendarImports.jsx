import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import { useHasPermission } from '@shared/auth/permissions';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import TextInput from '@components/TextInput/TextInput';
import Banner from '@components/Banner/Banner';
import Chip from '@components/Chip/Chip';
import Skeleton from '@components/Skeleton/Skeleton';
import EmptyState from '@components/EmptyState/EmptyState';
import ErrorState from '@components/ErrorState/ErrorState';
import StatusChip from '../components/StatusChip';
import Pager from '../components/Pager';
import s from '../components/Cms.module.scss';

const ACTION_TONE = { create: 'success', update: 'warning', cancel: 'danger' };
const DATE_FIELDS = ['date', 'applicationStart', 'applicationEnd', 'lateApplicationEnd', 'resultDate'];
const fmt = (d) => (d ? dayjs(d).format('D MMM YYYY') : '—');

const readAsBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});

// Öneri tablosu: her satır seçilebilir; onay yalnız seçilenleri uygular.
function Proposals({ imp }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canReview = useHasPermission('content:review');
  const [picked, setPicked] = useState(() => new Set(imp.proposals.map((p) => p.key)));
  const refresh = () => qc.invalidateQueries({ queryKey: ['content', 'cms', 'calendar'] });
  const apply = useApiMutation(() => api.contentCmsCalendarImportApply(imp.code, { keys: [...picked] }), { successMessage: 'cmsx.cal.applied', onSuccess: refresh });
  const reject = useApiMutation(() => api.contentCmsCalendarImportReject(imp.code, {}), { onSuccess: refresh });
  const toggle = (key) => setPicked((x) => { const n = new Set(x); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const pending = imp.status === 'pending';
  return (
    <div className="stack-sm" style={{ marginTop: 'var(--space-3)' }}>
      <div className={s.wrap}>
        <table className={s.table}>
          <thead>
            <tr>
              {pending && <th aria-label={t('cmsx.cal.select')} />}
              <th>{t('cmsx.cal.action')}</th><th>{t('cmsx.cal.session')}</th><th>{t('cmsx.cal.examDate')}</th>
              <th>{t('cmsx.cal.application')}</th><th>{t('cmsx.cal.result')}</th><th>{t('cmsx.cal.changes')}</th>
            </tr>
          </thead>
          <tbody>
            {imp.proposals.map((p) => (
              <tr key={p.key}>
                {pending && <td><input type="checkbox" checked={picked.has(p.key)} onChange={() => toggle(p.key)} aria-label={p.key} /></td>}
                <td><Chip size="sm" tone={ACTION_TONE[p.action]}>{t(`cmsx.cal.act.${p.action}`)}</Chip></td>
                <td><strong>{p.name || p.key}</strong><div className={`muted ${s.mono}`}>{p.key}</div></td>
                <td className="tnum">{fmt(p.date)}</td>
                <td className="tnum">{fmt(p.applicationStart)} – {fmt(p.applicationEnd)}{p.lateApplicationEnd && <div className="muted">{t('cmsx.cal.late')}: {fmt(p.lateApplicationEnd)}</div>}</td>
                <td className="tnum">{fmt(p.resultDate)}</td>
                <td className="t-body-s">
                  {Object.entries(p.changes || {}).map(([f, c]) => (
                    <div key={f}>
                      {t(`cmsx.cal.field.${f}`)}: {DATE_FIELDS.includes(f)
                        ? <><span className={s.diffRemoved}>{fmt(c.from)}</span> → <span className={s.diffAdded}>{fmt(c.to)}</span></>
                        : <><span className={s.diffRemoved}>{String(c.from)}</span> → <span className={s.diffAdded}>{String(c.to)}</span></>}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pending && canReview && (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Button size="sm" loading={apply.isPending} disabled={!picked.size} onClick={() => apply.mutate()}>{t('cmsx.cal.apply', { n: picked.size })}</Button>
          <Button size="sm" variant="tertiary" loading={reject.isPending} onClick={() => reject.mutate()}>{t('cmsx.cal.reject')}</Button>
        </div>
      )}
      {pending && !canReview && <p className="muted t-body-s">{t('cmsx.cal.reviewerOnly')}</p>}
    </div>
  );
}

function ImportCard({ imp }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(imp.status === 'pending');
  return (
    <Card>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <strong className="grow">#{imp.code} · {t('cmsx.cal.year', { year: imp.year ?? '—' })}</strong>
        <StatusChip status={imp.status} />
        <span className="muted t-caption tnum">{dayjs(imp.createdAt).format('D MMM YYYY HH:mm')}</span>
      </div>
      <p className="muted t-body-s">
        {imp.parsedCount != null && t('cmsx.cal.summary', { parsed: imp.parsedCount, proposals: imp.proposals.length, same: imp.unchangedCount ?? 0 })}
        {imp.parser === 'llm' && ` · ${t('cmsx.cal.parserLlm')}`}
        {imp.decidedBy && ` · ${t('cmsx.cal.decidedBy', { name: imp.decidedBy.displayName })}`}
      </p>
      {imp.needsUpload && imp.status === 'failed' && (
        <Banner tone="warning">
          {t('cmsx.cal.blocked')}{' '}
          {imp.sourceUrl && <a className={s.link} href={imp.sourceUrl} target="_blank" rel="noreferrer">{t('cmsx.cal.openPdf')}</a>}
          {imp.pageUrl && <> · <a className={s.link} href={imp.pageUrl} target="_blank" rel="noreferrer">{t('cmsx.cal.openPage')}</a></>}
        </Banner>
      )}
      {imp.error && !imp.needsUpload && <Banner tone="error">{imp.error}</Banner>}
      {imp.problems?.length > 0 && <Banner tone="warning">{t('cmsx.cal.problems', { n: imp.problems.length })}: {imp.problems.map((p) => p.line).join(' · ')}</Banner>}
      {imp.proposals.length > 0 && (
        <>
          <div style={{ marginTop: 'var(--space-3)' }}><Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>{open ? t('cmsx.ai.hide') : t('cmsx.cal.show', { n: imp.proposals.length })}</Button></div>
          {open && <Proposals imp={imp} />}
        </>
      )}
    </Card>
  );
}

// ÖSYM sınav takvimi: haftalık tarama + PDF yükleme; öneriler gözden geçiren onayıyla uygulanır.
export default function CalendarImports() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canWrite = useHasPermission('content:write');
  const [page, setPage] = useState(1);
  const [file, setFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const params = { page };
  const { data, isLoading, error, refetch } = useApiQuery(['content', 'cms', 'calendar', params], () => api.contentCmsCalendarImportsList(params));
  const refresh = () => qc.invalidateQueries({ queryKey: ['content', 'cms', 'calendar'] });
  const scan = useApiMutation(() => api.contentCmsCalendarScan(), { successMessage: 'cmsx.cal.scanned', onSuccess: refresh });
  const upload = useApiMutation(async () => api.contentCmsCalendarUpload({ pdfBase64: await readAsBase64(file), ...(sourceUrl.trim() && { sourceUrl: sourceUrl.trim() }) }), {
    successMessage: 'cmsx.cal.uploaded', onSuccess: () => { setFile(null); setSourceUrl(''); refresh(); },
  });
  return (
    <div className={s.page}>
      <PageHeader title={t('cmsx.cal.title')} subtitle={t('cmsx.cal.subtitle')} />
      {canWrite && (
        <Card>
          <div className="stack">
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <Button variant="secondary" loading={scan.isPending} onClick={() => scan.mutate()}>{t('cmsx.cal.scan')}</Button>
              <span className="muted t-body-s">{t('cmsx.cal.scanHelp')}</span>
            </div>
            <form className={s.toolbar} onSubmit={(e) => { e.preventDefault(); if (file) upload.mutate(); }}>
              <label className="stack-sm">
                <span className="t-body-s">{t('cmsx.cal.file')}</span>
                <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
              <TextInput label={t('cmsx.cal.sourceUrl')} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://dokuman.osym.gov.tr/…" />
              <Button type="submit" loading={upload.isPending} disabled={!file}>{t('cmsx.cal.upload')}</Button>
            </form>
          </div>
        </Card>
      )}
      {isLoading && <Skeleton height={160} />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {data?.items.length === 0 && <EmptyState title={t('cmsx.cal.emptyTitle')} body={t('cmsx.cal.emptyBody')} />}
      {data?.items.map((imp) => <ImportCard key={imp.code} imp={imp} />)}
      {data && data.total > data.pageSize && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </div>
  );
}
