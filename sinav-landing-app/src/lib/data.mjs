// Derleme zamanı veri kaynakları (public API; kapalıysa önbellek).
import { publicGet } from './public-api.mjs';

const CONTENT = 'sinav-service-content/v1/public';
const ID = 'sinav-service-identity/v1/public';
const BILL = 'sinav-service-billing/v1/public';

export const getProducts = async () => (await publicGet('products', `${BILL}/products`)).products;
export const getExams = async () => (await publicGet('exams', `${CONTENT}/exams`)).items;
export const getArticles = async (type) => (await publicGet(`articles-${type}`, `${CONTENT}/articles?type=${type}&pageSize=100`)).items;
export const getArticle = async (type, slug) => publicGet(`article-${type}-${slug}`, `${CONTENT}/articles/${type}/${slug}`);
export const getCategories = async (type) => (await publicGet(`categories-${type}`, `${CONTENT}/article-categories?type=${type}`)).items;
export const getLegalList = async () => publicGet('legal', `${ID}/legal-documents?locale=tr`);
export const getLegal = async (type) => publicGet(`legal-${type}`, `${ID}/legal-documents/${type}?locale=tr`);
