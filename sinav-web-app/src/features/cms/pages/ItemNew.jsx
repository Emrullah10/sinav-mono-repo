import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import api from '@api';
import useApiMutation from '@hooks/useApiMutation';
import useApiQuery from '@hooks/useApiQuery';
import Routes, { path } from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import Button from '@components/Button/Button';
import TextInput from '@components/TextInput/TextInput';
import Select from '@components/Select/Select';
import Banner from '@components/Banner/Banner';
import Card from '@components/Card/Card';
import BodyEditor from '../components/BodyEditor';
import { emptyQuestion, cleanQuestion } from '../components/QuestionForm';
import useTaxonomy from '../hooks/useTaxonomy';
import s from '../components/Cms.module.scss';

const KINDS = ['question', 'passage', 'note', 'vocab_entry', 'translation_prompt', 'exam_form', 'article'];

// CMS-02..04 oluşturma: POST /cms/items. Benzer soru: GET /cms/items/new/similar
export default function ItemNew() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const tax = useTaxonomy();
  const [kind, setKind] = useState('question');
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('en');
  const [accessTier, setAccessTier] = useState('free');
  const [examKey, setExamKey] = useState('yds');
  const [skillKey, setSkillKey] = useState('');
  const [body, setBody] = useState(emptyQuestion());
  const [jsonOk, setJsonOk] = useState(true);
  const [bodyKey, setBodyKey] = useState(0);

  const stem = kind === 'question' ? (body.stem || '').trim() : '';
  const similar = useApiQuery(['content', 'cms', 'similar', 'new', stem], () => api.contentCmsItemSimilarList('new', { stem, limit: 5 }), { enabled: stem.length >= 8 });

  const create = useApiMutation((payload) => api.contentCmsItemCreate(payload), {
    successMessage: 'cmsx.new.created',
    onSuccess: (item) => { qc.invalidateQueries({ queryKey: ['content', 'cms', 'items'] }); nav(path(Routes.cmsItem, { code: item.code })); },
  });
  const changeKind = (k) => { setKind(k); setBody(k === 'question' ? emptyQuestion() : {}); setBodyKey((x) => x + 1); setJsonOk(true); };
  const submit = (e) => {
    e.preventDefault();
    create.mutate({
      kind, language, accessTier, ...(title.trim() && { title: title.trim() }),
      ...(examKey && { examKeys: [examKey] }), ...(skillKey && { skills: [{ key: skillKey, weight: 1 }] }),
      body: kind === 'question' ? cleanQuestion(body) : body,
    });
  };

  return (
    <form className={s.page} onSubmit={submit}>
      <PageHeader title={t('cmsx.new.title')} subtitle={t('cmsx.new.subtitle')} actions={<Button type="submit" loading={create.isPending} disabled={!jsonOk}>{t('cmsx.new.create')}</Button>} />
      <Card>
        <div className={s.grid2}>
          <Select label={t('cmsx.list.kind')} value={kind} onChange={(e) => changeKind(e.target.value)} options={KINDS.map((k) => ({ value: k, label: t(`cmsx.kind.${k}`) }))} />
          <TextInput label={t('cmsx.col.title')} value={title} onChange={(e) => setTitle(e.target.value)} helper={t('cmsx.new.titleHelp')} />
          <Select label={t('cmsx.new.language')} value={language} onChange={(e) => setLanguage(e.target.value)} options={[{ value: 'en', label: 'English' }, { value: 'tr', label: 'Türkçe' }]} />
          <Select label={t('cmsx.col.tier')} value={accessTier} onChange={(e) => setAccessTier(e.target.value)} options={['free', 'premium'].map((v) => ({ value: v, label: t(`enums.access_tier.${v}`) }))} />
          <Select label={t('cmsx.new.exam')} value={examKey} onChange={(e) => setExamKey(e.target.value)} options={[{ value: '', label: t('cmsx.select') }, ...(tax.data?.exams || []).map((x) => ({ value: x.key, label: x.shortName || x.name }))]} />
          <Select label={t('cmsx.list.skill')} helper={t('cmsx.new.skillHelp')} value={skillKey} onChange={(e) => setSkillKey(e.target.value)} options={[{ value: '', label: t('cmsx.select') }, ...(tax.data?.skills || []).map((x) => ({ value: x.key, label: `${'· '.repeat(x.depth)}${x.name}` }))]} />
        </div>
      </Card>
      {similar.data?.items?.length > 0 && (
        <Banner tone="warning" title={t('cmsx.new.similar')}>{similar.data.items.map((i) => `#${i.code}`).join(', ')}</Banner>
      )}
      <Card><BodyEditor key={bodyKey} kind={kind} value={body} onChange={setBody} onValidity={setJsonOk} questionTypes={tax.data?.questionTypes} /></Card>
    </form>
  );
}
