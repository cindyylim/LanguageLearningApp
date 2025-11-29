import { useReducer, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ListVocabulary } from '../types/vocabulary';

// State Interface
interface VocabularyState {
    lists: ListVocabulary[];
    loading: boolean;
    error: string | null;
    showListModal: boolean;
    showWordModal: string | null; // listId or null
    listForm: {
        name: string;
        description: string;
        targetLanguage: string;
        nativeLanguage: string;
    };
    wordForm: {
        word: string;
        translation: string;
        partOfSpeech: string;
        difficulty: string;
    };
    saving: boolean;
    showAIModal: boolean;
    aiForm: {
        name: string;
        description: string;
        targetLanguage: string;
        nativeLanguage: string;
        prompt: string;
        wordCount: number;
    };
    aiLoading: boolean;
}

// Initial State
const initialState: VocabularyState = {
    lists: [],
    loading: true,
    error: null,
    showListModal: false,
    showWordModal: null,
    listForm: {
        name: '',
        description: '',
        targetLanguage: 'en',
        nativeLanguage: 'en',
    },
    wordForm: {
        word: '',
        translation: '',
        partOfSpeech: '',
        difficulty: 'medium',
    },
    saving: false,
    showAIModal: false,
    aiForm: {
        name: '',
        description: '',
        targetLanguage: 'en',
        nativeLanguage: 'en',
        prompt: '',
        wordCount: 10,
    },
    aiLoading: false,
};

// Action Types
type Action =
    | { type: 'FETCH_START' }
    | { type: 'FETCH_SUCCESS'; payload: ListVocabulary[] }
    | { type: 'FETCH_ERROR'; payload: string }
    | { type: 'OPEN_LIST_MODAL' }
    | { type: 'CLOSE_LIST_MODAL' }
    | { type: 'OPEN_WORD_MODAL'; payload: string }
    | { type: 'CLOSE_WORD_MODAL' }
    | { type: 'OPEN_AI_MODAL' }
    | { type: 'CLOSE_AI_MODAL' }
    | { type: 'UPDATE_LIST_FORM'; payload: Partial<VocabularyState['listForm']> }
    | { type: 'RESET_LIST_FORM' }
    | { type: 'UPDATE_WORD_FORM'; payload: Partial<VocabularyState['wordForm']> }
    | { type: 'RESET_WORD_FORM' }
    | { type: 'UPDATE_AI_FORM'; payload: Partial<VocabularyState['aiForm']> }
    | { type: 'RESET_AI_FORM' }
    | { type: 'SAVE_START' }
    | { type: 'SAVE_END' }
    | { type: 'AI_GENERATE_START' }
    | { type: 'AI_GENERATE_END' };

// Reducer
function vocabularyReducer(state: VocabularyState, action: Action): VocabularyState {
    switch (action.type) {
        case 'FETCH_START':
            return { ...state, loading: true, error: null };
        case 'FETCH_SUCCESS':
            return { ...state, loading: false, lists: action.payload };
        case 'FETCH_ERROR':
            return { ...state, loading: false, error: action.payload };
        case 'OPEN_LIST_MODAL':
            return { ...state, showListModal: true };
        case 'CLOSE_LIST_MODAL':
            return { ...state, showListModal: false };
        case 'OPEN_WORD_MODAL':
            return { ...state, showWordModal: action.payload };
        case 'CLOSE_WORD_MODAL':
            return { ...state, showWordModal: null };
        case 'OPEN_AI_MODAL':
            return { ...state, showAIModal: true };
        case 'CLOSE_AI_MODAL':
            return { ...state, showAIModal: false };
        case 'UPDATE_LIST_FORM':
            return { ...state, listForm: { ...state.listForm, ...action.payload } };
        case 'RESET_LIST_FORM':
            return { ...state, listForm: initialState.listForm };
        case 'UPDATE_WORD_FORM':
            return { ...state, wordForm: { ...state.wordForm, ...action.payload } };
        case 'RESET_WORD_FORM':
            return { ...state, wordForm: initialState.wordForm };
        case 'UPDATE_AI_FORM':
            return { ...state, aiForm: { ...state.aiForm, ...action.payload } };
        case 'RESET_AI_FORM':
            return { ...state, aiForm: initialState.aiForm };
        case 'SAVE_START':
            return { ...state, saving: true };
        case 'SAVE_END':
            return { ...state, saving: false };
        case 'AI_GENERATE_START':
            return { ...state, aiLoading: true };
        case 'AI_GENERATE_END':
            return { ...state, aiLoading: false };
        default:
            return state;
    }
}

export const useVocabulary = (user: any) => {
    const [state, dispatch] = useReducer(vocabularyReducer, initialState);

    const fetchLists = useCallback(async (signal?: AbortSignal) => {
        dispatch({ type: 'FETCH_START' });
        try {
            const res = await axios.get(`${process.env.REACT_APP_API_URL}/vocabulary`, { signal });
            dispatch({ type: 'FETCH_SUCCESS', payload: res.data.vocabularyLists || [] });
        } catch (err: any) {
            if (!axios.isCancel(err)) {
                dispatch({ type: 'FETCH_ERROR', payload: 'Failed to load vocabulary lists' });
            }
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        fetchLists(controller.signal);
        return () => controller.abort();
    }, [fetchLists]);

    useEffect(() => {
        if (user) {
            dispatch({
                type: 'UPDATE_LIST_FORM',
                payload: { targetLanguage: 'en', nativeLanguage: 'en' }
            });
        }
    }, [user]);

    const handleAddList = async (e: React.FormEvent) => {
        e.preventDefault();
        dispatch({ type: 'SAVE_START' });
        try {
            await axios.post(`${process.env.REACT_APP_API_URL}/vocabulary`, state.listForm);
            dispatch({ type: 'CLOSE_LIST_MODAL' });
            dispatch({ type: 'RESET_LIST_FORM' });
            fetchLists();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to add list');
        } finally {
            dispatch({ type: 'SAVE_END' });
        }
    };

    const handleAddWord = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!state.showWordModal) return;
        dispatch({ type: 'SAVE_START' });
        try {
            await axios.post(`${process.env.REACT_APP_API_URL}/vocabulary/${state.showWordModal}/words`, state.wordForm);
            dispatch({ type: 'CLOSE_WORD_MODAL' });
            dispatch({ type: 'RESET_WORD_FORM' });
            fetchLists();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to add word');
        } finally {
            dispatch({ type: 'SAVE_END' });
        }
    };

    const handleAIGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        dispatch({ type: 'AI_GENERATE_START' });
        try {
            await axios.post(`${process.env.REACT_APP_API_URL}/vocabulary/generate-ai-list`, state.aiForm);
            dispatch({ type: 'CLOSE_AI_MODAL' });
            dispatch({ type: 'RESET_AI_FORM' });
            fetchLists();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to generate vocabulary list');
        } finally {
            dispatch({ type: 'AI_GENERATE_END' });
        }
    };

    const updateWordProgress = async (wordId: string, status: 'learning' | 'mastered') => {
        try {
            await axios.post(`${process.env.REACT_APP_API_URL}/vocabulary/words/${wordId}/progress`, { status });
            fetchLists();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to update word progress');
        }
    };

    return {
        state,
        dispatch,
        handleAddList,
        handleAddWord,
        handleAIGenerate,
        updateWordProgress,
    };
};
