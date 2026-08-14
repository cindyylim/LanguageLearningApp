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

        const nextDay = new Date(startOfDay);
        nextDay.setDate(nextDay.getDate() + 1);

        const existingStats = await db.collection('LearningStats').findOne({
            userId,
            date: { $gte: startOfDay, $lt: nextDay }
        });

        if (existingStats) {
            await db.collection('LearningStats').updateOne(
                { _id: existingStats._id },
                {
                    $inc: {
                        quizzesTaken: stats.quizzesTaken || 0,
                        wordsReviewed: stats.wordsReviewed || 0,
                        totalQuestions: stats.totalQuestions || 0,
                        correctAnswers: stats.correctAnswers || 0
                    },
                    $set: {
                        updatedAt: new Date()
                    }
                }
            );
        } else {
            await db.collection('LearningStats').insertOne({
                userId,
                date: today,
                quizzesTaken: stats.quizzesTaken || 0,
                wordsReviewed: stats.wordsReviewed || 0,
                totalQuestions: stats.totalQuestions || 0,
                correctAnswers: stats.correctAnswers || 0,
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }
    }
}
