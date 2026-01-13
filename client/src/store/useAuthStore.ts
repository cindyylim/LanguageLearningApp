import { create } from 'zustand';
import axios from 'axios';
import api, { fetchCSRFToken, clearCSRFToken } from '../lib/api';
import toast from 'react-hot-toast';
import { getErrorMessage } from '../types/errors';

interface User {
    id: string;
    name: string;
    email: string;
    nativeLanguage: string;
    targetLanguage: string;
    proficiencyLevel: string;
}

interface RegisterData {
    name: string;
    email: string;
    password: string;
    nativeLanguage?: string;
    targetLanguage?: string;
    proficiencyLevel?: string;
}

interface AuthState {
    user: User | null;
    loading: boolean;
    isAuthenticated: boolean;
    login: (email: string, password: string) => Promise<void>;
    loginDemo: () => Promise<void>;
    register: (userData: RegisterData) => Promise<void>;
    logout: () => void;
    updateUser: (userData: Partial<User>) => void;
    initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    loading: true,
    isAuthenticated: false,

    login: async (email, password) => {
        try {
            const response = await api.post('/auth/login', { email, password });
            const { user } = response.data;

            set({ user, isAuthenticated: true });

            await fetchCSRFToken();
            toast.success('Login successful!');
        } catch (error: unknown) {
            const message = getErrorMessage(error) || 'Login failed';
            toast.error(message);
            throw error;
        }
    },

    loginDemo: async () => {
        try {
            const response = await api.post('/auth/demo');
            const { user } = response.data;
            set({ user, isAuthenticated: true });
            await fetchCSRFToken();
            toast.success('Logged in with Demo Account!');
        } catch (error: unknown) {
            // Fallback to standard login with demo credentials
            try {
                const response = await api.post('/auth/login', {
                    email: 'test@email.com',
                    password: '12345678$'
                });
                set({ user: response.data.user, isAuthenticated: true });
                await fetchCSRFToken();
                toast.success('Logged in with Demo Account!');
            } catch (fallbackErr: unknown) {
                const message = getErrorMessage(fallbackErr) || 'Demo login failed';
                toast.error(message);
                throw fallbackErr;
            }
        }
    },

    register: async (userData) => {
        try {
            const response = await api.post('/auth/register', userData);
            const { user } = response.data;

            // Token is now in httpOnly cookie, no need to store it
            set({ user, isAuthenticated: true });

            await fetchCSRFToken();
            toast.success('Registration successful!');
        } catch (error: unknown) {
            const message = getErrorMessage(error) || 'Registration failed';
            toast.error(message);
            throw error;
        }
    },

    logout: async () => {
        try {
            // Call logout endpoint to clear httpOnly cookie
            await api.post('/auth/logout');
            clearCSRFToken();
            set({ user: null, isAuthenticated: false });
            toast.success('Logged out successfully');
        } catch (error) {
            // Even if the request fails, clear local state
            clearCSRFToken();
            set({ user: null, isAuthenticated: false });
            toast.error('Logged out failed ' + error);
        }
    },

    updateUser: (userData) => {
        const { user } = get();
        if (user) {
            set({ user: { ...user, ...userData } });
        }
    },

    initialize: async () => {
        // Token is in httpOnly cookie, just try to get profile
        try {
            const response = await api.get('/auth/profile');
            set({ user: response.data.user, isAuthenticated: true });
            await fetchCSRFToken();
        } catch (error) {
            // 401 is expected if not logged in
            if (axios.isAxiosError(error) && error.response?.status !== 401) {
                console.error('Initialization error:', error);
            }
            set({ user: null, isAuthenticated: false });
        }
        set({ loading: false });
    }
}));

