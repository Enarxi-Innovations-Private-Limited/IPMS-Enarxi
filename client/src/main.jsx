import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import './responsive.css';
import './utils/dateLocalePatch.js';
import App from './App.jsx';
import { AppNotificationProvider } from './components/common/AppNotificationProvider.jsx';
import { SocketProvider } from './context/SocketContext.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppNotificationProvider>
        <SocketProvider>
          <App />
        </SocketProvider>
      </AppNotificationProvider>
    </BrowserRouter>
  </StrictMode>
);
