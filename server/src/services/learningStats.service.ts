import { getDatabase } from '../utils/getDatabase';
import { toUtcStartOfDay } from '../utils/date';

export class LearningStatsService {
    static async updateDailyStats(userId: string, stats: {
        quizzesTaken?: number;
        wordsReviewed?: number;
        totalQuestions?: number;
        correctAnswers?: number;
    }) {
        const db = await getDatabase();
        const startOfDay = toUtcStartOfDay();

        await db.collection('LearningStats').findOneAndUpdate(
            { userId, date: startOfDay },
            {
                $inc: {
                    quizzesTaken: stats.quizzesTaken || 0,
                    wordsReviewed: stats.wordsReviewed || 0,
                    totalQuestions: stats.totalQuestions || 0,
                    correctAnswers: stats.correctAnswers || 0
                },
                $setOnInsert: {
                    userId,
                    date: startOfDay,
                    createdAt: new Date()
                },
                $set: {
                    updatedAt: new Date()
                }
            },
            { upsert: true }
        );
    }
}
