import { ObjectId } from "mongodb";

export interface Quiz {
    _id: ObjectId;
    title: string;
    description: string;
    difficulty: string;
    questionCount: number;
    questions: QuizQuestion[];
    createdAt: string;
    updatedAt: string;
    userId: string;
}

export interface QuizQuestion {
    _id: ObjectId;
    question: string;
    type: string;
    options?: string | null;
    context?: string;
    difficulty: string;
    correctAnswer: string;
    createdAt: string;
    quizId: string;
    wordId: string;
}

export interface QuizAttempt {
    _id: ObjectId;
    score: number;
    completed: boolean;
    userId: string;
    quizId: string;
    createdAt: string;
}

