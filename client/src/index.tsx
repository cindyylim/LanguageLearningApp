import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { setupCSRFInterceptor, fetchCSRFToken } from './utils/csrf';

// Setup CSRF protection
setupCSRFInterceptor();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// Fetch initial CSRF token before rendering
fetchCSRFToken().finally(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});