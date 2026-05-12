import axios from 'axios';
import { getToken, isTokenExpired, clearAuth } from './authService.js';

// Use relative path to leverage Vite's proxy (resolves CORS issues)
const API_URL = '/api/inventory/';

const inventoryApi = axios.create({
  baseURL: API_URL,
});

// Add Authentication Interceptor (now required since PM backend is protected)
inventoryApi.interceptors.request.use((config) => {
  const token = getToken();
  if (token && isTokenExpired(token)) {
    clearAuth();
    window.location.replace('/login');
    return config;
  }
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

inventoryApi.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('Inventory API Error:', error.response?.data?.message || error.message);
    if (error.response?.status === 401) {
      clearAuth();
      window.location.replace('/login');
    }
    return Promise.reject(error);
  }
);

export default inventoryApi;
