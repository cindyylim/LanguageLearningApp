import { getDatabase } from '../utils/getDatabase';
import { LearningStatsService } from './learningStats.service';
import { ObjectId } from 'mongodb';
import { AIService } from './ai';
import type { AIWordInput, Question } from '../shared/types/index';
import { Quiz, QuizQuestion } from '../interface/Quiz';
import { Answer } from '../interface/Answer';
import logger from '../utils/logger';
import { calculateSM2, mapAccuracyToQuality } from '../utils/sm2';

export class QuizService {
    /**
     * Generate AI-powered quiz
     */
    static async generateQuiz(vocabularyListId: string, options: {
        questionCount?: number;
        difficulty?: 'easy' | 'medium' | 'hard';
    }, userId: string) {
        const db = await getDatabase();

        // Get vocabulary list with words
        const vocabularyList = await db.collection('VocabularyList').findOne({
            _id: new ObjectId(vocabularyListId),
            userId
        });

        if (!vocabularyList) {
            return null;
        }

        const words = await db.collection('Word').find({
            vocabularyListId: new ObjectId(vocabularyListId)
        }).toArray();

        if (words.length === 0) {
            throw new Error('No words in vocabulary list');
        }

        const questionCount = options.questionCount || 10;
        const difficulty = options.difficulty || 'medium';

        // Generate questions using AI
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

        // Create quiz in database
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

        // Create quiz questions
        const quizQuestions = await Promise.all(
            aiQuestions.map(async (aiQuestion: Question) => {
                const result = await db.collection('QuizQuestion').insertOne({
                    question: aiQuestion.question,
                    type: aiQuestion.type,
                    correctAnswer: aiQuestion.correctAnswer,
                    options: aiQuestion.options ? JSON.stringify(aiQuestion.options) : null,
                    context: aiQuestion.context,
                    difficulty: aiQuestion.difficulty,
                    quizId: quizId,
                    wordId: aiQuestion.wordId,
                    createdAt: now
                });
                return await db.collection('QuizQuestion').findOne({ _id: result.insertedId });
            })
        );

        const quiz = await db.collection('Quiz').findOne({ _id: quizResult.insertedId });

        return { ...quiz, questions: quizQuestions };
    }

