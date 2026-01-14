import axios from 'axios';
import { getToken } from './authService.js';

const api = axios.create({
  // Use current hostname to allow access from other devices on the network
  baseURL: `http://${window.location.hostname}:5000/api`,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;



