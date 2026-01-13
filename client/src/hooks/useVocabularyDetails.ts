import api from '../lib/api';
import { vocabularyDetailsReducer } from "../reducers/vocabularyDetailsReducer";
import { initialState } from "../reducers/vocabularyDetailsReducer";
import { useEffect, useReducer } from "react";
import { getErrorMessage } from "../types/errors";
import { useNavigate, useParams } from "react-router-dom";
import { Word } from "../types/vocabulary";

export const useVocabularyDetails = () => {
    const navigate = useNavigate();

    const [state, dispatch] = useReducer(vocabularyDetailsReducer, initialState);

    const { id } = useParams<{ id: string }>();

    useEffect(() => {
        const fetchList = async () => {
            dispatch({ type: 'FETCH_START' });
            try {
                const res = await api.get(`/vocabulary/${id}`);
                dispatch({ type: 'FETCH_SUCCESS', payload: res.data.vocabularyList });
            } catch (err: unknown) {
                dispatch({ type: 'FETCH_ERROR', payload: getErrorMessage(err) || 'Failed to load vocabulary list' });
            }
        };
        if (id) fetchList();
    }, [id]);

    const handleEditList = async (e: React.FormEvent) => {
        e.preventDefault();
        dispatch({ type: 'ACTION_START' });
        try {
            await api.put(`/vocabulary/${id}`, state.editListForm);
            dispatch({ type: 'CLOSE_EDIT_LIST_MODAL' });
            // Refresh list
            const res = await api.get(`/vocabulary/${id}`);
            dispatch({ type: 'FETCH_SUCCESS', payload: res.data.vocabularyList });
        } catch (err: unknown) {
            alert(getErrorMessage(err) || 'Failed to update list');
        } finally {
            dispatch({ type: 'ACTION_END' });
        }
    };

    const handleDeleteList = async () => {
        dispatch({ type: 'ACTION_START' });
        try {
            await api.delete(`/vocabulary/${id}`);
            dispatch({ type: 'ACTION_END' });
            navigate('/vocabulary');
        } catch (err: unknown) {
            alert(getErrorMessage(err) || 'Failed to delete list');
            dispatch({ type: 'ACTION_END' });
        }
    };

    const openEditWord = (w: Word, wordId: string) => {
        dispatch({ type: 'OPEN_EDIT_WORD_MODAL', payload: { id: wordId, word: w } });
    };

    const handleEditWord = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!state.showEditWordModal) return;
        dispatch({ type: 'ACTION_START' });
        try {
            await api.put(`/vocabulary/${id}/words/${state.editWordForm.id}`, state.editWordForm);
            dispatch({ type: 'CLOSE_EDIT_WORD_MODAL' });
            // Refresh list
            const res = await api.get(`/vocabulary/${id}`);
            dispatch({ type: 'FETCH_SUCCESS', payload: res.data.vocabularyList });
        } catch (err: unknown) {
            alert(getErrorMessage(err) || 'Failed to update word');
        } finally {
            dispatch({ type: 'ACTION_END' });
        }
    };

    const handleDeleteWord = async () => {
        if (!state.deleteWordId) return;
        dispatch({ type: 'ACTION_START' });
        try {
            await api.delete(`/vocabulary/${id}/words/${state.deleteWordId}`);
            dispatch({ type: 'SET_DELETE_WORD_ID', payload: null });
            // Refresh list
            const res = await api.get(`/vocabulary/${id}`);
            dispatch({ type: 'FETCH_SUCCESS', payload: res.data.vocabularyList });
        } catch (err: unknown) {
            alert(getErrorMessage(err) || 'Failed to delete word');
        } finally {
            dispatch({ type: 'ACTION_END' });
        }
    };

    // Add function to update word progress
    const updateWordProgress = async (listId: string, wordId: string, status: 'learning' | 'mastered') => {
        try {
            await api.post(`/vocabulary/words/${wordId}/progress`, { status, listId });
            // Refresh list
            if (id) {
                const res = await api.get(`/vocabulary/${id}`);
                dispatch({ type: 'FETCH_SUCCESS', payload: res.data.vocabularyList });
            }
        } catch (err: unknown) {
            alert(getErrorMessage(err) || 'Failed to update word progress');
        }
    };

    return {
        state,
        dispatch,
        handleEditList,
        handleDeleteList,
        openEditWord,
        handleEditWord,
        handleDeleteWord,
        updateWordProgress
    }
}