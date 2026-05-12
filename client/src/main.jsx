import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import './responsive.css';
import App from './App.jsx';
import { AppNotificationProvider } from './components/common/AppNotificationProvider.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppNotificationProvider>
        <App />
      </AppNotificationProvider>
    </BrowserRouter>
  </StrictMode>
);
