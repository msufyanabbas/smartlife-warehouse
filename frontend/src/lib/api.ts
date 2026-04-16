import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wh_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const token = localStorage.getItem('wh_token');
      // Only force-redirect if the user was previously logged in
      // (i.e. had a token). If there's no token, this is just a
      // normal unauthenticated request — let the caller handle it.
      if (token) {
        localStorage.removeItem('wh_token');
        localStorage.removeItem('wh_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

export default api;