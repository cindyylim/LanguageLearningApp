import { getDatabase } from '../utils/getDatabase';

export class LearningStatsService {
    static async updateDailyStats(userId: string, stats: {
        quizzesTaken?: number;
        wordsReviewed?: number;
        totalQuestions?: number;
        correctAnswers?: number;
    }) {
        const db = await getDatabase();
        const today = new Date();
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);

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
