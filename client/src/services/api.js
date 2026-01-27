import axios from 'axios';
import { clearAuth, getToken, isTokenExpired } from './authService.js';

// Use environment variable for production, fallback to localhost for development
const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5000/api`;

const api = axios.create({
  baseURL: API_URL,
});

function redirectToLogin() {
  if (window.location.pathname === '/login') return;
  // Hard redirect to reset app state and ensure protected routes unmount.
  window.location.replace('/login');
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token && isTokenExpired(token)) {
    clearAuth();
    redirectToLogin();
    return config;
  }
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      clearAuth();
      redirectToLogin();
    }
    return Promise.reject(error);
  }
);

export default api;



