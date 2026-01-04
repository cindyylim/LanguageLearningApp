import { useReducer, useEffect, useCallback } from 'react';
import axios from 'axios';
import { getErrorMessage } from '../types/errors';
import { initialState, vocabularyReducer } from '../reducers/vocabularyReducer';

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
            const res = await axios.get(`${process.env.REACT_APP_API_URL}/vocabulary?page=${page}&limit=20`, { signal, withCredentials: true });
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
            await axios.post(`${process.env.REACT_APP_API_URL}/vocabulary`, state.listForm, { withCredentials: true });
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
            const res = await axios.post(`${process.env.REACT_APP_API_URL}/vocabulary/${state.showWordModal}/words`, state.wordForm, { withCredentials: true });
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
            await axios.post(`${process.env.REACT_APP_API_URL}/vocabulary/generate-ai-list`, state.aiForm, { withCredentials: true });
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
            await axios.post(`${process.env.REACT_APP_API_URL}/vocabulary/words/${wordId}/progress`, { status }, { withCredentials: true });
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
