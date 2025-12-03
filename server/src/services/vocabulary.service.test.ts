import { VocabularyService } from './vocabulary.service';
import { connectToDatabase } from '../utils/mongo';
import { ObjectId } from 'mongodb';

// Mock the mongo utility
jest.mock('../utils/mongo');

describe('VocabularyService', () => {
    let mockDb: any;
    let mockCollection: any;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Setup mock chain
        mockCollection = {
            aggregate: jest.fn().mockReturnThis(),
            toArray: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn().mockReturnThis(),
            insertOne: jest.fn(),
            updateOne: jest.fn(),
            deleteOne: jest.fn(),
            deleteMany: jest.fn(),
            project: jest.fn().mockReturnThis(),
        };

        mockDb = {
            collection: jest.fn().mockReturnValue(mockCollection),
        };

        (connectToDatabase as jest.Mock).mockResolvedValue(mockDb);
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

            expect(connectToDatabase).toHaveBeenCalled();
            expect(mockDb.collection).toHaveBeenCalledWith('VocabularyList');
            expect(mockCollection.aggregate).toHaveBeenCalled();
            expect(result).toEqual(mockLists);

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
            // Skip should be (page-1) * limit = 10
            expect(pipeline[2]).toEqual({ $skip: 10 });
            expect(pipeline[3]).toEqual({ $limit: 10 });
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
                name: listData.name,
                userId
            }));
            expect(result).toEqual(expectedList);
        });

        it('should fetch user language preferences if not provided', async () => {
            const userId = new ObjectId().toString();
            const listData = {
                name: 'New List'
            };

            const mockUser = {
                _id: new ObjectId(userId),
                targetLanguage: 'fr',
                nativeLanguage: 'en'
            };

            // First call is for User collection, second for VocabularyList
            mockDb.collection.mockImplementation((name: string) => {
                if (name === 'User') {
                    return {
                        findOne: jest.fn().mockResolvedValue(mockUser)
                    };
                }
                return mockCollection;
            });

            mockCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
            mockCollection.findOne.mockResolvedValue({});

            await VocabularyService.createList(listData, userId);

            expect(mockCollection.insertOne).toHaveBeenCalledWith(expect.objectContaining({
                targetLanguage: 'fr',
                nativeLanguage: 'en'
            }));
        });
    });
});
