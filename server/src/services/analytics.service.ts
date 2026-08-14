import { getDatabase } from '../utils/getDatabase';
import { ObjectId } from 'mongodb';
import { AIService } from './ai';
import { WordStatus, WordProgress, QuizAttempt, UserProgress} from "../shared/types/index";
import { utcDayNumber } from '../utils/date';

interface LearningStatsDocument {
    date: Date;
}

interface PerformanceData {
    wordId: string;
    score: number;
    date: Date;
}
export class AnalyticsService {
    /**
     * Get learning progress with stats, word progress, and attempts
     */
    static async getProgress(userId: string) {
        const db = await getDatabase();

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

        // Count total words across user's vocabulary lists
        const userLists = await db.collection('VocabularyList').find({ userId }).project({ _id: 1 }).toArray();
        const listIds = userLists.map(list => list._id);
        const totalWords = listIds.length > 0
            ? await db.collection('Word').countDocuments({ vocabularyListId: { $in: listIds } })
            : 0;

        // Calculate streak
        const currentStreak = await this.calculateStreak(userId);

        // Calculate summary statistics
        const summary = this.getSummaryStats(wordProgress, allAttempts, currentStreak, totalWords);

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
        const db = await getDatabase();

        const recentStats = await db.collection('LearningStats')
            .find({ userId })
            .sort({ date: -1 })
            .limit(365)
            .toArray() as unknown as LearningStatsDocument[];

        let currentStreak = 0;
        const todayDay = utcDayNumber(new Date());

        if (recentStats.length > 0) {
            const lastActivityDay = utcDayNumber(recentStats[0]!.date);
            const daysSinceLastActivity = todayDay - lastActivityDay;

            // Streak is valid if last activity was today or yesterday (UTC calendar days)
            if (daysSinceLastActivity === 0 || daysSinceLastActivity === 1) {
                currentStreak = 1;
                let previousDay = lastActivityDay;

                for (let i = 1; i < recentStats.length; i++) {
                    const currentDay = utcDayNumber(recentStats[i]!.date);

                    if (currentDay === previousDay) continue;

                    if (previousDay - currentDay === 1) {
                        currentStreak++;
                        previousDay = currentDay;
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
        currentStreak: number,
        totalWords: number
    ) {
        const masteredWords = wordProgress.filter((wp: WordProgress) => wp.status === WordStatus.MASTERED).length;
        const needsReviewFromProgress = wordProgress.filter(
            (wp: WordProgress) => wp.status === WordStatus.NEW || wp.status === WordStatus.LEARNING
        ).length;
        const wordsWithoutProgress = Math.max(0, totalWords - wordProgress.length);
        const needsReview = needsReviewFromProgress + wordsWithoutProgress;
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
        const db = await getDatabase();

        const userProgress = await db.collection('WordProgress').aggregate<WordProgress>([
            { $match: { userId } },
            { $sort: { lastReviewed: -1 } },  // Most recent first
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

        const recentAttempts = await db.collection('QuizAttempt').find({ userId }).sort({ createdAt: -1 }).limit(20).toArray();

        const performanceData: PerformanceData[] = [];
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
            wordId: wp.wordId.toString(),
            status: wp.status,
            reviewCount: wp.reviewCount,
            streak: wp.streak,
            lastReviewed: wp.lastReviewed ? new Date(wp.lastReviewed) : undefined
        }));

        const progressWordIds = new Set(progressData.map((p) => p.wordId));
        const userLists = await db.collection('VocabularyList').find({ userId }).project({ _id: 1 }).toArray();
        const listIds = userLists.map((list) => list._id);

        if (listIds.length > 0) {
            const words = await db.collection('Word')
                .find({ vocabularyListId: { $in: listIds } })
                .project({ _id: 1 })
                .toArray();

            for (const word of words) {
                const wordId = word._id.toString();
                if (!progressWordIds.has(wordId)) {
                    progressData.push({
                        userId,
                        wordId,
                        status: WordStatus.NEW,
                        reviewCount: 0,
                        streak: 0,
                    });
                }
            }
        }

        const recommendations = await AIService.generateRecommendations(
            userId,
            progressData,
            performanceData
        );

        const recommendedWordIds = (recommendations.recommendedWords || []).filter(
            (id: any) => (typeof id === 'string' && /^[a-fA-F0-9]{24}$/.test(id)) || id instanceof ObjectId
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
