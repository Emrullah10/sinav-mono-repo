import { useQuery } from '@tanstack/react-query';

// queryFn bir axios yanıtı döndürür; data.data açılır.
export default function useApiQuery(key, fn, options = {}) {
  return useQuery({ queryKey: key, queryFn: async () => (await fn())?.data?.data, ...options });
}
