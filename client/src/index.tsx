import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { fetchCSRFToken } from './lib/api';

// Initialized via lib/api.ts instance interceptors

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