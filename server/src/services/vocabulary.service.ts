import { connectToDatabase } from '../utils/mongo';
import { connectToTestDatabase } from '../utils/testMongo';
import { ObjectId } from 'mongodb';
import { AIService } from './ai';
import { Word } from '../interface/Word';

interface WordDocument {
    _id: string;
    word: string;
    translation: string;
    partOfSpeech?: string | null;
    difficulty: string;
    vocabularyListId: string;
    createdAt: Date;
    updatedAt: Date;
}

interface WordProgressDocument {
    _id: ObjectId;
    wordId: string;
    userId: string;
    mastery: number;
    status: string;
    reviewCount: number;
    streak: number;
    lastReviewed: string;
    nextReview: string;
    createdAt: string;
    updatedAt: string;
}

interface AIWord {
    word: string;
    translation: string;
    partOfSpeech?: string;
    difficulty?: string;
}

type ProgressMap = Record<string, WordProgressDocument>;

export class VocabularyService {
    /**
     * Get all vocabulary lists for a user with word counts
     */
    static async getUserLists(userId: string, page: number = 1, limit: number = 20) {
        const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();
        const skip = (page - 1) * limit;

        const lists = await db.collection('VocabularyList').aggregate([
            { $match: { userId } },
            { $sort: { updatedAt: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
                $lookup: {
                    from: 'Word',
                    let: { listId: '$_id' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$vocabularyListId', '$$listId'] } } },
                        {
                            $lookup: {
                                from: 'WordProgress',
                                let: { wordId: '$_id' },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    { $eq: ['$wordId', '$$wordId'] },
                                                    { $eq: ['$userId', userId] }
                                                ]
                                            }
                                        }
                                    }
                                ],
                                as: 'progressDocs'
                            }
                        },
                        {
                            $addFields: {
                                progress: { $arrayElemAt: ['$progressDocs', 0] }
                            }
                        },
                        { $project: { progressDocs: 0 } }
                    ],
                    as: 'words'
                }
            },
            {
                $addFields: {
                    _count: { words: { $size: '$words' } }
                }
            }
        ]).toArray();

        return lists;
    }

    /**
     * Get specific vocabulary list with words and progress
     */
    static async getListById(listId: string, userId: string) {
        const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();

        const list = await db.collection('VocabularyList').findOne({
            _id: new ObjectId(listId),
            userId
        });

        if (!list) {
            return null;
        }

        const words = await db.collection('Word').find({
            vocabularyListId: new ObjectId(listId)
        }).toArray() as unknown as WordDocument[];

        // Fetch progress for all words for this user
        const wordIds = words.map((w: WordDocument) => w._id.toString());
        const progressData = await db.collection('WordProgress').find({
            userId,
            wordId: { $in: wordIds.map(id => new ObjectId(id)) }
        }).toArray() as unknown as WordProgressDocument[];

        const progressMap = progressData.reduce((acc: ProgressMap, p: WordProgressDocument) => {
            acc[p.wordId] = p;
            return acc;
        }, {} as ProgressMap);

        const wordsWithProgress = words.map((word: WordDocument) => {
            const progress = progressMap[word._id.toString()];
            return {
                _id: word._id.toString(),
                word: word.word,
                translation: word.translation,
                partOfSpeech: word.partOfSpeech || '',
                difficulty: word.difficulty,
                vocabularyListId: word.vocabularyListId.toString(),
                createdAt: word.createdAt instanceof Date ? word.createdAt.toISOString() : String(word.createdAt),
                updatedAt: word.updatedAt instanceof Date ? word.updatedAt.toISOString() : String(word.updatedAt),
                progress: progress ? {
                    _id: progress._id.toString(),
                    wordId: progress.wordId,
                    userId: progress.userId,
                    mastery: progress.mastery,
                    status: progress.status,
                    reviewCount: progress.reviewCount,
                    streak: progress.streak,
                    lastReviewed: progress.lastReviewed,
                    nextReview: progress.nextReview,
                    createdAt: progress.createdAt,
                    updatedAt: progress.updatedAt
                } : {
                    mastery: 0,
                    status: 'not_started',
                    reviewCount: 0,
                    streak: 0
                }
            } as Word;
        });

        return { ...list, words: wordsWithProgress };
    }

    /**
     * Create new vocabulary list
     */
    static async createList(data: {
        name: string;
        description?: string;
        targetLanguage?: string;
        nativeLanguage?: string;
    }, userId: string) {
        const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();

        const now = new Date();
        const result = await db.collection('VocabularyList').insertOne({
            name: data.name,
            description: data.description,
            targetLanguage: data.targetLanguage,
            nativeLanguage: data.nativeLanguage,
            userId,
            createdAt: now,
            updatedAt: now
        });

        const list = await db.collection('VocabularyList').findOne({
            _id: result.insertedId,
            userId
        });

        return list;
    }

    /**
     * Update vocabulary list
     */
    static async updateList(listId: string, data: {
        name: string;
        description?: string;
    }, userId: string) {
        const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();

        const result = await db.collection('VocabularyList').updateOne(
            { _id: new ObjectId(listId), userId },
            { $set: { name: data.name, description: data.description, updatedAt: new Date() } }
        );

        return result.matchedCount > 0;
    }

    /**
     * Delete vocabulary list and cascade delete words and progress
     */
    static async deleteList(listId: string, userId: string) {
        const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();
        const listObjectId = new ObjectId(listId);

        const list = await db.collection('VocabularyList').findOne({
            _id: listObjectId,
            userId
        });

        if (!list) {
            return null;
        }

        const words = await db
            .collection('Word')
            .find({ vocabularyListId: listObjectId })
            .project({ _id: 1 })
            .toArray() as unknown as { _id: ObjectId }[];
        const wordIds = words.map((w: { _id: ObjectId }) => w._id.toString());

        await db.collection('VocabularyList').deleteOne({ _id: listObjectId });
        const wordsDeleteResult = await db
            .collection('Word')
            .deleteMany({ vocabularyListId: listObjectId });

        let progressDeleteResult = { deletedCount: 0 };
        if (wordIds.length > 0) {
            progressDeleteResult = await db.collection('WordProgress').deleteMany({
                userId,
                wordId: { $in: wordIds.map(id => new ObjectId(id)) }
            });
        }

        return {
            deletedWords: wordsDeleteResult.deletedCount || 0,
            deletedWordProgress: progressDeleteResult.deletedCount || 0
        };
    }

    /**
     * Add word to vocabulary list
     */
    static async addWord(listId: string, wordData: {
        word: string;
        translation: string;
        partOfSpeech?: string;
        difficulty: string;
    }, userId: string) {
        const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();

        // Verify vocabulary list belongs to user
        const list = await db.collection('VocabularyList').findOne({
            _id: new ObjectId(listId),
            userId
        });

        if (!list) {
            return null;
        }

        const now = new Date();
        const data = {
            word: wordData.word,
            translation: wordData.translation,
            partOfSpeech: wordData.partOfSpeech || null,
            difficulty: wordData.difficulty,
            vocabularyListId: new ObjectId(listId),
            createdAt: now,
            updatedAt: now
        };

        const result = await db.collection('Word').insertOne(data);
        const newWord = await db.collection('Word').findOne({ _id: result.insertedId });

        return newWord;
    }

    /**
     * Update word in vocabulary list
     */
    static async updateWord(listId: string, wordId: string, wordData: {
        word: string;
        translation: string;
        partOfSpeech?: string;
        difficulty?: string;
    }, userId: string) {
        const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();

        // Check list ownership
        const list = await db.collection('VocabularyList').findOne({
            _id: new ObjectId(listId),
            userId
        });

        if (!list) {
            return null;
        }

        // Update word
        const result = await db.collection('Word').updateOne(
            { _id: new ObjectId(wordId), vocabularyListId: new ObjectId(listId) },
            { $set: { ...wordData, updatedAt: new Date() } }
        );

        if (result.matchedCount === 0) {
            return null;
        }

        const updatedWord = await db.collection('Word').findOne({ _id: new ObjectId(wordId) });
        return updatedWord;
    }

    /**
     * Delete word from vocabulary list
     */
    static async deleteWord(listId: string, wordId: string, userId: string) {
        const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();

        // Check list ownership
        const list = await db.collection('VocabularyList').findOne({
            _id: new ObjectId(listId),
            userId
        });

        if (!list) {
            return null;
        }

        // Delete word
        const result = await db.collection('Word').deleteOne({
            _id: new ObjectId(wordId),
            vocabularyListId: new ObjectId(listId)
        });

        return result.deletedCount > 0;
    }

    /**
     * Generate contextual sentences for vocabulary list
     */
    static async generateSentences(listId: string, userId: string) {
        const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();

        const list = await db.collection('VocabularyList').findOne({
            _id: new ObjectId(listId),
            userId
        });

        if (!list) {
            return null;
        }

        const words = await db.collection('Word').find({
            vocabularyListId: new ObjectId(listId)
        }).toArray() as unknown as WordDocument[];

        if (words.length === 0) {
            throw new Error('No words in vocabulary list');
        }

        const sentences = await AIService.generateContextualSentences(
            words.map((w: WordDocument) => ({
                id: w._id.toString(),
                word: w.word,
                translation: w.translation,
                partOfSpeech: w.partOfSpeech || undefined,
                difficulty: w.difficulty
            })),
            list.targetLanguage
        );

        return sentences;
    }

    /**
     * Generate AI vocabulary list
     */
    static async generateAIList(data: {
        name: string;
        description?: string;
        targetLanguage: string;
        nativeLanguage: string;
        prompt: string;
        wordCount?: number;
    }, userId: string) {
        const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();

        // Generate vocabulary words using AIService
        const aiWords = await AIService.generateVocabularyList(
            data.prompt,
            data.targetLanguage,
            data.nativeLanguage,
            data.wordCount || 10
        );

        // Create the vocabulary list
        const now = new Date();
        const result = await db.collection('VocabularyList').insertOne({
            name: data.name,
            description: data.description,
            targetLanguage: data.targetLanguage,
            nativeLanguage: data.nativeLanguage,
            userId,
            createdAt: now,
            updatedAt: now
        });

        const listId = result.insertedId;

        // Insert words
        const wordDocs = aiWords.map((w: AIWord) => ({
            word: w.word,
            translation: w.translation,
            partOfSpeech: w.partOfSpeech || null,
            difficulty: w.difficulty || 'medium',
            vocabularyListId: listId,
            createdAt: now,
            updatedAt: now
        }));

        await db.collection('Word').insertMany(wordDocs);

        // Fetch the new list with words
        const list = await db.collection('VocabularyList').findOne({
            _id: listId,
            userId
        });

        const words = await db.collection('Word').find({ vocabularyListId: listId }).toArray();

        return { ...list, words };
    }

    /**
     * Update word progress
     */
    static async updateWordProgress(wordId: string, status: string, userId: string) {
        const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();
        const now = new Date();

        const existingProgress = await db.collection('WordProgress').findOne({
            userId,
            wordId: new ObjectId(wordId)
        });

        let newMastery = 0;
        switch (status) {
            case 'learning':
                newMastery = 0;
                break;
            case 'mastered':
                newMastery = 1.0;
                break;
            default:
                newMastery = 0;
        }

        // Calculate next review date based on mastery
        const interval = Math.min(1, Math.floor(newMastery * 7));
        const nextReview = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);
        let insertedId = existingProgress?._id.toString();
        if (existingProgress) {
            // Update existing progress
            await db.collection('WordProgress').updateOne(
                { _id: existingProgress._id },
                {
                    $set: {
                        mastery: newMastery,
                        status: status,
                        lastReviewed: now,
                        nextReview: nextReview,
                        updatedAt: now
                    },
                    $inc: { reviewCount: 1 }
                }
            );
        } else {
            // Create new progress record
            const document = await db.collection('WordProgress').insertOne({
                userId,
                wordId: new ObjectId(wordId),
                mastery: newMastery,
                status: status,
                reviewCount: 1,
                streak: 0,
                lastReviewed: now,
                nextReview: nextReview,
                createdAt: now,
                updatedAt: now
            });
            insertedId = document.insertedId.toString();
        }
        const updatedProgress = await db.collection('WordProgress').findOne({
            _id: new ObjectId(insertedId)
        });
        // Update daily learning stats
        await this.updateLearningStats(userId, { wordsReviewed: 1 });
        return updatedProgress;
    }

    /**
     * Get word progress
     */
    static async getWordProgress(wordId: string, userId: string) {
        const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();

        const progress = await db.collection('WordProgress').findOne({
            userId,
            wordId: new ObjectId(wordId)
        });

        return progress || {
            mastery: 0,
            status: 'not_started',
            reviewCount: 0,
            streak: 0
        };
    }

    /**
     * Update daily learning stats
     */
    private static async updateLearningStats(userId: string, stats: {
        quizzesTaken?: number;
        wordsReviewed?: number;
        totalQuestions?: number;
        correctAnswers?: number;
    }) {
        const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();
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
