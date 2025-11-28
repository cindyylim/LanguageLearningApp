import { WordProgress } from "./WordProgress";

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