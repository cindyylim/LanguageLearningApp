import { create } from 'zustand';
import axios from 'axios';
import toast from 'react-hot-toast';

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
            const { user, token } = response.data;

            localStorage.setItem('token', token);
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
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
            const { user, token } = response.data;

            localStorage.setItem('token', token);
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            set({ user, isAuthenticated: true });

            toast.success('Registration successful!');
        } catch (error: any) {
            const message = error.response?.data?.error || 'Registration failed';
            toast.error(message);
            throw error;
        }
    },

    logout: () => {
        localStorage.removeItem('token');
        delete axios.defaults.headers.common['Authorization'];
        set({ user: null, isAuthenticated: false });
        toast.success('Logged out successfully');
    },

    updateUser: (userData) => {
        const { user } = get();
        if (user) {
            set({ user: { ...user, ...userData } });
        }
    },

    initialize: async () => {
        const token = localStorage.getItem('token');
        if (token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            try {
                const response = await axios.get(`${process.env.REACT_APP_API_URL}/auth/profile`);
                set({ user: response.data.user, isAuthenticated: true });
            } catch (error) {
                localStorage.removeItem('token');
                delete axios.defaults.headers.common['Authorization'];
                set({ user: null, isAuthenticated: false });
            }
        } else {
            set({ user: null, isAuthenticated: false });
        }
        set({ loading: false });
    }
}));
