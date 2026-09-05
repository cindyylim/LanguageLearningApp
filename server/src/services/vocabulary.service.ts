import { getDatabase } from '../utils/getDatabase';
import { LearningStatsService } from './learningStats.service';
import { ObjectId } from 'mongodb';
import { AIService } from './ai';
import { calculateFromManualStatus } from '../utils/sm2';
import { WordStatus } from "../shared/types/index";

interface AIWord {
    word: string;
    translation: string;
    pinyin?: string;
    partOfSpeech?: string;
    difficulty?: string;
}

const LIST_PREVIEW_WORD_LIMIT = 8;

export class VocabularyService {
    private static async adjustWordCount(listId: ObjectId, delta: number): Promise<void> {
        if (delta === 0) {
            return;
        }

        const db = await getDatabase();
        await db.collection('VocabularyList').updateOne(
            { _id: listId },
            {
                $inc: { wordCount: delta },
                $set: { updatedAt: new Date() },
            }
        );
    }

    /**
     * Get paginated vocabulary lists for a user with word counts.
     * Fetches one extra document to determine whether another page exists.
     */
    static async getUserLists(userId: string, page: number = 1, limit: number = 2) {
        const db = await getDatabase();
        const skip = (page - 1) * limit;

        const lists = await db.collection('VocabularyList').aggregate([
            { $match: { userId } },
            { $sort: { updatedAt: -1 } },
            { $skip: skip },
            { $limit: limit + 1 },
            {
                $lookup: {
                    from: 'Word',
                    let: { listId: '$_id' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$vocabularyListId', '$$listId'] } } },
                        { $sort: { createdAt: -1 } },
                        { $limit: LIST_PREVIEW_WORD_LIMIT },
                    ],
                    as: 'words'
                }
            },
            {
                $addFields: {
                    _count: { words: { $ifNull: ['$wordCount', 0] } }
                }
            }
        ]).toArray();

        const previewWordIds = lists.flatMap((list) =>
            ((list.words as Array<{ _id: ObjectId }>) ?? []).map((word) => word._id)
        );

        const progressRows = previewWordIds.length > 0
            ? await db.collection('WordProgress').find({
                userId,
                wordId: { $in: previewWordIds },
            }).toArray()
            : [];

        const progressByWordId = new Map(
            progressRows.map((progress) => [progress.wordId.toString(), progress])
        );

        for (const list of lists) {
            list.words = ((list.words as Array<{ _id: ObjectId }>) ?? []).map((word) => ({
                ...word,
                progress: progressByWordId.get(word._id.toString()),
            }));
        }

        const hasMore = lists.length > limit;
        return {
            lists: hasMore ? lists.slice(0, limit) : lists,
            hasMore,
        };
    }

    /**
     * Get specific vocabulary list with words and progress
     */
    static async getListById(
        listId: string,
        userId: string,
        options?: { page?: number; limit?: number }
    ) {
        const db = await getDatabase();
        const listObjectId = new ObjectId(listId);

        const list = await db.collection('VocabularyList').findOne({
            _id: listObjectId,
            userId
        });

        if (!list) {
            return null;
        }

        const totalWords = list.wordCount;
        let wordsQuery = db.collection('Word')
            .find({ vocabularyListId: listObjectId })
            .sort({ createdAt: 1 });

        if (options?.limit) {
            const page = options.page ?? 1;
            wordsQuery = wordsQuery.skip((page - 1) * options.limit).limit(options.limit);
        }

        const words = await wordsQuery.toArray();
        const wordIds = words.map((word) => word._id);
        const progressData = wordIds.length > 0
            ? await db.collection('WordProgress').find({
                userId,
                wordId: { $in: wordIds },
            }).toArray()
            : [];

        const progressByWordId = new Map(
            progressData.map((progress) => [progress.wordId.toString(), progress])
        );

        const wordsWithProgress = words.map((word) => ({
            ...word,
            progress: progressByWordId.get(word._id.toString()),
        }));

        return {
            ...list,
            words: wordsWithProgress,
            totalWords,
            hasMore: options?.limit ? ((options.page ?? 1) * options.limit) < totalWords : false,
        };
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
        const db = await getDatabase();

        const now = new Date();
        const listDoc = {            
            name: data.name,
            description: data.description,
            targetLanguage: data.targetLanguage,
            nativeLanguage: data.nativeLanguage,
            userId,
            wordCount: 0,
            createdAt: now,
            updatedAt: now
        }
        const result = await db.collection('VocabularyList').insertOne(listDoc);

        return { _id: result.insertedId, ...listDoc };
    }

