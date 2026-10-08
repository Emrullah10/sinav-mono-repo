import { createApi } from '@sinav/client-sdk';
import axios from '@shared/axios/axios';

// Tüm servis fonksiyonları tek düz nesnede (adlar servis önekli; çakışma açılışta hata verir).
// Kullanım: import api from '@api'; api.learningTodayGet()
const api = createApi(axios, { api: '/api' });
export default api;
