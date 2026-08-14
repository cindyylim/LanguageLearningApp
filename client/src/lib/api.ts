import axios from 'axios';
import { getAuthToken, setAuthToken } from './authToken';

const api = axios.create({
    baseURL: process.env.REACT_APP_API_URL,
});

let csrfToken: string | undefined;

api.interceptors.request.use(
    (config) => {
        const token = getAuthToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        if (config.method && !['get', 'head', 'options'].includes(config.method.toLowerCase())) {
            if (csrfToken) {
                config.headers['X-CSRF-Token'] = csrfToken;
            } else if (config.url !== '/auth/demo' && config.url !== '/auth/login' && config.url !== '/auth/register' && config.url !== '/csrf-token') {
                console.warn('CSRF token missing for request:', config.url);
            }
        }
        return config;
    },
    (error) => Promise.reject(error)
);

export const fetchCSRFToken = async (): Promise<string> => {
    const response = await api.get('/csrf-token');
    const token = response.data?.csrfToken;
    if (!token || typeof token !== 'string') {
        throw new Error('CSRF token not returned');
    }
    csrfToken = token;
    return token;
};

export const clearCSRFToken = (): void => {
    csrfToken = undefined;
};

export { setAuthToken, getAuthToken };

export default api;
