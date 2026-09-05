import { getDatabase } from '../utils/getDatabase';
import { LearningStatsService } from './learningStats.service';
import { ObjectId, type AnyBulkWriteOperation } from 'mongodb';
import { AIService } from './ai';
import type { AIWordInput, Question } from '../shared/types/index';
import { Quiz, QuizQuestion } from '../interface/Quiz';
import { Answer } from '../interface/Answer';
import { AppError } from '../utils/AppError';
import logger from '../utils/logger';
import { calculateSM2, mapAccuracyToQuality } from '../utils/sm2';
import type { IdempotencyKey } from '../interface/IdempotencyKey';

const DEFAULT_QUIZ_PAGE_LIMIT = 20;
const QUIZ_RESULTS_ATTEMPT_LIMIT = 20;

function isMongoDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && (error as { code: number }).code === 11000;
}

export class QuizService {
    private static async claimIdempotencyKey(
        db: Awaited<ReturnType<typeof getDatabase>>,
        userId: string,
        idempotencyKey: string
    ): Promise<'claimed' | 'duplicate'> {
        try {
            await db.collection<IdempotencyKey>('IdempotencyKey').insertOne({
                userId,
                key: idempotencyKey,
                status: 'pending',
                createdAt: new Date()
            });
            return 'claimed';
        } catch (error) {
            if (!isMongoDuplicateKeyError(error)) {
                throw error;
            }

            return 'duplicate';
        }
    }

