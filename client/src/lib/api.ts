import axios from 'axios';
import Cookies from 'js-cookie';

const api = axios.create({
    baseURL: process.env.REACT_APP_API_URL,
    withCredentials: true,
});

/**
 * Get CSRF token from cookie
 */
const getCSRFToken = (): string | undefined => {
    return Cookies.get('XSRF-TOKEN');
};

/**
 * Setup Axios interceptor to include CSRF token in all requests
 */
api.interceptors.request.use(
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

/**
 * Fetch CSRF token from server
 */
export const fetchCSRFToken = async (): Promise<void> => {
    try {
        await api.get('/csrf-token');
        // Token will be set in cookie by server
    } catch (error) {
        console.error('Failed to fetch CSRF token:', error);
    }
};

export default api;
