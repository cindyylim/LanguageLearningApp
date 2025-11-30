import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { setupCSRFInterceptor, fetchCSRFToken } from './utils/csrf';

// Setup CSRF protection
setupCSRFInterceptor();

// Fetch initial CSRF token
fetchCSRFToken().catch(err => {
  console.error('Failed to initialize CSRF protection:', err);
});

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);