import { getDatabase } from '../utils/getDatabase';
import { ObjectId } from 'mongodb';
import { AIService, RECOMMENDED_WORD_LIMIT } from './ai';
import { WordStatus, QuizAttempt, UserProgress} from "../shared/types/index";
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

        const recentStats = await db.collection('LearningStats')
            .find({ userId })
            .sort({ date: -1 })
            .limit(365)
            .toArray() as unknown as LearningStatsDocument[];
        const learningStats = recentStats.slice(0, 30);

        const wordProgressCounts = await this.getWordProgressCounts(userId);

        // Get recent quiz attempts
        const recentAttempts = await db.collection('QuizAttempt').find({ userId }).sort({ createdAt: -1 }).limit(10).toArray() as unknown as QuizAttempt[];

        const totalWords = await this.getTotalWordCount(userId);
        const currentStreak = this.computeStreakFromStats(recentStats);
        const summary = this.getSummaryStats(wordProgressCounts, recentAttempts, currentStreak, totalWords);

        return {
            summary,
            learningStats,
            recentAttempts
        };
    }

    /**
     * Count progress rows by status without loading full documents or joining Word.
     */
    private static async getWordProgressCounts(userId: string): Promise<{
        progressCount: number;
        masteredWords: number;
        needsReviewFromProgress: number;
    }> {
        const db = await getDatabase();
        const [result] = await db.collection('WordProgress').aggregate([
            { $match: { userId } },
            {
                $group: {
                    _id: null,
                    progressCount: { $sum: 1 },
                    masteredWords: {
                        $sum: {
                            $cond: [{ $eq: ['$status', WordStatus.MASTERED] }, 1, 0],
                        },
                    },
                    needsReviewFromProgress: {
                        $sum: {
                            $cond: [
                                { $in: ['$status', [WordStatus.NEW, WordStatus.LEARNING]] },
                                1,
                                0,
                            ],
                        },
                    },
                },
            },
        ]).toArray();

        return {
            progressCount: result?.progressCount ?? 0,
            masteredWords: result?.masteredWords ?? 0,
            needsReviewFromProgress: result?.needsReviewFromProgress ?? 0,
        };
    }

    /**
     * Sum denormalized wordCount across all lists for a user.
     */
    private static async getTotalWordCount(userId: string): Promise<number> {
        const db = await getDatabase();
        const result = await db.collection('VocabularyList').aggregate([
            { $match: { userId } },
            {
                $group: {
                    _id: null,
                    totalWords: { $sum: { $ifNull: ['$wordCount', 0] } },
                },
            },
        ]).toArray();

        return result[0]?.totalWords ?? 0;
    }

    /**
     * Calculate current learning streak from preloaded stats (newest first).
     */
    static computeStreakFromStats(recentStats: LearningStatsDocument[]): number {
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
        wordProgressCounts: {
            progressCount: number;
            masteredWords: number;
            needsReviewFromProgress: number;
        },
        recentAttempts: QuizAttempt[],
        currentStreak: number,
        totalWords: number
    ) {
        const { progressCount, masteredWords, needsReviewFromProgress } = wordProgressCounts;
        const wordsWithoutProgress = Math.max(0, totalWords - progressCount);
        const needsReview = needsReviewFromProgress + wordsWithoutProgress;
        const totalQuizzesTaken = recentAttempts.length;

        const avgScore = recentAttempts.length > 0
            ? recentAttempts.reduce((sum: number, attempt: QuizAttempt) => sum + (attempt.score || 0), 0) / recentAttempts.length
            : 0;

        return {
            totalWords,
            masteredWords,
            needsReview,
            currentStreak,
            totalQuizzesTaken,
            avgScore
        };
    }

    /**
     * Get AI-powered recommendations
     */
    static async getRecommendations(userId: string) {
        const db = await getDatabase();

        const [{ candidates, stats }, recentAttempts] = await Promise.all([
            this.buildRecommendationInput(userId),
            db.collection('QuizAttempt')
                .find({ userId })
                .sort({ createdAt: -1 })
                .limit(20)
                .toArray() as unknown as Promise<QuizAttempt[]>,
        ]);

        const performanceData: PerformanceData[] = recentAttempts.map((attempt) => ({
            wordId: '',
            score: attempt.score ?? 0,
            date: new Date(attempt.createdAt),
        }));

        const recommendations = await AIService.generateRecommendations(
            userId,
            candidates,
            stats,
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

    private static async buildRecommendationInput(userId: string): Promise<{
        candidates: UserProgress[];
        stats: { weakWordCount: number; hasLowStreak: boolean };
    }> {
        const db = await getDatabase();

        const userLists = await db.collection('VocabularyList')
            .find({ userId })
            .project({ _id: 1 })
            .toArray();
        const listIds = userLists.map((list) => list._id);

        const progressStatsPromise = db.collection('WordProgress').aggregate([
            { $match: { userId } },
            {
                $group: {
                    _id: null,
                    learningCount: {
                        $sum: {
                            $cond: [{ $eq: ['$status', WordStatus.LEARNING] }, 1, 0],
                        },
                    },
                    newInProgressCount: {
                        $sum: {
                            $cond: [{ $eq: ['$status', WordStatus.NEW] }, 1, 0],
                        },
                    },
                    hasLowStreak: {
                        $max: {
                            $cond: [{ $lt: ['$streak', 2] }, 1, 0],
                        },
                    },
                },
            },
        ]).toArray();

        const learningProgressPromise = db.collection('WordProgress')
            .find({ userId, status: WordStatus.LEARNING })
            .project({ wordId: 1, status: 1, streak: 1, lastReviewed: 1, reviewCount: 1 })
            .sort({ lastReviewed: -1 })
            .limit(RECOMMENDED_WORD_LIMIT)
            .toArray();

        const newProgressPromise = db.collection('WordProgress')
            .find({ userId, status: WordStatus.NEW })
            .project({ wordId: 1, status: 1, streak: 1, lastReviewed: 1, reviewCount: 1 })
            .limit(RECOMMENDED_WORD_LIMIT)
            .toArray();

        const unstudiedPromise = listIds.length > 0
            ? db.collection('Word').aggregate([
                { $match: { vocabularyListId: { $in: listIds } } },
                {
                    $lookup: {
                        from: 'WordProgress',
                        let: { wordId: '$_id' },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ['$userId', userId] },
                                            { $eq: ['$wordId', '$$wordId'] },
                                        ],
                                    },
                                },
                            },
                        ],
                        as: 'progressDocs',
                    },
                },
                { $match: { progressDocs: { $size: 0 } } },
                {
                    $facet: {
                        count: [{ $count: 'total' }],
                        sample: [
                            { $limit: RECOMMENDED_WORD_LIMIT },
                            { $project: { _id: 1 } },
                        ],
                    },
                },
            ]).toArray()
            : Promise.resolve([]);

        const [progressStatsRows, learningProgress, newProgress, unstudiedRows] = await Promise.all([
            progressStatsPromise,
            learningProgressPromise,
            newProgressPromise,
            unstudiedPromise,
        ]);

        const progressStats = progressStatsRows[0] as {
            learningCount?: number;
            newInProgressCount?: number;
            hasLowStreak?: number;
        } | undefined;

        const unstudiedFacet = unstudiedRows[0] as {
            count?: Array<{ total: number }>;
            sample?: Array<{ _id: ObjectId }>;
        } | undefined;

        const unstudiedCount = unstudiedFacet?.count?.[0]?.total ?? 0;
        const learningCount = progressStats?.learningCount ?? 0;
        const newInProgressCount = progressStats?.newInProgressCount ?? 0;

        const candidates: UserProgress[] = [
            ...learningProgress.map((wp) => this.toRecommendationProgress(userId, wp as {
                wordId: ObjectId | string;
                status: WordStatus;
                reviewCount?: number;
                streak?: number;
                lastReviewed?: Date | string;
            })),
            ...newProgress.map((wp) => this.toRecommendationProgress(userId, wp as {
                wordId: ObjectId | string;
                status: WordStatus;
                reviewCount?: number;
                streak?: number;
                lastReviewed?: Date | string;
            })),
            ...(unstudiedFacet?.sample ?? []).map((word) => ({
                userId,
                wordId: word._id.toString(),
                status: WordStatus.NEW,
                reviewCount: 0,
                streak: 0,
            })),
        ];

        const hasLowStreak = (progressStats?.hasLowStreak ?? 0) === 1 || unstudiedCount > 0;

        return {
            candidates,
            stats: {
                weakWordCount: learningCount + newInProgressCount + unstudiedCount,
                hasLowStreak,
            },
        };
    }

    private static toRecommendationProgress(
        userId: string,
        wp: {
            wordId: ObjectId | string;
            status: WordStatus;
            reviewCount?: number;
            streak?: number;
            lastReviewed?: Date | string;
        }
    ): UserProgress {
        return {
            userId,
            wordId: wp.wordId.toString(),
            status: wp.status,
            reviewCount: wp.reviewCount ?? 0,
            streak: wp.streak ?? 0,
            lastReviewed: wp.lastReviewed ? new Date(wp.lastReviewed) : undefined,
        };
    }
}