    /**
     * Get user's quizzes with attempts
     */
    static async getUserQuizzes(userId: string) {
        const db = await getDatabase();

        const quizzes = await db.collection('Quiz').find({ userId }).sort({ createdAt: -1 }).toArray() as unknown as Quiz[];

        // For each quiz, get questions and last attempt
        const quizzesWithDetails = await Promise.all(
            quizzes.map(async (quiz: Quiz) => {
                const questions = await db.collection('QuizQuestion').find({ quizId: quiz._id.toString() }).toArray();
                const attempts = await db.collection('QuizAttempt').find({ quizId: quiz._id.toString(), userId }).sort({ createdAt: -1 }).limit(1).toArray();
                return {
                    ...quiz,
                    questions,
                    attempts,
                    _count: { questions: questions.length, attempts: attempts.length }
                };
            })
        );

        return quizzesWithDetails;
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
            if (!question) throw new Error(`Question ${answer.questionId} not found`);

            const isCorrect = answer.answer.toLowerCase().trim() === question.correctAnswer.toLowerCase().trim();
            if (isCorrect) correctAnswers++;

            return {
                answer: answer.answer,
                isCorrect,
                questionId: answer.questionId,
                wordId: question.wordId
            };
        });

        // Update word progress for each unique word
        const wordProgressMap = new Map<string, { correct: number; total: number }>();

        // Group answers by wordId
        processedAnswers.forEach((processedAnswer: Answer) => {
            if (processedAnswer.wordId) {
                const wordId = processedAnswer.wordId;
                const wordIdStr = wordId.toString();
                if (!wordIdStr || wordIdStr.length !== 24) {
                    return;
                }
                if (!wordProgressMap.has(wordId)) {
                    wordProgressMap.set(wordId, { correct: 0, total: 0 });
                }
                const stats = wordProgressMap.get(wordId)!;
                stats.total++;
                if (processedAnswer.isCorrect) {
                    stats.correct++;
                }
            }
        });
        const wordsReviewed = wordProgressMap.size;
        // Update progress for each word
        await this.updateWordProgressFromQuiz(wordProgressMap, userId);

        // Create quiz attempt
        const attemptResult = await db.collection('QuizAttempt').insertOne({
            score: totalQuestions > 0 ? correctAnswers / totalQuestions : 0,
            completed: true,
            userId,
            quizId,
            createdAt: new Date()
        });

        // Update daily learning stats
        await LearningStatsService.updateDailyStats(userId, {
            quizzesTaken: 1,
            totalQuestions,
            correctAnswers,
            wordsReviewed
        });

        // Store answers
        await Promise.all(
            processedAnswers.map(async (processedAnswer: Answer) => {
                await db.collection('QuizAnswer').insertOne({
                    answer: processedAnswer.answer,
                    isCorrect: processedAnswer.isCorrect,
                    attemptId: attemptResult.insertedId.toString(),
                    questionId: processedAnswer.questionId,
                    userId,
                    createdAt: new Date()
                });
            })
        );

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
     * Get quiz results with detailed answers
     */
    static async getQuizResults(quizId: string, userId: string) {
        const db = await getDatabase();

        const quiz = await db.collection('Quiz').findOne({ _id: new ObjectId(quizId), userId });

        if (!quiz) {
            return null;
        }

        const attempts = await db.collection('QuizAttempt').find({ quizId, userId }).sort({ createdAt: -1 }).toArray();

        for (const attempt of attempts) {
            attempt.answers = await db.collection('QuizAnswer').find({ attemptId: attempt._id.toString() }).toArray();
            for (const answer of attempt.answers) {
                answer.question = await db.collection('QuizQuestion').findOne({ _id: new ObjectId(answer.questionId) });
            }
        }

        return { ...quiz, attempts };
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

        await Promise.all(
            Array.from(wordProgressMap.entries()).map(async ([wordId, stats]) => {

                // Check if the word exists in the Word database
                const wordExists = await db.collection('Word').findOne({ _id: new ObjectId(wordId) });

                // Skip if word doesn't exist (may have been deleted)
                if (!wordExists) {
                    logger.warn(`Skipping progress update for non-existent word: ${wordId}`);
                    return;
                }

                const existingProgress = await db.collection('WordProgress').findOne({
                    userId,
                    wordId: new ObjectId(wordId)
                });

                // Calculate average correctness and map to SM-2 quality grade
                const avgCorrectness = stats.total > 0 ? stats.correct / stats.total : 0;
                const quality = mapAccuracyToQuality(avgCorrectness);

                // Run SM-2 algorithm
                const sm2Result = calculateSM2({
                    quality,
                    repetition: existingProgress?.streak ?? 0,
                    easeFactor: existingProgress?.easeFactor ?? 2.5,
                    interval: existingProgress?.interval ?? 1,
                    now
                });

                if (existingProgress) {
                    // Update existing progress
                    const newReviewCount = existingProgress.reviewCount + stats.total;

                    await db.collection('WordProgress').updateOne(
                        { _id: existingProgress._id },
                        {
                            $set: {
                                status: sm2Result.status,
                                reviewCount: newReviewCount,
                                streak: sm2Result.repetition,
                                easeFactor: sm2Result.easeFactor,
                                interval: sm2Result.interval,
                                lastReviewed: now,
                                nextReview: sm2Result.nextReview,
                                updatedAt: now
                            }
                        }
                    );
                } else {
                    // Create new progress record
                    await db.collection('WordProgress').insertOne({
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
                        updatedAt: now
                    });
                }
            })
        );
    }
}
