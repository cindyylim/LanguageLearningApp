import { connectToDatabase } from '../utils/mongo';
import { ObjectId } from 'mongodb';
import { AIService, UserProgress } from './ai';
import { WordProgress } from '../interface/WordProgress';
import { QuizAttempt } from '../interface/Quiz';

interface LearningStatsDocument {
    date: Date;
}

export class AnalyticsService {
    /**
     * Get learning progress with stats, word progress, and attempts
     */
    static async getProgress(userId: string) {
        const db = await connectToDatabase();

        // Get user's learning statistics
        const learningStats = await db.collection('LearningStats').find({ userId }).sort({ date: -1 }).limit(30).toArray();

        // Get word progress - sorted by last reviewed
        const wordProgress = await db.collection('WordProgress').aggregate<WordProgress>([
            { $match: { userId } },
            { $sort: { lastReviewed: -1 } },
            {
                $lookup: {
                    from: 'Word',
                    localField: 'wordId',
                    foreignField: '_id',
                    as: 'word'
                }
            },
            { $unwind: { path: '$word', preserveNullAndEmptyArrays: true } }
        ]).toArray();

        // Get all quiz attempts
        const allAttempts = await db.collection('QuizAttempt').find({ userId }).sort({ createdAt: -1 }).toArray() as unknown as QuizAttempt[];
        const recentAttempts = allAttempts.slice(0, 10);

        // Calculate streak
        const currentStreak = await this.calculateStreak(userId);

        // Calculate summary statistics
        const summary = this.getSummaryStats(wordProgress, allAttempts, currentStreak);

        return {
            summary,
            learningStats,
            wordProgress,
            recentAttempts
        };
    }

    /**
     * Calculate current learning streak
     */
    static async calculateStreak(userId: string): Promise<number> {
        const db = await connectToDatabase();

        const recentStats = await db.collection('LearningStats')
            .find({ userId })
            .sort({ date: -1 })
            .limit(365)
            .toArray() as unknown as LearningStatsDocument[];

        let currentStreak = 0;
        const today = new Date();

        const toMidnight = (d: Date) => {
            const newD = new Date(d);
            newD.setHours(0, 0, 0, 0);
            return newD.getTime();
        };

        const todayTime = toMidnight(today);
        const yesterdayTime = todayTime - 86400000;

        if (recentStats.length > 0) {
            const lastActivityDate = toMidnight(recentStats[0]!.date);

            // Streak is valid if last activity was today or yesterday
            if (lastActivityDate === todayTime || lastActivityDate === yesterdayTime) {
                currentStreak = 1;
                let previousDate = lastActivityDate;

                for (let i = 1; i < recentStats.length; i++) {
                    const currentDate = toMidnight(recentStats[i]!.date);

                    if (currentDate === previousDate) continue;

                    if (previousDate - currentDate === 86400000) {
                        currentStreak++;
                        previousDate = currentDate;
                    } else {
                        break;
                    }
                }
            }
        }

        return currentStreak;
    }

    /**
     * Calculate summary statistics
     */
    static getSummaryStats(
        wordProgress: WordProgress[],
        allAttempts: QuizAttempt[],
        currentStreak: number
    ) {
        const totalWords = wordProgress.length;
        const masteredWords = wordProgress.filter((wp: WordProgress) => wp.mastery == 1.0).length;
        const needsReview = wordProgress.filter((wp: WordProgress) => wp.mastery < 1.0).length;
        const totalQuizzesTaken = allAttempts.length;

        const recentAttempts = allAttempts.slice(0, 10);
        const avgScore = recentAttempts.length > 0
            ? recentAttempts.reduce((sum: number, attempt: QuizAttempt) => sum + (attempt.score || 0), 0) / recentAttempts.length
            : 0;

        const maxWordStreak = wordProgress.reduce((max: number, wp: WordProgress) => Math.max(max, wp.streak || 0), 0);

        return {
            totalWords,
            masteredWords,
            needsReview,
            currentStreak,
            maxWordStreak,
            totalQuizzesTaken,
            avgScore
        };
    }

    /**
     * Get AI-powered recommendations
     */
    static async getRecommendations(userId: string) {
        const db = await connectToDatabase();

        const userProgress = await db.collection('WordProgress').aggregate<WordProgress[]>([
            { $match: { userId } },
            {
                $lookup: {
                    from: 'Word',
                    let: { wordId: { $toObjectId: '$wordId' } },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$_id', '$$wordId'] } } }
                    ],
                    as: 'word'
                }
            },
            { $unwind: { path: '$word', preserveNullAndEmptyArrays: true } }
        ]).toArray() as unknown as WordProgress[];

        const recentAttempts = await db.collection('QuizAttempt').find({ userId }).sort({ createdAt: -1 }).limit(20).toArray();

        const performanceData = [];
        for (const attempt of recentAttempts) {
            const answers = await db.collection('QuizAnswer').find({ attemptId: attempt._id.toString() }).toArray();
            for (const answer of answers) {
                const question = await db.collection('QuizQuestion').findOne({ _id: new ObjectId(answer.questionId) });
                performanceData.push({
                    wordId: question?.wordId || '',
                    score: answer.isCorrect ? 1 : 0,
                    date: answer.createdAt
                });
            }
        }

        const progressData: UserProgress[] = userProgress.map((wp: WordProgress) => ({
            userId,
            wordId: wp.wordId,
            mastery: wp.mastery,
            reviewCount: wp.reviewCount,
            streak: wp.streak,
            lastReviewed: wp.lastReviewed ? new Date(wp.lastReviewed) : undefined
        }));

        const recommendations = await AIService.generateRecommendations(
            userId,
            progressData,
            performanceData
        );

        const recommendedWordIds = (recommendations.recommendedWords || []).filter(
            (id: string) => typeof id === 'string' && /^[a-fA-F0-9]{24}$/.test(id)
        );

        const recommendedWords = recommendedWordIds.length > 0
            ? await db.collection('Word').find({ _id: { $in: recommendedWordIds.map((id: string) => new ObjectId(id)) } }).toArray()
            : [];

        return {
            ...recommendations,
            recommendedWords
        };
    }
}
