export interface IdempotencyKey {
    userId: string;
    key: string;
    status: 'pending' | 'completed';
    quizId?: string;
    createdAt: Date;
    completedAt?: Date;
}
