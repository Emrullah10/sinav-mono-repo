import { rawQuery, wrapWithHttpTranslation } from 'app-shared';
import { makeCatalog } from './application/catalog.js';
import { makeStudy } from './application/study.js';
import { makeCmsItems } from './application/cms-items.js';
import { makeCmsReview } from './application/cms-review.js';
import { makeCmsMisc } from './application/cms-misc.js';
import { makeGeneration } from './application/generation.js';
import { makeCalendar } from './application/calendar.js';
import { makeExamRefresh } from './application/exam-refresh.js';
import { makeLexicon } from './application/lexicon.js';

// Composition root. Use-case'ler `make<Eylem>(deps)` fabrikalarıdır; hepsi dondurulmuş haritadadır.
export const buildContainer = ({ rawQueryFn = rawQuery, translateHttpErrors = true, nowFn = () => new Date(), fetchFn = globalThis.fetch } = {}) => {
  const wrap = translateHttpErrors ? wrapWithHttpTranslation : (fn) => fn;
  const deps = { rawQuery: rawQueryFn, nowFn, wrap, fetchFn };
  const catalog = makeCatalog(deps);
  const study = makeStudy(deps);
  const items = makeCmsItems(deps);
  const review = makeCmsReview({ ...deps, items });
  const misc = makeCmsMisc(deps);
  const generation = makeGeneration({ ...deps, items });
  const examRefresh = makeExamRefresh({ ...deps, generation });
  const calendar = makeCalendar({ ...deps, onExamHeld: examRefresh.queueAfterExam });
  const lexicon = makeLexicon({ ...deps, study, items });
  const wrapAll = (obj) => Object.freeze(Object.fromEntries(Object.entries(obj).map(([k, fn]) => [k, wrap(fn)])));
  const useCases = Object.freeze({ catalog: wrapAll(catalog), study: wrapAll(study), items: wrapAll(items), review: wrapAll(review), misc: wrapAll(misc), generation: wrapAll(generation), calendar: wrapAll(calendar), lexicon: wrapAll(lexicon) });
  return Object.freeze({ deps, useCases });
};

const container = buildContainer();
export default container;
