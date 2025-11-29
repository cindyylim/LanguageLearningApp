import { create } from 'zustand';
import axios from 'axios';
import toast from 'react-hot-toast';

// Configure axios to send cookies with requests
axios.defaults.withCredentials = true;

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
            const response = await axios.post(`${process.env.REACT_APP_API_URL}/auth/login`, { email, password });
            const { user } = response.data;

            // Token is now in httpOnly cookie, no need to store it
            set({ user, isAuthenticated: true });

            toast.success('Login successful!');
        } catch (error: any) {
            const message = error.response?.data?.error || 'Login failed';
            toast.error(message);
            throw error;
        }
    },

    register: async (userData) => {
        try {
            const response = await axios.post(`${process.env.REACT_APP_API_URL}/auth/register`, userData);
            const { user } = response.data;

            // Token is now in httpOnly cookie, no need to store it
            set({ user, isAuthenticated: true });

            toast.success('Registration successful!');
        } catch (error: any) {
            const message = error.response?.data?.error || 'Registration failed';
            toast.error(message);
            throw error;
        }
    },

    logout: async () => {
        try {
            // Call logout endpoint to clear httpOnly cookie
            await axios.post(`${process.env.REACT_APP_API_URL}/auth/logout`);
            set({ user: null, isAuthenticated: false });
            toast.success('Logged out successfully');
        } catch (error) {
            // Even if the request fails, clear local state
            set({ user: null, isAuthenticated: false });
            toast.success('Logged out successfully');
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
            const response = await axios.get(`${process.env.REACT_APP_API_URL}/auth/profile`);
            set({ user: response.data.user, isAuthenticated: true });
        } catch (error) {
            // No valid session
            set({ user: null, isAuthenticated: false });
        }
        set({ loading: false });
    }
}));