    private static async waitForIdempotentQuizId(
        db: Awaited<ReturnType<typeof getDatabase>>,
        userId: string,
        idempotencyKey: string
    ): Promise<string> {
        const deadline = Date.now() + 5000;

        while (Date.now() < deadline) {
            const record = await db.collection<IdempotencyKey>('IdempotencyKey').findOne({ userId, key: idempotencyKey });
            if (record?.quizId) {
                return record.quizId;
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
        }

        throw new AppError('Quiz generation already in progress', 409);
    }

    private static async releaseIdempotencyKey(
        db: Awaited<ReturnType<typeof getDatabase>>,
        userId: string,
        idempotencyKey: string
    ): Promise<void> {
        await db.collection<IdempotencyKey>('IdempotencyKey').deleteOne({
            userId,
            key: idempotencyKey,
            status: 'pending'
        });
    }

    /**
     * Generate AI-powered quiz
     */
    static async generateQuiz(vocabularyListId: string, options: {
        questionCount?: number;
        difficulty?: 'easy' | 'medium' | 'hard';
    }, userId: string, idempotencyKey?: string): Promise<{ quiz: Record<string, unknown>; created: boolean } | null> {
        const db = await getDatabase();

        if (idempotencyKey) {
            const existing = await db.collection<IdempotencyKey>('IdempotencyKey').findOne({ userId, key: idempotencyKey });
            if (existing?.quizId) {
                const existingQuiz = await this.getQuizById(existing.quizId, userId);
                if (!existingQuiz) {
                    throw new AppError('Idempotent quiz not found', 500);
                }
                return { quiz: existingQuiz, created: false };
            }
        }

        const vocabularyList = await db.collection('VocabularyList').findOne({
            _id: new ObjectId(vocabularyListId),
            userId
        });

        if (!vocabularyList) {
            return null;
        }

        const questionCount = options.questionCount || 10;
        const difficulty = options.difficulty || 'medium';
        const listObjectId = new ObjectId(vocabularyListId);
        const totalWordsInList = vocabularyList.wordCount;
        if (totalWordsInList === 0) {
            throw new Error('No words in vocabulary list');
        }

        const sampleSize = Math.min(totalWordsInList, questionCount * 2);
        const words = sampleSize === totalWordsInList
            ? await db.collection('Word').find({ vocabularyListId: listObjectId }).toArray()
            : await db.collection('Word').aggregate([
                { $match: { vocabularyListId: listObjectId } },
                { $sample: { size: sampleSize } },
            ]).toArray();

        if (idempotencyKey) {
            const claimResult = await this.claimIdempotencyKey(db, userId, idempotencyKey);
            if (claimResult === 'duplicate') {
                const quizId = await this.waitForIdempotentQuizId(db, userId, idempotencyKey);
                const existingQuiz = await this.getQuizById(quizId, userId);
                if (!existingQuiz) {
                    throw new AppError('Idempotent quiz not found', 500);
                }
                return { quiz: existingQuiz, created: false };
            }
        }

        try {
            const aiQuestions: Question[] = await AIService.generateQuestions(
                words.map((w): AIWordInput => ({
                    _id: w._id.toString(),
                    word: w.word,
                    translation: w.translation,
                    partOfSpeech: w.partOfSpeech || undefined,
                    difficulty: w.difficulty
                })),
                vocabularyList.targetLanguage,
                vocabularyList.nativeLanguage,
                questionCount,
                difficulty
            );

            const now = new Date();
            const quizResult = await db.collection('Quiz').insertOne({
                title: `Quiz: ${vocabularyList.name}`,
                description: `AI-generated quiz from ${vocabularyList.name}`,
                difficulty,
                questionCount,
                userId,
                createdAt: now,
                updatedAt: now
            });

            const quizId = quizResult.insertedId.toString();
            const questionDocs = aiQuestions.map((aiQuestion: Question) => ({
                question: aiQuestion.question,
                type: aiQuestion.type,
                correctAnswer: aiQuestion.correctAnswer,
                options: aiQuestion.options ? JSON.stringify(aiQuestion.options) : null,
                context: aiQuestion.context,
                difficulty: aiQuestion.difficulty,
                quizId,
                wordId: aiQuestion.wordId,
                createdAt: now
            }));

            const insertResult = await db.collection('QuizQuestion').insertMany(questionDocs);
            const quizQuestions = questionDocs.map((doc, index) => ({
                ...doc,
                _id: insertResult.insertedIds[index]!,
            }));

            const quiz = {
                _id: quizResult.insertedId,
                title: `Quiz: ${vocabularyList.name}`,
                description: `AI-generated quiz from ${vocabularyList.name}`,
                difficulty,
                questionCount,
                userId,
                createdAt: now,
                updatedAt: now,
                questions: quizQuestions,
            };

            if (idempotencyKey) {
                await db.collection<IdempotencyKey>('IdempotencyKey').updateOne(
                    { userId, key: idempotencyKey },
                    {
                        $set: {
                            quizId,
                            status: 'completed',
                            completedAt: new Date()
                        }
                    }
                );
            }

            return { quiz, created: true };
        } catch (error) {
            if (idempotencyKey) {
                await this.releaseIdempotencyKey(db, userId, idempotencyKey);
            }
            throw error;
        }
    }

    /**
     * Get user's quizzes with questions and latest attempt (batched queries).
     */
    static async getUserQuizzes(userId: string, page: number = 1, limit: number = DEFAULT_QUIZ_PAGE_LIMIT) {
        const db = await getDatabase();
        const skip = (page - 1) * limit;

        const quizzes = await db.collection('Quiz')
            .find({ userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit + 1)
            .toArray() as unknown as Quiz[];

        const hasMore = quizzes.length > limit;
        const pageQuizzes = hasMore ? quizzes.slice(0, limit) : quizzes;
        const quizIds = pageQuizzes.map((quiz) => quiz._id.toString());

        if (quizIds.length === 0) {
            return { quizzes: [], hasMore: false };
        }

        const [allQuestions, latestAttempts] = await Promise.all([
            db.collection('QuizQuestion').find({ quizId: { $in: quizIds } }).toArray(),
            db.collection('QuizAttempt').aggregate([
                { $match: { userId, quizId: { $in: quizIds } } },
                { $sort: { createdAt: -1 } },
                {
                    $group: {
                        _id: '$quizId',
                        attempt: { $first: '$$ROOT' },
                    },
                },
            ]).toArray(),
        ]);

        const questionsByQuizId = new Map<string, typeof allQuestions>();
        for (const question of allQuestions) {
            const quizId = question.quizId as string;
            const existing = questionsByQuizId.get(quizId) ?? [];
            existing.push(question);
            questionsByQuizId.set(quizId, existing);
        }

        const latestAttemptByQuizId = new Map<string, unknown>(
            latestAttempts.map((row) => [row._id as string, row.attempt])
        );

        const quizzesWithDetails = pageQuizzes.map((quiz) => {
            const quizId = quiz._id.toString();
            const questions = questionsByQuizId.get(quizId) ?? [];
            const latestAttempt = latestAttemptByQuizId.get(quizId);
            const attempts = latestAttempt ? [latestAttempt] : [];

            return {
                ...quiz,
                questions,
                attempts,
                _count: { questions: questions.length, attempts: attempts.length },
            };
        });

        return { quizzes: quizzesWithDetails, hasMore };
    }

    /**
     * Get specific quiz with questions
     */
    static async getQuizById(quizId: string, userId: string) {
        const db = await getDatabase();

        const quiz = await db.collection('Quiz').findOne({ _id: new ObjectId(quizId), userId });

        if (!quiz) {
            return null;
        }

        const questions = await db.collection('QuizQuestion').find({ quizId }).toArray();

        return { ...quiz, questions };
    }

    /**
     * Submit quiz answers and update progress
     */
    static async submitQuizAnswers(quizId: string, answers: Array<{
        questionId: string;
        answer: string;
    }>, userId: string) {
        const db = await getDatabase();

        const quiz = await db.collection('Quiz').findOne({ _id: new ObjectId(quizId), userId });

        if (!quiz) {
            return null;
        }

        const questions = await db.collection('QuizQuestion').find({ quizId }).toArray() as unknown as QuizQuestion[];

        let correctAnswers = 0;
        const totalQuestions = questions.length;

        const processedAnswers = answers.map((answer) => {
            const question = questions.find((q: QuizQuestion) => q._id.toString() === answer.questionId);
            if (!question) throw new AppError(`Question ${answer.questionId} not found`, 400);

            const isCorrect = answer.answer.toLowerCase().trim() === question.correctAnswer.toLowerCase().trim();
            if (isCorrect) correctAnswers++;

            return {
                answer: answer.answer,
                isCorrect,
                questionId: answer.questionId,
                wordId: question.wordId
            };
        });

        const wordProgressMap = new Map<string, { correct: number; total: number }>();

        processedAnswers.forEach((processedAnswer: Answer) => {
            if (processedAnswer.wordId) {
                const wordIdStr = processedAnswer.wordId.toString();
                if (!wordIdStr || wordIdStr.length !== 24) {
                    return;
                }
                if (!wordProgressMap.has(wordIdStr)) {
                    wordProgressMap.set(wordIdStr, { correct: 0, total: 0 });
                }
                const stats = wordProgressMap.get(wordIdStr)!;
                stats.total++;
                if (processedAnswer.isCorrect) {
                    stats.correct++;
                }
            }
        });
        const wordsReviewed = wordProgressMap.size;
        await this.updateWordProgressFromQuiz(wordProgressMap, userId);

        const attemptCreatedAt = new Date();
        const attemptResult = await db.collection('QuizAttempt').insertOne({
            score: totalQuestions > 0 ? correctAnswers / totalQuestions : 0,
            completed: true,
            userId,
            quizId,
            createdAt: attemptCreatedAt
        });

        await LearningStatsService.updateDailyStats(userId, {
            quizzesTaken: 1,
            totalQuestions,
            correctAnswers,
            wordsReviewed
        });

        if (processedAnswers.length > 0) {
            await db.collection('QuizAnswer').insertMany(
                processedAnswers.map((processedAnswer: Answer) => ({
                    answer: processedAnswer.answer,
                    isCorrect: processedAnswer.isCorrect,
                    attemptId: attemptResult.insertedId.toString(),
                    questionId: processedAnswer.questionId,
                    userId,
                    createdAt: attemptCreatedAt,
                }))
            );
        }

        return {
            id: attemptResult.insertedId.toString(),
            score: totalQuestions > 0 ? correctAnswers / totalQuestions : 0,
            completed: true,
            correctAnswers,
            totalQuestions,
            answers: processedAnswers
        };
    }


    /**
     * Update word progress based on quiz performance
     */
    private static async updateWordProgressFromQuiz(
        wordProgressMap: Map<string, { correct: number; total: number }>,
        userId: string
    ) {
        const db = await getDatabase();
        const now = new Date();
        const wordIds = [...wordProgressMap.keys()];

        if (wordIds.length === 0) {
            return;
        }

        const objectIds = wordIds.map((wordId) => new ObjectId(wordId));
        const [existingWords, existingProgressList] = await Promise.all([
            db.collection('Word').find({ _id: { $in: objectIds } }).project({ _id: 1 }).toArray(),
            db.collection('WordProgress').find({ userId, wordId: { $in: objectIds } }).toArray(),
        ]);

        const existingWordIds = new Set(existingWords.map((word) => word._id.toString()));
        const progressByWordId = new Map(
            existingProgressList.map((progress) => [progress.wordId.toString(), progress])
        );

        const bulkOps: AnyBulkWriteOperation[] = [];

        for (const [wordId, stats] of wordProgressMap.entries()) {
            if (!existingWordIds.has(wordId)) {
                logger.warn(`Skipping progress update for non-existent word: ${wordId}`);
                continue;
            }

            const existingProgress = progressByWordId.get(wordId);
            const avgCorrectness = stats.total > 0 ? stats.correct / stats.total : 0;
            const quality = mapAccuracyToQuality(avgCorrectness);
            const sm2Result = calculateSM2({
                quality,
                repetition: existingProgress?.streak ?? 0,
                easeFactor: existingProgress?.easeFactor ?? 2.5,
                interval: existingProgress?.interval ?? 1,
                now
            });

            if (existingProgress) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: existingProgress._id as ObjectId },
                        update: {
                            $set: {
                                status: sm2Result.status,
                                reviewCount: existingProgress.reviewCount + stats.total,
                                streak: sm2Result.repetition,
                                easeFactor: sm2Result.easeFactor,
                                interval: sm2Result.interval,
                                lastReviewed: now,
                                nextReview: sm2Result.nextReview,
                                updatedAt: now,
                            },
                        },
                    },
                });
            } else {
                bulkOps.push({
                    insertOne: {
                        document: {
                            userId,
                            wordId: new ObjectId(wordId),
                            status: sm2Result.status,
                            reviewCount: stats.total,
                            streak: sm2Result.repetition,
                            easeFactor: sm2Result.easeFactor,
                            interval: sm2Result.interval,
                            lastReviewed: now,
                            nextReview: sm2Result.nextReview,
                            createdAt: now,
                            updatedAt: now,
                        },
                    },
                });
            }
        }

        if (bulkOps.length > 0) {
            await db.collection('WordProgress').bulkWrite(bulkOps);
        }
    }
}
