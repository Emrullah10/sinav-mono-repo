// { success, data } zarfını açar. React Query `select`/queryFn'lerinde kullanılır.
export const unwrap = (response) => response?.data?.data;
export const call = async (promise) => unwrap(await promise);
