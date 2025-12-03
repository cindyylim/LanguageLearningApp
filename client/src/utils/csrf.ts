// Client-side CSRF utilities

import Cookies from 'js-cookie';
import axios from 'axios';


/**
 * Get CSRF token from cookie
 */
export function getCSRFToken(): string | undefined {
    return Cookies.get('XSRF-TOKEN');
}

/**
 * Setup Axios interceptor to include CSRF token in all requests
 */
export function setupCSRFInterceptor(): void {
    axios.interceptors.request.use(
        (config) => {
            // Only add CSRF token for state-changing methods
            if (config.method && !['get', 'head', 'options'].includes(config.method.toLowerCase())) {
                const token = getCSRFToken();
                if (token) {
                    config.headers['X-CSRF-Token'] = token;
                } else {
                    console.warn('CSRF token missing for request:', config.url);
                }
            }
            return config;
        },
        (error) => {
            return Promise.reject(error);
        }
    );
}

/**
 * Fetch CSRF token from server
 */
export async function fetchCSRFToken(): Promise<void> {
    try {
        await axios.get(`${process.env.REACT_APP_API_URL}/csrf-token`, { withCredentials: true });
        // Token will be set in cookie by server
    } catch (error) {
        console.error('Failed to fetch CSRF token:', error);
    }
}
