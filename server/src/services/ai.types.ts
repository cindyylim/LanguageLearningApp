export interface Word {
  id: string;
  word: string;
  translation: string;
  partOfSpeech?: string;
  difficulty: string;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Question {
  question: string;
  type: 'multiple_choice' | 'fill_blank' | 'sentence_completion';
  correctAnswer: string;
  options?: string[];
  context?: string;
  difficulty: string;
  wordId?: string;
}

export interface UserProgress {
  userId: string;
  wordId: string;
  mastery: number;
  reviewCount: number;
  streak: number;
  lastReviewed?: Date;
}
