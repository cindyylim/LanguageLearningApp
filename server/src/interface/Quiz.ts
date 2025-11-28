export interface Quiz {
    _id: string;
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
    _id: string;
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
  _id: string;
  score: number;
  completed: boolean;
  userId: string;
  quizId: string;
  createdAt: string;
}

export interface QuizAnswerWithQuestion {
    _id: string;
    answer: string;
    isCorrect: boolean;
    attemptId: string;
    questionId: string;
    createdAt: Date | string;
    question?: QuizQuestion;
}