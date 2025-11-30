import { useReducer, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ListVocabulary, Word } from '../types/vocabulary';
import { getErrorMessage } from '../types/errors';

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
    page: number;
    hasMore: boolean;
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
    page: 1,
    hasMore: true,
};

// Action Types
type Action =
    | { type: 'FETCH_START' }
    | { type: 'FETCH_SUCCESS'; payload: { lists: ListVocabulary[]; hasMore: boolean; page: number } }
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
    | { type: 'AI_GENERATE_END' }
    | { type: 'ADD_WORD_SUCCESS'; payload: { listId: string; word: Word } }
    | { type: 'UPDATE_WORD_PROGRESS'; payload: { wordId: string; status: 'learning' | 'mastered'; mastery: number } }

// Reducer
function vocabularyReducer(state: VocabularyState, action: Action): VocabularyState {
    switch (action.type) {
        case 'FETCH_START':
            return { ...state, loading: true, error: null };
        case 'FETCH_SUCCESS':
            return {
                ...state,
                loading: false,
                lists: action.payload.lists,
                hasMore: action.payload.hasMore,
                page: action.payload.page
            };
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
        case 'ADD_WORD_SUCCESS':
            return {
                ...state,
                lists: state.lists.map(list => {
                    if (list._id === action.payload.listId) {
                        return {
                            ...list,
                            words: [...(list.words || []), action.payload.word],
                            _count: { ...list._count, words: (list._count?.words || 0) + 1 }
                        };
                    }
                    return list;
                })
            };
        case 'UPDATE_WORD_PROGRESS':
            return {
                ...state,
                lists: state.lists.map(list => ({
                    ...list,
                    words: list.words?.map(word => {
                        if (word._id === action.payload.wordId) {
                            return {
                                ...word,
                                progress: {
                                    ...word.progress,
                                    status: action.payload.status,
                                    mastery: action.payload.mastery,
                                    // Keep existing fields or provide defaults for optimistic update
                                    _id: word.progress?._id || 'temp-id',
                                    wordId: word.progress?.wordId || word._id,
                                    userId: word.progress?.userId || 'temp-user',
                                    reviewCount: word.progress?.reviewCount || 0,
                                    streak: word.progress?.streak || 0,
                                    lastReviewed: new Date().toISOString(),
                                    nextReview: new Date(new Date().getTime() + (Math.max(1, word.progress?.mastery || 0) * 24 * 7 * 60 * 60 * 1000)).toISOString(),
                                    createdAt: word.progress?.createdAt || new Date().toISOString(),
                                    updatedAt: new Date().toISOString()
                                }
                            } as Word;
                        }
                        return word;
                    })
                }))
            };
        default:
            return state;
    }
}

interface User {
    id: string;
    name: string;
    email: string;
    nativeLanguage: string;
    targetLanguage: string;
}

export const useVocabulary = (user: User | null) => {
    const [state, dispatch] = useReducer(vocabularyReducer, initialState);

    const fetchLists = useCallback(async (page: number = 1, signal?: AbortSignal) => {
        dispatch({ type: 'FETCH_START' });
        try {
            const res = await axios.get(`${process.env.REACT_APP_API_URL}/vocabulary?page=${page}&limit=20`, { signal });
            const lists = res.data.vocabularyLists || [];
            dispatch({
                type: 'FETCH_SUCCESS',
                payload: {
                    lists,
                    hasMore: lists.length >= page * 20,
                    page
                }
            });
        } catch (err: unknown) {
            if (!axios.isCancel(err)) {
                dispatch({ type: 'FETCH_ERROR', payload: 'Failed to load vocabulary lists' });
            }
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        fetchLists(1, controller.signal);
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

    const handlePageChange = (newPage: number) => {
        fetchLists(newPage);
    };

    const handleAddList = async (e: React.FormEvent) => {
        e.preventDefault();
        dispatch({ type: 'SAVE_START' });
        try {
            await axios.post(`${process.env.REACT_APP_API_URL}/vocabulary`, state.listForm);
            dispatch({ type: 'CLOSE_LIST_MODAL' });
            dispatch({ type: 'RESET_LIST_FORM' });
            fetchLists(1);
        } catch (err: unknown) {
            alert(getErrorMessage(err) || 'Failed to add list');
        } finally {
            dispatch({ type: 'SAVE_END' });
        }
    };

    const handleAddWord = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!state.showWordModal) return;
        dispatch({ type: 'SAVE_START' });
        try {
            const res = await axios.post(`${process.env.REACT_APP_API_URL}/vocabulary/${state.showWordModal}/words`, state.wordForm);
            const newWord = res.data.word;

            dispatch({
                type: 'ADD_WORD_SUCCESS',
                payload: { listId: state.showWordModal, word: newWord }
            });

            dispatch({ type: 'CLOSE_WORD_MODAL' });
            dispatch({ type: 'RESET_WORD_FORM' });
        } catch (err: unknown) {
            alert(getErrorMessage(err) || 'Failed to add word');
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
            fetchLists(1);
        } catch (err: unknown) {
            alert(getErrorMessage(err) || 'Failed to generate vocabulary list');
        } finally {
            dispatch({ type: 'AI_GENERATE_END' });
        }
    };

    const updateWordProgress = async (wordId: string, status: 'learning' | 'mastered') => {
        const newMastery = status === 'mastered' ? 1.0 : 0;
        dispatch({
            type: 'UPDATE_WORD_PROGRESS',
            payload: { wordId, status, mastery: newMastery }
        });

        try {
            await axios.post(`${process.env.REACT_APP_API_URL}/vocabulary/words/${wordId}/progress`, { status });
            // No need to fetch lists, we already updated state
        } catch (err: unknown) {
            alert(getErrorMessage(err) || 'Failed to update word progress');
            // Ideally revert state here, but for now just alerting
            fetchLists(state.page); // Re-fetch to sync state on error
        }
    };

    return {
        state,
        dispatch,
        handleAddList,
        handleAddWord,
        handleAIGenerate,
        updateWordProgress,
        handlePageChange
    };
};
