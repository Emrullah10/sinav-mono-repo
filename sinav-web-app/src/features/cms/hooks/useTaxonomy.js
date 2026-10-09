import api from '@api';
import useApiQuery from '@hooks/useApiQuery';

export default function useTaxonomy() {
  return useApiQuery(['content', 'cms', 'taxonomy'], () => api.contentCmsTaxonomyGet(), { staleTime: 5 * 60e3 });
}
