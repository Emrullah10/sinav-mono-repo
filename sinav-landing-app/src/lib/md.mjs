// Markdown → HTML (içerik kendi API'mizden gelir; güvenilir kaynak).
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';

const proc = unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeStringify);
export const md = async (src) => String(await proc.process(src || ''));
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
export const tl = (n) => `${Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`;
