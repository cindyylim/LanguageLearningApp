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

        const [recentStats, wordProgressCounts, recentAttempts, totalWords] = await Promise.all([
            db.collection('LearningStats')
                .find({ userId })
                .sort({ date: -1 })
                .limit(365)
                .toArray() as unknown as Promise<LearningStatsDocument[]>,
            this.getWordProgressCounts(userId),
            db.collection('QuizAttempt')
                .find({ userId })
                .sort({ createdAt: -1 })
                .limit(10)
                .toArray() as unknown as Promise<QuizAttempt[]>,
            this.getTotalWordCount(userId),
        ]);

        const learningStats = recentStats.slice(0, 30);
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

        const [progressFacetRows, unstudiedData] = await Promise.all([
            db.collection('WordProgress').aggregate([
                { $match: { userId } },
                {
                    $facet: {
                        stats: [{
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
                        }],
                        learning: [
                            { $match: { status: WordStatus.LEARNING } },
                            { $sort: { lastReviewed: -1 } },
                            { $limit: RECOMMENDED_WORD_LIMIT },
                            { $project: { wordId: 1, status: 1, streak: 1, lastReviewed: 1, reviewCount: 1 } },
                        ],
                        newProgress: [
                            { $match: { status: WordStatus.NEW } },
                            { $limit: RECOMMENDED_WORD_LIMIT },
                            { $project: { wordId: 1, status: 1, streak: 1, lastReviewed: 1, reviewCount: 1 } },
                        ],
                    },
                },
            ]).toArray(),
            this.fetchUnstudiedWords(userId, listIds),
        ]);

        const progressFacet = progressFacetRows[0] as {
            stats?: Array<{
                learningCount?: number;
                newInProgressCount?: number;
                hasLowStreak?: number;
            }>;
            learning?: Array<Record<string, unknown>>;
            newProgress?: Array<Record<string, unknown>>;
        } | undefined;

        const progressStats = progressFacet?.stats?.[0];
        const learningProgress = progressFacet?.learning ?? [];
        const newProgress = progressFacet?.newProgress ?? [];
        const { unstudiedCount, unstudiedSample } = unstudiedData;
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
            ...(unstudiedSample).map((word) => ({
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

    private static async fetchUnstudiedWords(
        userId: string,
        listIds: ObjectId[]
    ): Promise<{ unstudiedCount: number; unstudiedSample: Array<{ _id: ObjectId }> }> {
        if (listIds.length === 0) {
            return { unstudiedCount: 0, unstudiedSample: [] };
        }

        const db = await getDatabase();
        const studiedWordIds = (await db.collection('WordProgress')
            .find({ userId })
            .project({ wordId: 1 })
            .toArray())
            .map((progress) => progress.wordId as ObjectId);

        const unstudiedFilter: Record<string, unknown> = {
            vocabularyListId: { $in: listIds },
        };
        if (studiedWordIds.length > 0) {
            unstudiedFilter._id = { $nin: studiedWordIds };
        }

        const [unstudiedCount, unstudiedSample] = await Promise.all([
            db.collection('Word').countDocuments(unstudiedFilter),
            db.collection('Word')
                .find(unstudiedFilter)
                .limit(RECOMMENDED_WORD_LIMIT)
                .project({ _id: 1 })
                .toArray() as Promise<Array<{ _id: ObjectId }>>,
        ]);

        return { unstudiedCount, unstudiedSample };
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
