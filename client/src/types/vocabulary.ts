export interface WordProgress {
    _id: string;
    wordId: string;
    userId: string;
    mastery: number;
    status: string;
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
    difficulty: string;
    vocabularyListId: string;
    createdAt: string;
    updatedAt: string;
    progress: WordProgress | null;
}

export interface ListVocabulary {
    _id: string;
    name: string;
    description: string;
    targetLanguage: string;
    nativeLanguage: string;
    createdAt: string;
    updatedAt: string;
    userId: string;
    _count: { words: number };
    words: Word[];
}
