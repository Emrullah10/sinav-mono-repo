import { rawQuery, wrapWithHttpTranslation } from 'app-shared';

// Composition root. Use-case'ler `make<Eylem>(deps)` fabrikalarıdır; hepsi dondurulmuş haritadadır.
export const buildContainer = ({ rawQueryFn = rawQuery, translateHttpErrors = true, nowFn = () => new Date() } = {}) => {
  const wrap = translateHttpErrors ? wrapWithHttpTranslation : (fn) => fn;
  const deps = { rawQuery: rawQueryFn, nowFn, wrap };
  const useCases = Object.freeze({});
  return Object.freeze({ deps, useCases });
};

const container = buildContainer();
export default container;
