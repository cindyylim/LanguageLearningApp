import axios from 'axios';

const api = axios.create({
    baseURL: process.env.REACT_APP_API_URL,
    withCredentials: true,
});

let csrfToken: string | undefined;

api.interceptors.request.use(
    (config) => {
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

export const fetchCSRFToken = async (): Promise<void> => {
    try {
        const response = await api.get('/csrf-token');
        csrfToken = response.data.csrfToken;
    } catch (error) {
        console.error('Failed to fetch CSRF token:', error);
    }
};

export const clearCSRFToken = (): void => {
    csrfToken = undefined;
};

export default api;