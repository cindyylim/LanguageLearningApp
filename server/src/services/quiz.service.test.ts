import { QuizService } from './quiz.service';
import { connectToDatabase } from '../utils/mongo';
import { ObjectId } from 'mongodb';

jest.mock('../utils/mongo');
jest.mock('./ai');
jest.mock('../utils/logger');

describe('QuizService', () => {
    let mockDb: any;

    beforeEach(() => {
        mockDb = {
            collection: jest.fn().mockReturnValue({
                findOne: jest.fn(),
                find: jest.fn().mockReturnThis(),
                insertOne: jest.fn(),
                updateOne: jest.fn(),
                toArray: jest.fn(),
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
            }),
        };
        (connectToDatabase as jest.Mock).mockResolvedValue(mockDb);
    });

    describe('getUserQuizzes', () => {
        it('should return user quizzes with details', async () => {
            const userId = 'user123';
            const mockQuizzes = [
                { _id: new ObjectId(), title: 'Quiz 1', userId }
            ];

            mockDb.collection().toArray.mockResolvedValue(mockQuizzes);
            mockDb.collection().find().sort().toArray.mockResolvedValue([]);

            const result = await QuizService.getUserQuizzes(userId);

            expect(result).toBeInstanceOf(Array);
            expect(mockDb.collection).toHaveBeenCalledWith('Quiz');
        });
    });

    describe('getQuizById', () => {
        it('should return quiz with questions', async () => {
            const quizId = new ObjectId().toString();
            const userId = 'user123';
            const mockQuiz = { _id: new ObjectId(quizId), title: 'Test Quiz' };
            const mockQuestions = [{ _id: new ObjectId(), question: 'Test?' }];

            mockDb.collection().findOne.mockResolvedValue(mockQuiz);
            mockDb.collection().find().toArray.mockResolvedValue(mockQuestions);

            const result = await QuizService.getQuizById(quizId, userId);

            expect(result).toMatchObject({
                title: 'Test Quiz',
                questions: mockQuestions,
            });
        });

        it('should return null for non-existent quiz', async () => {
            const validObjectId = new ObjectId().toString();
            mockDb.collection().findOne.mockResolvedValue(null);

            const result = await QuizService.getQuizById(validObjectId, 'user123');

            expect(result).toBeNull();
        });
    });
});
