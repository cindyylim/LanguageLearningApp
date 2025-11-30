// Shared type definitions for client and server

export type Difficulty = 'easy' | 'medium' | 'hard';
export type WordStatus = 'not_started' | 'learning' | 'mastered';
export type QuestionType = 'multiple_choice' | 'fill_blank' | 'sentence_completion';

export interface User {
    id: string;
    name: string;
    email: string;
    nativeLanguage: string;
    targetLanguage: string;
    proficiencyLevel: string;
}

export interface WordProgress {
    _id: string;
    wordId: string;
    userId: string;
    mastery: number;
    status: WordStatus;
    reviewCount: number;
    streak: number;
    lastReviewed: string;
    nextReview: string;
    createdAt: string;
    updatedAt: string;
}

export interface Word {
    _id: string;
    word: string;
    translation: string;
    partOfSpeech: string;
    difficulty: Difficulty;
    vocabularyListId: string;
    createdAt: string;
    updatedAt: string;
    progress?: WordProgress | null;
}

export interface VocabularyList {
    _id: string;
    name: string;
    description: string;
    targetLanguage: string;
    nativeLanguage: string;
    createdAt: string;
    updatedAt: string;
    userId: string;
    _count?: { words: number };
    words?: Word[];
}

export interface QuizQuestion {
    _id: string;
    question: string;
    type: QuestionType;
    options?: string | null;
    context?: string;
    difficulty: Difficulty;
    correctAnswer: string;
    createdAt: string;
    quizId: string;
    wordId: string;
}

export interface Quiz {
    _id: string;
    title: string;
    description: string;
    difficulty: Difficulty;
    questionCount: number;
    questions: QuizQuestion[];
    createdAt: string;
    updatedAt: string;
    userId: string;
}

export interface QuizAttempt {
    _id: string;
    score: number;
    completed: boolean;
    userId: string;
    quizId: string;
    createdAt: string;
}

export interface QuizAnswer {
    _id: string;
    answer: string;
    isCorrect: boolean;
    attemptId: string;
    questionId: string;
    createdAt: Date | string;
    question?: QuizQuestion;
}
