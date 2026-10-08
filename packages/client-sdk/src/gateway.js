// Gateway uçları (web: çerez+CSRF, mobil: bearer — taşıma istemci tarafında seçilir).
export const createGatewayApi = (http, { api = '/api' } = {}) => ({
  gatewayMe: (config) => http.get(`${api}/gateway/me`, config),
  gatewayRefresh: (body, config) => http.post(`${api}/gateway/refresh`, body || {}, config),
  gatewayLogout: (body, config) => http.post(`${api}/gateway/logout`, body || {}, config),
  gatewayLogoutAll: (config) => http.post(`${api}/gateway/logout-all`, {}, config),
});
export default createGatewayApi;
