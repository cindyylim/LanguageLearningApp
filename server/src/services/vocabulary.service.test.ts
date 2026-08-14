import { VocabularyService } from './vocabulary.service';
import { LearningStatsService } from './learningStats.service';
import { WordStatus } from '../shared/types/index';
import { connectToTestDatabase } from '../utils/testMongo';
import { ObjectId } from 'mongodb';

// Mock mongo utility
jest.mock('../utils/testMongo');

// Mock AI service
jest.mock('./ai', () => ({
    AIService: {
        generateContextualSentences: jest.fn(),
        generateVocabularyList: jest.fn(),
    }
}));

describe('VocabularyService', () => {
    let mockDb: any;
    let mockCollection: any;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Setup mock chain
        const mockProjectReturn = {
            toArray: jest.fn(),
        };

        const mockFindReturn = {
            toArray: jest.fn(),
            project: jest.fn().mockReturnValue(mockProjectReturn),
        };

        mockCollection = {
            aggregate: jest.fn().mockReturnThis(),
            toArray: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn().mockReturnValue(mockFindReturn),
            insertOne: jest.fn(),
            updateOne: jest.fn(),
            findOneAndUpdate: jest.fn(),
            deleteOne: jest.fn(),
            deleteMany: jest.fn(),
            project: jest.fn().mockReturnThis(),
            insertMany: jest.fn(),
        };

        mockDb = {
            collection: jest.fn().mockReturnValue(mockCollection),
        };

        (connectToTestDatabase as jest.Mock).mockResolvedValue(mockDb);
    });

    describe('getUserLists', () => {
        it('should return user lists with word counts', async () => {
            const userId = 'user123';
            const mockLists = [
                {
                    _id: new ObjectId(),
                    name: 'List 1',
                    userId: userId,
                    _count: { words: 5 }
                },
                {
                    _id: new ObjectId(),
                    name: 'List 2',
                    userId: userId,
                    _count: { words: 10 }
                }
            ];

            mockCollection.toArray.mockResolvedValue(mockLists);

            const result = await VocabularyService.getUserLists(userId);

            expect(connectToTestDatabase).toHaveBeenCalled();
            expect(mockDb.collection).toHaveBeenCalledWith('VocabularyList');
            expect(mockCollection.aggregate).toHaveBeenCalled();
            expect(result).toEqual({ lists: mockLists, hasMore: false });

            // Verify aggregation pipeline structure
            const pipeline = mockCollection.aggregate.mock.calls[0][0];
            expect(pipeline[0]).toEqual({ $match: { userId } });
            expect(pipeline[1]).toEqual({ $sort: { updatedAt: -1 } });
        });

        it('should handle pagination', async () => {
            const userId = 'user123';
            const page = 2;
            const limit = 10;

            mockCollection.toArray.mockResolvedValue([]);

            await VocabularyService.getUserLists(userId, page, limit);

            const pipeline = mockCollection.aggregate.mock.calls[0][0];
            // Skip should be (page-1) * limit = 10; fetch one extra to compute hasMore
            expect(pipeline[2]).toEqual({ $skip: 10 });
            expect(pipeline[3]).toEqual({ $limit: 11 });
        });

        it('should set hasMore true when more than one page of lists exists', async () => {
            const userId = 'user123';
            const limit = 20;
            const extraPage = Array.from({ length: limit + 1 }, (_, i) => ({
                _id: new ObjectId(),
                name: `List ${i + 1}`,
                userId,
            }));

            mockCollection.toArray.mockResolvedValue(extraPage);

            const result = await VocabularyService.getUserLists(userId, 1, limit);

            expect(result.hasMore).toBe(true);
            expect(result.lists).toHaveLength(limit);
        });

        it('should set hasMore false when the last page has exactly `limit` lists', async () => {
            const userId = 'user123';
            const limit = 20;
            const exactPage = Array.from({ length: limit }, (_, i) => ({
                _id: new ObjectId(),
                name: `List ${i + 1}`,
                userId,
            }));

            mockCollection.toArray.mockResolvedValue(exactPage);

            const result = await VocabularyService.getUserLists(userId, 1, limit);

            expect(result.hasMore).toBe(false);
            expect(result.lists).toHaveLength(limit);
        });
    });

    describe('createList', () => {
        it('should create a new vocabulary list', async () => {
            const userId = 'user123';
            const listData = {
                name: 'New List',
                description: 'Test Description',
                targetLanguage: 'es',
                nativeLanguage: 'en'
            };

            const insertedId = new ObjectId();
            mockCollection.insertOne.mockResolvedValue({ insertedId });

            const expectedList = {
                _id: insertedId,
                ...listData,
                userId,
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date)
            };

            mockCollection.findOne.mockResolvedValue(expectedList);

            const result = await VocabularyService.createList(listData, userId);

            expect(mockCollection.insertOne).toHaveBeenCalledWith(expect.objectContaining({
                ...listData,
                userId
            }));
            expect(result).toEqual(expectedList);
        });
    });

    describe('getListById', () => {
        it('should return list with words and progress', async () => {
            const listId = '507f1f77bcf86cd799439011';
            const userId = 'user123';

            const mockList = {
                _id: new ObjectId(listId),
                name: 'Test List',
                userId,
                targetLanguage: 'fr',
                nativeLanguage: 'en'
            };

            const listObjectId = new ObjectId(listId);
            const mockWords = [
                {
                    _id: new ObjectId('507f1f77bcf86cd799439012'),
                    word: 'bonjour',
                    translation: 'hello',
                    partOfSpeech: 'noun',
                    difficulty: 'easy',
                    vocabularyListId: listObjectId,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            ];

            const mockProgress = [
                {
                    _id: new ObjectId('507f1f77bcf86cd799439013'),
                    wordId: '507f1f77bcf86cd799439012',
                    userId,
                    status: 'learning',
                    reviewCount: 5,
                    streak: 2,
                    lastReviewed: new Date().toISOString(),
                    nextReview: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }
            ];

            // Set up mocks for different collections
            mockDb.collection
                .mockReturnValueOnce(mockCollection) // For VocabularyList
                .mockReturnValueOnce(mockCollection) // For Word
                .mockReturnValueOnce(mockCollection); // For WordProgress

            mockCollection.findOne.mockResolvedValueOnce(mockList);

            // Create separate mocks for the find() calls on different collections
            const mockWordFind = {
                toArray: jest.fn().mockResolvedValue(mockWords)
            };
            const mockProgressFind = {
                toArray: jest.fn().mockResolvedValue(mockProgress)
            };

            mockCollection.find
                .mockReturnValueOnce(mockWordFind) // For Word collection
                .mockReturnValueOnce(mockProgressFind); // For WordProgress collection

            const result = await VocabularyService.getListById(listId, userId);

            expect(mockDb.collection).toHaveBeenCalledWith('VocabularyList');
            expect(mockCollection.findOne).toHaveBeenCalledWith({
                _id: new ObjectId(listId),
                userId
            });
            expect(result).toEqual({
                ...mockList,
                words: [
                    {
                        _id: '507f1f77bcf86cd799439012',
                        word: 'bonjour',
                        translation: 'hello',
                        partOfSpeech: 'noun',
                        difficulty: 'easy',
                        vocabularyListId: listId,
                        createdAt: expect.any(String),
                        updatedAt: expect.any(String),
                        progress: {
                            wordId: '507f1f77bcf86cd799439012',
                            userId,
                            status: 'learning',
                            reviewCount: 5,
                            streak: 2,
                            lastReviewed: expect.any(String),
                            nextReview: expect.any(String),
                            createdAt: expect.any(String),
                            updatedAt: expect.any(String)
                        }
                    }
                ]
            });
        });

        it('should return null if list does not exist', async () => {
            const listId = '507f1f77bcf86cd799439011';
            const userId = 'user123';

            mockCollection.findOne.mockResolvedValue(null);

            const result = await VocabularyService.getListById(listId, userId);

            expect(result).toBeNull();
        });
    });

    describe('updateList', () => {
        it('should update list successfully', async () => {
            const listId = '507f1f77bcf86cd799439011';
            const userId = 'user123';
            const updateData = {
                name: 'Updated List',
                description: 'Updated description'
            };

            mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

            const result = await VocabularyService.updateList(listId, updateData, userId);

            expect(mockDb.collection).toHaveBeenCalledWith('VocabularyList');
            expect(mockCollection.updateOne).toHaveBeenCalledWith(
                { _id: new ObjectId(listId), userId },
                {
                    $set: {
                        name: updateData.name,
                        description: updateData.description,
                        updatedAt: expect.any(Date)
                    }
                }
            );
            expect(result).toBe(true);
        });

        it('should return false if list does not exist', async () => {
            const listId = '507f1f77bcf86cd799439011';
            const userId = 'user123';
            const updateData = {
                name: 'Updated List',
                description: 'Updated description'
            };

            mockCollection.updateOne.mockResolvedValue({ matchedCount: 0 });

            const result = await VocabularyService.updateList(listId, updateData, userId);

            expect(result).toBe(false);
        });
    });

    describe('deleteList', () => {
        it('should delete list and delete words and progress', async () => {
            const listId = '507f1f77bcf86cd799439011';
            const userId = 'user123';

            const mockList = {
                _id: new ObjectId(listId),
                name: 'Test List',
                userId
            };

            const mockWords = [
                { _id: new ObjectId('507f1f77bcf86cd799439012') },
                { _id: new ObjectId('507f1f77bcf86cd799439013') }
            ];

            mockCollection.findOne.mockResolvedValueOnce(mockList);
            const mockFindReturn = mockCollection.find();
            const mockProjectReturn = mockFindReturn.project();
            mockProjectReturn.toArray.mockResolvedValue(mockWords);
            mockCollection.deleteMany
                .mockResolvedValueOnce({ deletedCount: 2 })
                .mockResolvedValueOnce({ deletedCount: 2 });
            mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });

            const result = await VocabularyService.deleteList(listId, userId);

            expect(mockDb.collection).toHaveBeenCalledWith('VocabularyList');
            expect(mockCollection.findOne).toHaveBeenCalledWith({
                _id: new ObjectId(listId),
                userId
            });
            expect(mockCollection.deleteMany).toHaveBeenCalled();
            expect(mockCollection.deleteOne).toHaveBeenCalledWith({
                _id: new ObjectId(listId)
            });
            expect(result).toEqual({
                deletedWords: 2,
                deletedWordProgress: 2
            });
        });

        it('should return null if list does not exist', async () => {
            const listId = '507f1f77bcf86cd799439011';
            const userId = 'user123';

            mockCollection.findOne.mockResolvedValue(null);

            const result = await VocabularyService.deleteList(listId, userId);

            expect(result).toBeNull();
        });
    });

    describe('addWord', () => {
        it('should add word to list successfully', async () => {
            const listId = '507f1f77bcf86cd799439011';
            const userId = 'user123';
            const wordData = {
                word: 'bonjour',
                translation: 'hello',
                partOfSpeech: 'noun',
                difficulty: 'easy'
            };

            const mockList = {
                _id: new ObjectId(listId),
                name: 'Test List',
                userId
            };

            const insertedId = new ObjectId('507f1f77bcf86cd799439014');
            const mockNewWord = {
                _id: insertedId,
                ...wordData,
                vocabularyListId: new ObjectId(listId),
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date)
            };

            mockCollection.findOne.mockResolvedValueOnce(mockList);
            mockCollection.insertOne.mockResolvedValue({ insertedId });
            mockCollection.findOne.mockResolvedValueOnce(mockNewWord);

            const result = await VocabularyService.addWord(listId, wordData, userId);

            expect(mockDb.collection).toHaveBeenCalledWith('VocabularyList');
            expect(mockCollection.findOne).toHaveBeenCalledWith({
                _id: new ObjectId(listId),
                userId
            });
            expect(mockCollection.insertOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    word: wordData.word,
                    translation: wordData.translation,
                    partOfSpeech: wordData.partOfSpeech,
                    difficulty: wordData.difficulty,
                    vocabularyListId: new ObjectId(listId),
                    createdAt: expect.any(Date),
                    updatedAt: expect.any(Date)
                })
            );
            expect(result).toEqual(mockNewWord);
        });

        it('should return null if list does not exist', async () => {
            const listId = '507f1f77bcf86cd799439011';
            const userId = 'user123';
            const wordData = {
                word: 'bonjour',
                translation: 'hello',
                partOfSpeech: 'noun',
                difficulty: 'easy'
            };

            mockCollection.findOne.mockResolvedValue(null);

            const result = await VocabularyService.addWord(listId, wordData, userId);

            expect(result).toBeNull();
        });
    });

    describe('updateWord', () => {
        it('should update word successfully', async () => {
            const listId = '507f1f77bcf86cd799439011';
            const wordId = '507f1f77bcf86cd799439012';
            const userId = 'user123';
            const wordData = {
                word: 'hola',
                translation: 'hello',
                partOfSpeech: 'interjection'
            };

            const mockList = {
                _id: new ObjectId(listId),
                name: 'Test List',
                userId
            };

            const mockUpdatedWord = {
                _id: new ObjectId(wordId),
                ...wordData,
                vocabularyListId: new ObjectId(listId),
                updatedAt: expect.any(Date)
            };

            mockCollection.findOne.mockResolvedValueOnce(mockList);
            mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });
            mockCollection.findOne.mockResolvedValueOnce(mockUpdatedWord);

            const result = await VocabularyService.updateWord(listId, wordId, wordData, userId);

            expect(mockDb.collection).toHaveBeenCalledWith('VocabularyList');
            expect(mockCollection.findOne).toHaveBeenCalledWith({
                _id: new ObjectId(listId),
                userId
            });
            expect(mockCollection.updateOne).toHaveBeenCalledWith(
                { _id: new ObjectId(wordId), vocabularyListId: new ObjectId(listId) },
                {
                    $set: {
                        ...wordData,
                        updatedAt: expect.any(Date)
                    }
                }
            );
            expect(result).toEqual(mockUpdatedWord);
        });

        it('should return null if list does not exist', async () => {
            const listId = '507f1f77bcf86cd799439011';
            const wordId = '507f1f77bcf86cd799439012';
            const userId = 'user123';
            const wordData = {
                word: 'hola',
                translation: 'hello'
            };

            mockCollection.findOne.mockResolvedValue(null);

            const result = await VocabularyService.updateWord(listId, wordId, wordData, userId);

            expect(result).toBeNull();
        });

        it('should return null if word does not exist', async () => {
            const listId = '507f1f77bcf86cd799439011';
            const wordId = '507f1f77bcf86cd799439012';
            const userId = 'user123';
            const wordData = {
                word: 'hola',
                translation: 'hello'
            };

            const mockList = {
                _id: new ObjectId(listId),
                name: 'Test List',
                userId
            };

            mockCollection.findOne.mockResolvedValueOnce(mockList);
            mockCollection.updateOne.mockResolvedValue({ matchedCount: 0 });

            const result = await VocabularyService.updateWord(listId, wordId, wordData, userId);

            expect(result).toBeNull();
        });
    });

    describe('deleteWord', () => {
        it('should delete word successfully', async () => {
            const listId = '507f1f77bcf86cd799439011';
            const wordId = '507f1f77bcf86cd799439012';
            const userId = 'user123';

            const mockList = {
                _id: new ObjectId(listId),
                name: 'Test List',
                userId
            };

            mockCollection.findOne.mockResolvedValue(mockList);
            mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });
            mockCollection.deleteMany.mockResolvedValue({ deletedCount: 1 });

            const result = await VocabularyService.deleteWord(listId, wordId, userId);

            expect(mockDb.collection).toHaveBeenCalledWith('VocabularyList');
            expect(mockCollection.findOne).toHaveBeenCalledWith({
                _id: new ObjectId(listId),
                userId
            });
            expect(mockCollection.deleteOne).toHaveBeenCalledWith({
                _id: new ObjectId(wordId),
                vocabularyListId: new ObjectId(listId)
            });
            expect(mockCollection.deleteMany).toHaveBeenCalledWith({
                userId,
                wordId: new ObjectId(wordId)
            });
            expect(result).toBe(true);
        });

        it('should return null if list does not exist', async () => {
            const listId = '507f1f77bcf86cd799439011';
            const wordId = '507f1f77bcf86cd799439012';
            const userId = 'user123';

            mockCollection.findOne.mockResolvedValue(null);

            const result = await VocabularyService.deleteWord(listId, wordId, userId);

            expect(result).toBeNull();
        });

        it('should return false if word does not exist', async () => {
            const listId = '507f1f77bcf86cd799439011';
            const wordId = '507f1f77bcf86cd799439012';
            const userId = 'user123';

            const mockList = {
                _id: new ObjectId(listId),
                name: 'Test List',
                userId
            };

            mockCollection.findOne.mockResolvedValue(mockList);
            mockCollection.deleteOne.mockResolvedValue({ deletedCount: 0 });

            const result = await VocabularyService.deleteWord(listId, wordId, userId);

            expect(result).toBe(false);
        });
    });

    describe('generateSentences', () => {
        it('should generate sentences for vocabulary list', async () => {
            const listId = '507f1f77bcf86cd799439011';
            const userId = 'user123';

            const mockList = {
                _id: new ObjectId(listId),
                name: 'Test List',
                userId,
                targetLanguage: 'fr'
            };

            const listObjectId = new ObjectId(listId);
            const mockWords = [
                {
                    _id: new ObjectId('507f1f77bcf86cd799439012'),
                    word: 'bonjour',
                    translation: 'hello',
                    partOfSpeech: 'noun',
                    difficulty: 'easy',
                    vocabularyListId: listObjectId
                }
            ];

            const mockSentences = [
                { word: 'bonjour', sentence: 'Bonjour, comment allez-vous?' }
            ];

            mockCollection.findOne.mockResolvedValueOnce(mockList);
            const mockFindReturn = mockCollection.find();
            mockFindReturn.toArray.mockResolvedValue(mockWords);

            // Get mocked AI service
            const { AIService } = require('./ai');

            // Configure mock for this test
            AIService.generateContextualSentences.mockResolvedValue(mockSentences);

            const result = await VocabularyService.generateSentences(listId, userId);

            expect(mockDb.collection).toHaveBeenCalledWith('VocabularyList');
            expect(mockCollection.findOne).toHaveBeenCalledWith({
                _id: new ObjectId(listId),
                userId
            });
            expect(AIService.generateContextualSentences).toHaveBeenCalledWith(
                [
                    {
                        _id: '507f1f77bcf86cd799439012',
                        word: 'bonjour',
                        translation: 'hello',
                        partOfSpeech: 'noun',
                        difficulty: 'easy'
                    }
                ],
                'fr'
            );
            expect(result).toEqual(mockSentences);
        });

        it('should return null if list does not exist', async () => {
            const listId = '507f1f77bcf86cd799439011';
            const userId = 'user123';

            mockCollection.findOne.mockResolvedValue(null);

            const result = await VocabularyService.generateSentences(listId, userId);

            expect(result).toBeNull();
        });

        it('should throw error if no words in list', async () => {
            const listId = '507f1f77bcf86cd799439011';
            const userId = 'user123';

            const mockList = {
                _id: new ObjectId(listId),
                name: 'Test List',
                userId
            };

            mockCollection.findOne.mockResolvedValueOnce(mockList);
            const mockFindReturn = mockCollection.find();
            mockFindReturn.toArray.mockResolvedValue([]);

            await expect(VocabularyService.generateSentences(listId, userId))
                .rejects.toThrow('No words in vocabulary list');
        });
    });

    describe('generateAIList', () => {
        it('should generate AI vocabulary list', async () => {
            const userId = 'user123';
            const listData = {
                name: 'AI Generated List',
                description: 'Generated by AI',
                targetLanguage: 'fr',
                nativeLanguage: 'en',
                prompt: 'Basic French greetings',
                wordCount: 5
            };

            const mockAIWords = [
                { word: 'bonjour', translation: 'hello', difficulty: 'easy' },
                { word: 'merci', translation: 'thank you', difficulty: 'easy' }
            ];

            const insertedId = new ObjectId('507f1f77bcf86cd799439014');
            const mockList = {
                _id: insertedId,
                ...listData,
                userId,
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date)
            };

            const mockWords = [
                {
                    _id: new ObjectId('507f1f77bcf86cd799439015'),
                    word: 'bonjour',
                    translation: 'hello',
                    vocabularyListId: insertedId
                },
                {
                    _id: new ObjectId('507f1f77bcf86cd799439016'),
                    word: 'merci',
                    translation: 'thank you',
                    vocabularyListId: insertedId
                }
            ];

            mockCollection.insertOne.mockResolvedValueOnce({ insertedId });
            mockCollection.findOne.mockResolvedValueOnce(mockList);
            mockCollection.insertMany.mockResolvedValue({});
            const mockFindReturn = mockCollection.find();
            mockFindReturn.toArray.mockResolvedValue(mockWords);

            // Get mocked AI service
            const { AIService } = require('./ai');

            // Configure mock for this test
            AIService.generateVocabularyList.mockResolvedValue(mockAIWords);

            const result = await VocabularyService.generateAIList(listData, userId);

            expect(mockDb.collection).toHaveBeenCalledWith('VocabularyList');
            expect(mockCollection.insertOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: listData.name,
                    description: listData.description,
                    targetLanguage: listData.targetLanguage,
                    nativeLanguage: listData.nativeLanguage,
                    userId,
                    createdAt: expect.any(Date),
                    updatedAt: expect.any(Date)
                })
            );
            expect(AIService.generateVocabularyList).toHaveBeenCalledWith(
                listData.prompt,
                listData.targetLanguage,
                listData.nativeLanguage,
                listData.wordCount
            );
            expect(mockCollection.insertMany).toHaveBeenCalled();
            expect(result).toEqual({
                ...mockList,
                words: mockWords
            });
        });
    });

    describe('updateWordProgress', () => {
        it('should update existing word progress with SM-2 algorithm', async () => {
            const wordId = '507f1f77bcf86cd799439012';
            const userId = 'user123';
            const status = WordStatus.LEARNING; // maps to q=2

            const mockExistingProgress = {
                _id: new ObjectId('507f1f77bcf86cd799439013'),
                wordId,
                userId,
                status: 'new',
                reviewCount: 0,
                streak: 0,
                easeFactor: 2.5,
                interval: 1
            };

            const mockUpdatedProgress = {
                ...mockExistingProgress,
                status: 'learning',
                reviewCount: 1,
                streak: 0, // q=2 resets repetition
                easeFactor: expect.any(Number),
                interval: 1, // q<3 resets interval
                lastReviewed: expect.any(Date),
                nextReview: expect.any(Date),
                updatedAt: expect.any(Date)
            };

            mockCollection.findOne.mockResolvedValueOnce({ _id: new ObjectId(wordId), vocabularyListId: new ObjectId('507f1f77bcf86cd799439011') });
            mockCollection.findOne.mockResolvedValueOnce({ _id: new ObjectId('507f1f77bcf86cd799439011'), userId });
            mockCollection.findOne.mockResolvedValueOnce(mockExistingProgress);
            mockCollection.updateOne.mockResolvedValue({});
            mockCollection.findOne.mockResolvedValueOnce(mockUpdatedProgress);

            const result = await VocabularyService.updateWordProgress(wordId, WordStatus.LEARNING, userId);

            expect(mockDb.collection).toHaveBeenCalledWith('WordProgress');
            expect(mockCollection.findOne).toHaveBeenCalledWith({
                userId,
                wordId: new ObjectId(wordId)
            });
            expect(mockCollection.updateOne).toHaveBeenCalledWith(
                { _id: mockExistingProgress._id },
                {
                    $set: {
                        status: 'learning',
                        streak: 0, // SM-2: q=2 resets repetition
                        easeFactor: expect.any(Number),
                        interval: 1, // SM-2: q<3 resets interval
                        lastReviewed: expect.any(Date),
                        nextReview: expect.any(Date),
                        updatedAt: expect.any(Date)
                    },
                    $inc: { reviewCount: 1 }
                }
            );
            expect(result).toEqual(mockUpdatedProgress);
        });

        it('should create new word progress with SM-2 defaults', async () => {
            const wordId = '507f1f77bcf86cd799439012';
            const userId = 'user123';
            const status = WordStatus.MASTERED; // maps to q=5

            const mockNewProgress = {
                _id: new ObjectId('507f1f77bcf86cd799439013'),
                wordId,
                userId,
                status: 'mastered',
                reviewCount: 1,
                streak: 6,
                easeFactor: expect.any(Number),
                interval: expect.any(Number),
                lastReviewed: expect.any(Date),
                nextReview: expect.any(Date),
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date)
            };

            mockCollection.findOne.mockResolvedValueOnce({ _id: new ObjectId(wordId), vocabularyListId: new ObjectId('507f1f77bcf86cd799439011') });
            mockCollection.findOne.mockResolvedValueOnce({ _id: new ObjectId('507f1f77bcf86cd799439011'), userId });
            mockCollection.findOne.mockResolvedValueOnce(null);
            mockCollection.insertOne.mockResolvedValue({ insertedId: mockNewProgress._id });
            mockCollection.findOne.mockResolvedValueOnce(mockNewProgress);

            const result = await VocabularyService.updateWordProgress(wordId, WordStatus.MASTERED, userId);

            expect(mockCollection.insertOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId,
                    wordId: new ObjectId(wordId),
                    status: 'mastered',
                    reviewCount: 1,
                    streak: expect.any(Number),
                    easeFactor: expect.any(Number),
                    interval: expect.any(Number),
                    createdAt: expect.any(Date),
                    updatedAt: expect.any(Date)
                })
            );
            expect(mockCollection.insertOne.mock.calls[0][0].streak).toBeGreaterThanOrEqual(5);
            expect(result).toEqual(mockNewProgress);
        });

        it('should return null when word does not exist', async () => {
            const wordId = '507f1f77bcf86cd799439012';
            const userId = 'user123';

            mockCollection.findOne.mockResolvedValueOnce(null);

            const result = await VocabularyService.updateWordProgress(wordId, WordStatus.LEARNING, userId);

            expect(result).toBeNull();
            expect(mockCollection.updateOne).not.toHaveBeenCalled();
            expect(mockCollection.insertOne).not.toHaveBeenCalled();
        });

        it('should return null when word belongs to another user', async () => {
            const wordId = '507f1f77bcf86cd799439012';
            const userId = 'user123';

            mockCollection.findOne.mockResolvedValueOnce({
                _id: new ObjectId(wordId),
                vocabularyListId: new ObjectId('507f1f77bcf86cd799439011')
            });
            mockCollection.findOne.mockResolvedValueOnce(null);

            const result = await VocabularyService.updateWordProgress(wordId, WordStatus.LEARNING, userId);

            expect(result).toBeNull();
            expect(mockCollection.updateOne).not.toHaveBeenCalled();
            expect(mockCollection.insertOne).not.toHaveBeenCalled();
        });

        it('should not update stats when status is unchanged', async () => {
            const wordId = '507f1f77bcf86cd799439012';
            const userId = 'user123';

            const mockExistingProgress = {
                _id: new ObjectId('507f1f77bcf86cd799439013'),
                wordId,
                userId,
                status: 'learning',
                reviewCount: 3,
                streak: 1,
                easeFactor: 2.5,
                interval: 1
            };

            mockCollection.findOne.mockResolvedValueOnce({
                _id: new ObjectId(wordId),
                vocabularyListId: new ObjectId('507f1f77bcf86cd799439011')
            });
            mockCollection.findOne.mockResolvedValueOnce({
                _id: new ObjectId('507f1f77bcf86cd799439011'),
                userId
            });
            mockCollection.findOne.mockResolvedValueOnce(mockExistingProgress);

            const updateDailyStatsSpy = jest.spyOn(LearningStatsService, 'updateDailyStats');

            const result = await VocabularyService.updateWordProgress(wordId, WordStatus.LEARNING, userId);

            expect(result).toEqual(mockExistingProgress);
            expect(mockCollection.updateOne).not.toHaveBeenCalled();
            expect(mockCollection.insertOne).not.toHaveBeenCalled();
            expect(updateDailyStatsSpy).not.toHaveBeenCalled();

            updateDailyStatsSpy.mockRestore();
        });
    });

    describe('getWordProgress', () => {
        it('should return existing word progress', async () => {
            const wordId = '507f1f77bcf86cd799439012';
            const userId = 'user123';

            const mockProgress = {
                _id: new ObjectId('507f1f77bcf86cd799439013'),
                wordId,
                userId,
                status: 'learning',
                reviewCount: 5,
                streak: 2
            };

            mockCollection.findOne.mockResolvedValueOnce({
                _id: new ObjectId(wordId),
                vocabularyListId: new ObjectId('507f1f77bcf86cd799439011')
            });
            mockCollection.findOne.mockResolvedValueOnce({
                _id: new ObjectId('507f1f77bcf86cd799439011'),
                userId
            });
            mockCollection.findOne.mockResolvedValueOnce(mockProgress);

            const result = await VocabularyService.getWordProgress(wordId, userId);

            expect(mockDb.collection).toHaveBeenCalledWith('WordProgress');
            expect(mockCollection.findOne).toHaveBeenCalledWith({
                userId,
                wordId: new ObjectId(wordId)
            });
            expect(result).toEqual(mockProgress);
        });

        it('should return default progress when none exists', async () => {
            const wordId = '507f1f77bcf86cd799439012';
            const userId = 'user123';

            mockCollection.findOne.mockResolvedValueOnce({
                _id: new ObjectId(wordId),
                vocabularyListId: new ObjectId('507f1f77bcf86cd799439011')
            });
            mockCollection.findOne.mockResolvedValueOnce({
                _id: new ObjectId('507f1f77bcf86cd799439011'),
                userId
            });
            mockCollection.findOne.mockResolvedValueOnce(null);

            const result = await VocabularyService.getWordProgress(wordId, userId);

            expect(result).toEqual({
                status: 'new',
                reviewCount: 0,
                streak: 0
            });
        });

        it('should return null when word belongs to another user', async () => {
            const wordId = '507f1f77bcf86cd799439012';
            const userId = 'user123';

            mockCollection.findOne.mockResolvedValueOnce({
                _id: new ObjectId(wordId),
                vocabularyListId: new ObjectId('507f1f77bcf86cd799439011')
            });
            mockCollection.findOne.mockResolvedValueOnce(null);

            const result = await VocabularyService.getWordProgress(wordId, userId);

            expect(result).toBeNull();
        });
    });

    describe('LearningStatsService.updateDailyStats', () => {
        it('should upsert learning stats with increments', async () => {
            const userId = 'user123';
            const stats = {
                wordsReviewed: 5
            };

            mockCollection.findOneAndUpdate = jest.fn().mockResolvedValue({});

            await LearningStatsService.updateDailyStats(userId, stats);

            expect(mockDb.collection).toHaveBeenCalledWith('LearningStats');
            expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
                { userId, date: expect.any(Date) },
                {
                    $inc: {
                        quizzesTaken: 0,
                        wordsReviewed: 5,
                        totalQuestions: 0,
                        correctAnswers: 0
                    },
                    $setOnInsert: {
                        userId,
                        date: expect.any(Date),
                        createdAt: expect.any(Date)
                    },
                    $set: {
                        updatedAt: expect.any(Date)
                    }
                },
                { upsert: true }
            );
        });

        it('should handle default values for stats', async () => {
            const userId = 'user123';
            const stats = {};

            mockCollection.findOneAndUpdate = jest.fn().mockResolvedValue({});

            await LearningStatsService.updateDailyStats(userId, stats);

            expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
                { userId, date: expect.any(Date) },
                expect.objectContaining({
                    $inc: {
                        quizzesTaken: 0,
                        wordsReviewed: 0,
                        totalQuestions: 0,
                        correctAnswers: 0
                    }
                }),
                { upsert: true }
            );
        });
    });
});