    /**
     * Update vocabulary list
     */
    static async updateList(listId: string, data: {
        name: string;
        description?: string;
    }, userId: string) {
        const db = await getDatabase();

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
        const db = await getDatabase();
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

        let progressDeleteResult = { deletedCount: 0 };
        if (wordIds.length > 0) {
            progressDeleteResult = await db.collection('WordProgress').deleteMany({
                userId,
                wordId: { $in: wordIds.map(id => new ObjectId(id)) }
            });
        }

        const wordsDeleteResult = await db
            .collection('Word')
            .deleteMany({ vocabularyListId: listObjectId });

        await db.collection('VocabularyList').deleteOne({ _id: listObjectId });

        return {
            deletedWords: wordsDeleteResult.deletedCount || 0,
            deletedWordProgress: progressDeleteResult.deletedCount || 0
        };
    }

    private static async verifyWordOwnership(wordId: string, userId: string): Promise<boolean> {
        const db = await getDatabase();

        const [ownedWord] = await db.collection('Word').aggregate([
            { $match: { _id: new ObjectId(wordId) } },
            {
                $lookup: {
                    from: 'VocabularyList',
                    let: { listId: '$vocabularyListId' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$_id', '$$listId'] },
                                        { $eq: ['$userId', userId] },
                                    ],
                                },
                            },
                        },
                        { $limit: 1 },
                    ],
                    as: 'list',
                },
            },
            { $match: { 'list.0': { $exists: true } } },
            { $limit: 1 },
        ]).toArray();

        return !!ownedWord;
    }

    /**
     * Add word to vocabulary list
     */
    static async addWord(listId: string, wordData: {
        word: string;
        translation: string;
        pinyin?: string;
        partOfSpeech?: string;
        difficulty: string;
    }, userId: string) {
        const db = await getDatabase();

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
            pinyin: wordData.pinyin || null,
            partOfSpeech: wordData.partOfSpeech || null,
            difficulty: wordData.difficulty,
            vocabularyListId: new ObjectId(listId),
            createdAt: now,
            updatedAt: now
        };

        const result = await db.collection('Word').insertOne(data);
        await this.adjustWordCount(new ObjectId(listId), 1);

        return {
            _id: result.insertedId,
            ...data,
        };
    }

    /**
     * Update word in vocabulary list
     */
    static async updateWord(listId: string, wordId: string, wordData: {
        word: string;
        translation: string;
        pinyin?: string;
        partOfSpeech?: string;
        difficulty?: string;
    }, userId: string) {
        const db = await getDatabase();

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

        return {
            _id: new ObjectId(wordId),
            vocabularyListId: new ObjectId(listId),
            ...wordData,
            updatedAt: new Date(),
        };
    }

    /**
     * Delete word from vocabulary list
     */
    static async deleteWord(listId: string, wordId: string, userId: string) {
        const db = await getDatabase();

        // Check list ownership
        const list = await db.collection('VocabularyList').findOne({
            _id: new ObjectId(listId),
            userId
        });

        if (!list) {
            return null;
        }

        // Delete word and cascade delete progress
        const result = await db.collection('Word').deleteOne({
            _id: new ObjectId(wordId),
            vocabularyListId: new ObjectId(listId)
        });

        if (result.deletedCount > 0) {
            await this.adjustWordCount(new ObjectId(listId), -1);
            await db.collection('WordProgress').deleteMany({
                userId,
                wordId: new ObjectId(wordId)
            });
        }

        return result.deletedCount > 0;
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
        const db = await getDatabase();

        // Generate vocabulary words using AIService
        const aiWords = await AIService.generateVocabularyList(
            data.prompt,
            data.targetLanguage,
            data.nativeLanguage,
            data.wordCount || 10
        );
        if (aiWords.length === 0) {
            return {};
        }

        // Create the vocabulary list
        const now = new Date();
        const listDoc = {
            name: data.name,
            description: data.description,
            targetLanguage: data.targetLanguage,
            nativeLanguage: data.nativeLanguage,
            userId,
            wordCount: aiWords.length,
            createdAt: now,
            updatedAt: now
        };
        const result = await db.collection('VocabularyList').insertOne(listDoc);

        const listId = result.insertedId;

        // Insert words
        const wordDocs = aiWords.map((w: AIWord) => ({
            word: w.word,
            translation: w.translation,
            pinyin: w.pinyin || null,
            partOfSpeech: w.partOfSpeech || null,
            difficulty: w.difficulty || 'medium',
            vocabularyListId: listId,
            createdAt: now,
            updatedAt: now
        }));

        const insertedWords = await db.collection('Word').insertMany(wordDocs);
        const words = wordDocs.map((doc, index) => ({
            _id: insertedWords.insertedIds[index],
            ...doc,
        }));

        return { ...listDoc, _id: listId, words };
    }

    /**
     * Update word progress
     */
    static async updateWordProgress(wordId: string, status: WordStatus, userId: string) {
        const db = await getDatabase();
        const now = new Date();

        if (!(await this.verifyWordOwnership(wordId, userId))) {
            return null;
        }

        const existingProgress = await db.collection('WordProgress').findOne({
            userId,
            wordId: new ObjectId(wordId)
        });

        const sm2Result = calculateFromManualStatus(status, {
            repetition: existingProgress?.streak ?? 0,
            easeFactor: existingProgress?.easeFactor ?? 2.5,
            interval: existingProgress?.interval ?? 1,
            now
        });

        const previousStatus = existingProgress?.status ?? 'new';
        if (previousStatus === sm2Result.status) {
            return existingProgress ?? {
                status: 'new',
                reviewCount: 0,
                streak: 0
            };
        }

        let insertedId = existingProgress?._id.toString();
        if (existingProgress) {
            // Update existing progress
            await db.collection('WordProgress').updateOne(
                { _id: existingProgress._id },
                {
                    $set: {
                        status: sm2Result.status,
                        streak: sm2Result.repetition,
                        easeFactor: sm2Result.easeFactor,
                        interval: sm2Result.interval,
                        lastReviewed: now,
                        nextReview: sm2Result.nextReview,
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
                status: sm2Result.status,
                reviewCount: 1,
                streak: sm2Result.repetition,
                easeFactor: sm2Result.easeFactor,
                interval: sm2Result.interval,
                lastReviewed: now,
                nextReview: sm2Result.nextReview,
                createdAt: now,
                updatedAt: now
            });
            insertedId = document.insertedId.toString();
        }
        const updatedProgress = await db.collection('WordProgress').findOne({
            _id: new ObjectId(insertedId)
        });
        await LearningStatsService.updateDailyStats(userId, { wordsReviewed: 1 });
        return updatedProgress;
    }

    /**
     * Get word progress
     */
    static async getWordProgress(wordId: string, userId: string) {
        const db = await getDatabase();

        if (!(await this.verifyWordOwnership(wordId, userId))) {
            return null;
        }

        const progress = await db.collection('WordProgress').findOne({
            userId,
            wordId: new ObjectId(wordId)
        });

        return progress || {
            status: 'new',
            reviewCount: 0,
            streak: 0
        };
    }
}
