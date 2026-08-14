import { Word, WordProgress, VocabularyList } from "../../../shared/types/index";

export interface VocabularyState {
  lists: VocabularyList[];
  loading: boolean;
  error: string | null;
  showListModal: boolean;
  showWordModal: string | null;
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
  aiError: string | null;
  page: number;
  hasMore: boolean;
}

export const initialState: VocabularyState = {
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
  aiError: null,
  page: 1,
  hasMore: true,
};

export type VocabularyAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: { lists: VocabularyList[]; hasMore: boolean; page: number } }
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
  | { type: 'AI_GENERATE_ERROR'; payload: string }
  | { type: 'ADD_WORD_SUCCESS'; payload: { listId: string; word: Word } }
  | { type: 'UPDATE_WORD_PROGRESS'; payload: { wordId: string; progress: WordProgress } };

function addWordToList(
  lists: VocabularyList[],
  listId: string,
  word: Word
): VocabularyList[] {
  return lists.map((list) => {
    if (list._id !== listId) {
      return list;
    }

    return {
      ...list,
      words: [...(list.words || []), word],
      _count: { ...list._count, words: (list._count?.words || 0) + 1 },
    };
  });
}

export function vocabularyReducer(state: VocabularyState, action: VocabularyAction): VocabularyState {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, loading: true, error: null };
    case 'FETCH_SUCCESS':
      return {
        ...state,
        loading: false,
        lists: action.payload.lists,
        hasMore: action.payload.hasMore,
        page: action.payload.page,
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
      return { ...state, showAIModal: true, aiError: null };
    case 'CLOSE_AI_MODAL':
      return { ...state, showAIModal: false, aiError: null };
    case 'UPDATE_LIST_FORM':
      return { ...state, listForm: { ...state.listForm, ...action.payload } };
    case 'RESET_LIST_FORM':
      return {
        ...state,
        listForm: {
          ...state.listForm,
          name: '',
          description: '',
        },
      };
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
      return { ...state, aiLoading: true, aiError: null };
    case 'AI_GENERATE_END':
      return { ...state, aiLoading: false };
    case 'AI_GENERATE_ERROR':
      return { ...state, aiLoading: false, aiError: action.payload };
    case 'ADD_WORD_SUCCESS':
      return {
        ...state,
        lists: addWordToList(state.lists, action.payload.listId, action.payload.word),
      };
    case 'UPDATE_WORD_PROGRESS':
      return {
        ...state,
        lists: state.lists.map(list => ({
          ...list,
          words: (list.words ?? []).map(word =>
            word._id === action.payload.wordId
              ? { ...word, progress: action.payload.progress }
              : word
          ),
        })),
      };
    default:
      return state;
  }
}
