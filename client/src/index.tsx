import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import axios from 'axios';
import { setupCSRFInterceptor, fetchCSRFToken } from './utils/csrf';

// Configure axios to send cookies with requests
axios.defaults.withCredentials = true;

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