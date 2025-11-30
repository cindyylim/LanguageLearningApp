import { connectToDatabase } from '../utils/mongo';
import { ObjectId } from 'mongodb';
import { AIService } from './ai';
import { Word } from '../interface/Word';

interface WordDocument {
    _id: ObjectId;
    word: string;
    translation: string;
    partOfSpeech?: string | null;
    difficulty: string;
    vocabularyListId: ObjectId;
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
    static async getUserLists(userId: string) {
        const db = await connectToDatabase();

        const lists = await db.collection('VocabularyList').aggregate([
            { $match: { userId } },
            {
                $lookup: {
                    from: 'Word',
                    localField: '_id',
                    foreignField: 'vocabularyListId',
                    as: 'words'
                }
            },
            {
                $unwind: {
                    path: '$words',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: 'WordProgress',
                    let: { wordIdStr: { $toString: '$words._id' } },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$wordId', '$$wordIdStr'] },
                                        { $eq: ['$userId', userId] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: 'wordProgress'
                }
            },
            {
                $addFields: {
                    'words.progress': { $arrayElemAt: ['$wordProgress', 0] }
                }
            },
            {
                $group: {
                    _id: '$_id',
                    name: { $first: '$name' },
                    description: { $first: '$description' },
                    targetLanguage: { $first: '$targetLanguage' },
                    nativeLanguage: { $first: '$nativeLanguage' },
                    userId: { $first: '$userId' },
                    createdAt: { $first: '$createdAt' },
                    updatedAt: { $first: '$updatedAt' },
                    words: { $push: '$words' }
                }
            },
            {
                $addFields: {
                    words: {
                        $filter: {
                            input: '$words',
                            as: 'w',
                            cond: { $ifNull: ['$$w._id', false] }
                        }
                    }
                }
            },
            {
                $addFields: {
                    _count: { words: { $size: '$words' } }
                }
            },
            { $sort: { updatedAt: -1 } }
        ]).toArray();

        return lists;
    }

    /**
     * Get specific vocabulary list with words and progress
     */
    static async getListById(listId: string, userId: string) {
        const db = await connectToDatabase();

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
            wordId: { $in: wordIds }
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
        const db = await connectToDatabase();

        // Get user's language preferences if not provided
        let userTargetLanguage = data.targetLanguage;
        let userNativeLanguage = data.nativeLanguage;

        if (!userTargetLanguage || !userNativeLanguage) {
            const user = await db.collection('User').findOne({ _id: new ObjectId(userId) });
            if (user) {
                userTargetLanguage = userTargetLanguage || user.targetLanguage;
                userNativeLanguage = userNativeLanguage || user.nativeLanguage;
            }
        }

        const now = new Date();
        const result = await db.collection('VocabularyList').insertOne({
            name: data.name,
            description: data.description,
            targetLanguage: userTargetLanguage,
            nativeLanguage: userNativeLanguage,
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
        const db = await connectToDatabase();

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
        const db = await connectToDatabase();
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
                wordId: { $in: wordIds }
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
        const db = await connectToDatabase();

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
        const db = await connectToDatabase();

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
        const db = await connectToDatabase();

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
        const db = await connectToDatabase();

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
            list.targetLanguage,
            list.nativeLanguage
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
        const db = await connectToDatabase();

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
    static async updateWordProgress(wordId: string, progressData: {
        mastery?: number;
        status?: string;
    }, userId: string) {
        const db = await connectToDatabase();
        const now = new Date();

        const word = await db.collection('Word').aggregate([
            { $match: { _id: new ObjectId(wordId) } },
            {
                $lookup: {
                    from: 'VocabularyList',
                    localField: 'vocabularyListId',
                    foreignField: '_id',
                    as: 'list'
                }
            },
            { $match: { 'list.userId': userId } }
        ]).toArray();

        if (!word || word.length === 0) {
            return null;
        }

        const existingProgress = await db.collection('WordProgress').findOne({
            userId,
            wordId: wordId
        });

        let newMastery = progressData.mastery || 0;
        let newStatus = progressData.status || 'learning';

        // Auto-calculate mastery based on status if not provided
        if (!progressData.mastery && progressData.status) {
            switch (progressData.status) {
                case 'learning':
                    newMastery = 0;
                    break;
                case 'mastered':
                    newMastery = 1.0;
                    break;
                default:
                    newMastery = 0;
            }
        }

        // Calculate next review date based on mastery
        const interval = Math.min(1, Math.floor(newMastery * 7));
        const nextReview = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);

        if (existingProgress) {
            // Update existing progress
            await db.collection('WordProgress').updateOne(
                { _id: existingProgress._id },
                {
                    $set: {
                        mastery: newMastery,
                        status: newStatus,
                        lastReviewed: now,
                        nextReview: nextReview,
                        updatedAt: now
                    },
                    $inc: { reviewCount: 1 }
                }
            );
        } else {
            // Create new progress record
            await db.collection('WordProgress').insertOne({
                userId,
                wordId: wordId,
                mastery: newMastery,
                status: newStatus,
                reviewCount: 1,
                streak: 0,
                lastReviewed: now,
                nextReview: nextReview,
                createdAt: now,
                updatedAt: now
            });
        }

        const updatedProgress = await db.collection('WordProgress').findOne({
            userId,
            wordId: wordId
        });

        // Update daily learning stats
        await this.updateLearningStats(userId, { wordsReviewed: 1 });

        return updatedProgress;
    }

    /**
     * Get word progress
     */
    static async getWordProgress(wordId: string, userId: string) {
        const db = await connectToDatabase();

        const progress = await db.collection('WordProgress').findOne({
            userId,
            wordId: wordId
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
        const db = await connectToDatabase();
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
