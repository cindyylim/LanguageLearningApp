import { ListVocabulary, Word } from '../types/vocabulary';

// State Interface
export interface VocabularyDetailsState {
    list: ListVocabulary | null;
    loading: boolean;
    error: string | null;
    showEditListModal: boolean;
    editListForm: { name: string; description: string };
    showEditWordModal: boolean;
    editWordForm: { id: string; word: string; translation: string; partOfSpeech: string; difficulty: string };
    deleting: boolean;
    deleteWordId: string | null;
    saving: boolean;
}

// Initial State
export const initialState: VocabularyDetailsState = {
    list: null,
    loading: true,
    error: null,
    showEditListModal: false,
    editListForm: { name: '', description: '' },
    showEditWordModal: false,
    editWordForm: { id: '', word: '', translation: '', partOfSpeech: '', difficulty: 'medium' },
    deleting: false,
    deleteWordId: null,
    saving: false,
};

// Action Types
export type VocabularyDetailsAction =
    | { type: 'FETCH_START' }
    | { type: 'FETCH_SUCCESS'; payload: ListVocabulary }
    | { type: 'FETCH_ERROR'; payload: string }
    | { type: 'OPEN_EDIT_LIST_MODAL' }
    | { type: 'CLOSE_EDIT_LIST_MODAL' }
    | { type: 'UPDATE_EDIT_LIST_FORM'; payload: { name?: string; description?: string } }
    | { type: 'OPEN_EDIT_WORD_MODAL'; payload: { id: string; word: Word } }
    | { type: 'CLOSE_EDIT_WORD_MODAL' }
    | { type: 'UPDATE_EDIT_WORD_FORM'; payload: Partial<VocabularyDetailsState['editWordForm']> }
    | { type: 'SET_DELETE_WORD_ID'; payload: string | null }
    | { type: 'ACTION_START' }
    | { type: 'ACTION_END' }
    | { type: 'ACTION_ERROR'; payload: string };

// Reducer Function
export const vocabularyDetailsReducer = (state: VocabularyDetailsState, action: VocabularyDetailsAction): VocabularyDetailsState => {
    switch (action.type) {
        case 'FETCH_START':
            return { ...state, loading: true, error: null };
        case 'FETCH_SUCCESS':
            return {
                ...state,
                loading: false,
                list: action.payload,
                // Reset forms when list is refreshed
                editListForm: { name: action.payload.name || '', description: action.payload.description || '' },
            };
        case 'FETCH_ERROR':
            return { ...state, loading: false, error: action.payload };
        case 'OPEN_EDIT_LIST_MODAL':
            return { ...state, showEditListModal: true };
        case 'CLOSE_EDIT_LIST_MODAL':
            return { ...state, showEditListModal: false };
        case 'UPDATE_EDIT_LIST_FORM':
            return { ...state, editListForm: { ...state.editListForm, ...action.payload } };
        case 'OPEN_EDIT_WORD_MODAL':
            return {
                ...state,
                showEditWordModal: true,
                editWordForm: {
                    id: action.payload.id,
                    word: action.payload.word.word,
                    translation: action.payload.word.translation,
                    partOfSpeech: action.payload.word.partOfSpeech || '',
                    difficulty: action.payload.word.difficulty || 'medium',
                },
            };
        case 'CLOSE_EDIT_WORD_MODAL':
            return { ...state, showEditWordModal: false };
        case 'UPDATE_EDIT_WORD_FORM':
            return { ...state, editWordForm: { ...state.editWordForm, ...action.payload } };
        case 'SET_DELETE_WORD_ID':
            return { ...state, deleteWordId: action.payload };
        case 'ACTION_START':
            return { ...state, saving: true, deleting: true };
        case 'ACTION_END':
            return { ...state, saving: false, deleting: false };
        case 'ACTION_ERROR':
            return { ...state, saving: false, deleting: false };
        default:
            return state;
    }
};
