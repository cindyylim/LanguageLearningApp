import { QuizService } from './quiz.service';
import { LearningStatsService } from './learningStats.service';
import { WordStatus } from '../shared/types/index';
import { AIService } from './ai';
import { connectToTestDatabase } from '../utils/testMongo';
import { ObjectId } from 'mongodb';

jest.mock('../utils/testMongo');
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
        (connectToTestDatabase as jest.Mock).mockResolvedValue(mockDb);
    });

    // Helper function to create mock collections
    const createMockCollections = (overrides: any = {}) => {
        const defaultCollections = {
            Quiz: {
                findOne: jest.fn(),
                find: jest.fn().mockReturnThis(),
                insertOne: jest.fn(),
                toArray: jest.fn(),
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
            },
            QuizQuestion: {
                findOne: jest.fn(),
                find: jest.fn().mockReturnThis(),
                insertOne: jest.fn(),
                toArray: jest.fn(),
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
            },
            QuizAttempt: {
                findOne: jest.fn(),
                find: jest.fn().mockReturnThis(),
                insertOne: jest.fn(),
                toArray: jest.fn(),
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
            },
            QuizAnswer: {
                findOne: jest.fn(),
                find: jest.fn().mockReturnThis(),
                insertOne: jest.fn(),
                toArray: jest.fn(),
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
            },
            WordProgress: {
                findOne: jest.fn(),
                find: jest.fn().mockReturnThis(),
                insertOne: jest.fn(),
                updateOne: jest.fn(),
                toArray: jest.fn(),
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
            },
            Word: {
                findOne: jest.fn(),
                find: jest.fn().mockReturnThis(),
                insertOne: jest.fn(),
                toArray: jest.fn(),
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
            },
            VocabularyList: {
                findOne: jest.fn(),
                find: jest.fn().mockReturnThis(),
                insertOne: jest.fn(),
                toArray: jest.fn(),
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
            },
            LearningStats: {
                findOne: jest.fn(),
                find: jest.fn().mockReturnThis(),
                insertOne: jest.fn(),
                updateOne: jest.fn(),
                toArray: jest.fn(),
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
            }
        };

        // Merge with overrides
        const collections = { ...defaultCollections, ...overrides };

        mockDb.collection.mockImplementation((collectionName: string) => {
            return collections[collectionName as keyof typeof collections] || {
                findOne: jest.fn(),
                find: jest.fn().mockReturnThis(),
                insertOne: jest.fn(),
                updateOne: jest.fn(),
                toArray: jest.fn(),
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
            };
        });

        return collections;
    };

    // Mock data factories
    const createMockVocabularyList = (id: string, overrides: any = {}) => ({
        _id: new ObjectId(id),
        name: 'French Basics',
        targetLanguage: 'fr',
        nativeLanguage: 'en',
        ...overrides
    });

    const createMockWords = (overrides: any[] = []) => [
        {
            _id: new ObjectId('507f1f77bcf86cd799439012'),
            word: 'bonjour',
            translation: 'hello',
            partOfSpeech: 'noun',
            difficulty: 'easy',
            ...overrides[0]
        },
        {
            _id: new ObjectId('507f1f77bcf86cd799439013'),
            word: 'merci',
            translation: 'thank you',
            partOfSpeech: 'interjection',
            difficulty: 'easy',
            ...overrides[1]
        }
    ];

    const createMockAIQuestions = (overrides: any[] = []) => [
        {
            question: 'What is "hello" in French?',
            type: 'multiple_choice' as const,
            correctAnswer: 'bonjour',
            options: ['bonjour', 'salut', 'merci', 'au revoir'],
            context: 'Common greeting',
            difficulty: 'easy',
            wordId: new ObjectId('507f1f77bcf86cd799439012'),
            ...overrides[0]
        },
        {
            question: 'What is "thank you" in French?',
            type: 'multiple_choice' as const,
            correctAnswer: 'merci',
            options: ['merci', 's\'il vous plaît', 'excusez-moi', 'bonjour'],
            context: 'Common expression',
            difficulty: 'easy',
            wordId: new ObjectId('507f1f77bcf86cd799439013'),
            ...overrides[1]
        }
    ];

    const createMockQuiz = (id: string, overrides: any = {}) => ({
        _id: new ObjectId(id),
        title: 'French Basics',
        description: 'Basic French vocabulary',
        difficulty: 'easy',
        questionCount: 10,
        userId: 'user123',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    });

    const createMockQuestions = (overrides: any[] = []) => [
        {
            _id: new ObjectId('507f1f77bcf86cd799439012'),
            question: 'What is "hello" in French?',
            type: 'multiple_choice',
            correctAnswer: 'bonjour',
            quizId: '507f1f77bcf86cd799439011',
            ...overrides[0]
        }
    ];

    const createMockAttempts = (overrides: any[] = []) => [
        {
            _id: new ObjectId('507f1f77bcf86cd799439014'),
            score: 0.8,
            completed: true,
            userId: 'user123',
            quizId: '507f1f77bcf86cd799439011',
            createdAt: new Date(),
            ...overrides[0]
        }
    ];

    const createMockAnswers = (overrides: any[] = []) => [
        {
            _id: new ObjectId('507f1f77bcf86cd799439013'),
            answer: 'bonjour',
            isCorrect: true,
            attemptId: '507f1f77bcf86cd799439012',
            questionId: '507f1f77bcf86cd799439012',
            createdAt: new Date(),
            ...overrides[0]
        }
    ];

    const createMockWordProgress = (overrides: any = {}) => ({
        _id: new ObjectId('507f1f77bcf86cd799439017'),
        userId: 'user123',
        wordId: new ObjectId('507f1f77bcf86cd799439014'),
        status: 'learning',
        reviewCount: 2,
        streak: 1,
        ...overrides
    });

    const createMockWord = (overrides: any = {}) => ({
        _id: new ObjectId('507f1f77bcf86cd799439014'),
        word: 'bonjour',
        translation: 'hello',
        ...overrides
    });

    describe('generateQuiz', () => {
        it('should generate a quiz with AI questions', async () => {
            const vocabularyListId = '507f1f77bcf86cd799439011';
            const userId = 'user123';
            const options = { questionCount: 5, difficulty: 'easy' as const };

            const mockVocabularyList = createMockVocabularyList(vocabularyListId);
            const mockWords = createMockWords();
            const mockAIQuestions = createMockAIQuestions();
            const mockQuizResult = { insertedId: new ObjectId('507f1f77bcf86cd799439014') };
            const mockQuestionResult1 = { insertedId: new ObjectId('507f1f77bcf86cd799439015') };
            const mockQuestionResult2 = { insertedId: new ObjectId('507f1f77bcf86cd799439016') };

            const mockInsertedQuestions = [
                {
                    _id: mockQuestionResult1.insertedId,
                    question: 'What is "hello" in French?',
                    type: 'multiple_choice',
                    correctAnswer: 'bonjour',
                    options: '["bonjour", "salut", "merci", "au revoir"]',
                    context: 'Common greeting',
                    difficulty: 'easy',
                    quizId: mockQuizResult.insertedId.toString(),
                    wordId: new ObjectId('507f1f77bcf86cd799439012'),
                    createdAt: expect.any(Date)
                },
                {
                    _id: mockQuestionResult2.insertedId,
                    question: 'What is "thank you" in French?',
                    type: 'multiple_choice',
                    correctAnswer: 'merci',
                    options: '["merci", "s\'il vous plaît", "excusez-moi", "bonjour"]',
                    context: 'Common expression',
                    difficulty: 'easy',
                    quizId: mockQuizResult.insertedId.toString(),
                    wordId: new ObjectId('507f1f77bcf86cd799439013'),
                    createdAt: expect.any(Date)
                }
            ];

            const mockQuiz = {
                _id: mockQuizResult.insertedId,
                title: 'Quiz: French Basics',
                description: 'AI-generated quiz from French Basics',
                difficulty: 'easy',
                questionCount: 5,
                userId,
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date)
            };

            const collections = createMockCollections({
                VocabularyList: {
                    findOne: jest.fn().mockResolvedValue(mockVocabularyList)
                },
                Word: {
                    find: jest.fn().mockReturnThis(),
                    toArray: jest.fn().mockResolvedValue(mockWords)
                },
                Quiz: {
                    insertOne: jest.fn().mockResolvedValue(mockQuizResult),
                    findOne: jest.fn().mockResolvedValue(mockQuiz)
                },
                QuizQuestion: {
                    insertOne: jest.fn()
                        .mockResolvedValueOnce(mockQuestionResult1)
                        .mockResolvedValueOnce(mockQuestionResult2),
                    findOne: jest.fn()
                        .mockResolvedValueOnce(mockInsertedQuestions[0])
                        .mockResolvedValueOnce(mockInsertedQuestions[1])
                }
            });

            jest.spyOn(AIService, 'generateQuestions').mockResolvedValue(mockAIQuestions);

            const result = await QuizService.generateQuiz(vocabularyListId, options, userId);

            expect(result).toEqual({
                quiz: {
                    ...mockQuiz,
                    questions: mockInsertedQuestions
                },
                created: true
            });

            expect(collections.VocabularyList.findOne).toHaveBeenCalledWith({
                _id: new ObjectId(vocabularyListId),
                userId
            });

            expect(collections.Word.find).toHaveBeenCalledWith({
                vocabularyListId: new ObjectId(vocabularyListId)
            });

            expect(AIService.generateQuestions).toHaveBeenCalledWith(
                [
                    {
                        _id: '507f1f77bcf86cd799439012',
                        word: 'bonjour',
                        translation: 'hello',
                        partOfSpeech: 'noun',
                        difficulty: 'easy'
                    },
                    {
                        _id: '507f1f77bcf86cd799439013',
                        word: 'merci',
                        translation: 'thank you',
                        partOfSpeech: 'interjection',
                        difficulty: 'easy'
                    }
                ],
                'fr',
                'en',
                5,
                'easy'
            );

            expect(collections.Quiz.insertOne).toHaveBeenCalledWith({
                title: 'Quiz: French Basics',
                description: 'AI-generated quiz from French Basics',
                difficulty: 'easy',
                questionCount: 5,
                userId,
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date)
            });

            expect(collections.QuizQuestion.insertOne).toHaveBeenCalledTimes(2);
        });

        it('should return null if vocabulary list does not exist', async () => {
            const vocabularyListId = '507f1f77bcf86cd799439011';
            const userId = 'user123';
            const options = { questionCount: 5, difficulty: 'easy' as const };

            const collections = createMockCollections({
                VocabularyList: {
                    findOne: jest.fn().mockResolvedValue(null)
                }
            });

            const result = await QuizService.generateQuiz(vocabularyListId, options, userId);

            expect(result).toBeNull();
        });

        it('should throw error if no words in vocabulary list', async () => {
            const vocabularyListId = '507f1f77bcf86cd799439011';
            const userId = 'user123';
            const options = { questionCount: 5, difficulty: 'easy' as const };

            const mockVocabularyList = createMockVocabularyList(vocabularyListId);

            const collections = createMockCollections({
                VocabularyList: {
                    findOne: jest.fn().mockResolvedValue(mockVocabularyList)
                },
                Word: {
                    find: jest.fn().mockReturnThis(),
                    toArray: jest.fn().mockResolvedValue([])
                }
            });

            await expect(QuizService.generateQuiz(vocabularyListId, options, userId))
                .rejects.toThrow('No words in vocabulary list');
        });

        it('should return existing quiz for duplicate idempotency key', async () => {
            const vocabularyListId = '507f1f77bcf86cd799439011';
            const userId = 'user123';
            const options = { questionCount: 5, difficulty: 'easy' as const };
            const idempotencyKey = 'idem-key-1';
            const existingQuizId = '507f1f77bcf86cd799439014';

            const existingQuiz = {
                _id: new ObjectId(existingQuizId),
                title: 'Quiz: French Basics',
                questions: []
            };

            const collections = createMockCollections({
                IdempotencyKey: {
                    findOne: jest.fn().mockResolvedValue({
                        userId,
                        key: idempotencyKey,
                        status: 'completed',
                        quizId: existingQuizId,
                        createdAt: new Date()
                    }),
                    insertOne: jest.fn(),
                    updateOne: jest.fn(),
                    deleteOne: jest.fn()
                },
                Quiz: {
                    findOne: jest.fn().mockResolvedValue(existingQuiz),
                    insertOne: jest.fn()
                },
                QuizQuestion: {
                    find: jest.fn().mockReturnThis(),
                    toArray: jest.fn().mockResolvedValue([])
                }
            });

            const result = await QuizService.generateQuiz(vocabularyListId, options, userId, idempotencyKey);

            expect(result).toEqual({ quiz: existingQuiz, created: false });
            expect(collections.IdempotencyKey.insertOne).not.toHaveBeenCalled();
            expect(collections.Quiz.insertOne).not.toHaveBeenCalled();
            expect(AIService.generateQuestions).not.toHaveBeenCalled();
        });

        it('should create separate quizzes for different idempotency keys', async () => {
            const vocabularyListId = '507f1f77bcf86cd799439011';
            const userId = 'user123';
            const options = { questionCount: 5, difficulty: 'easy' as const };

            const mockVocabularyList = createMockVocabularyList(vocabularyListId);
            const mockWords = createMockWords();
            const mockAIQuestions = createMockAIQuestions();
            const mockQuizResult = { insertedId: new ObjectId('507f1f77bcf86cd799439014') };
            const mockQuestionResult1 = { insertedId: new ObjectId('507f1f77bcf86cd799439015') };
            const mockQuestionResult2 = { insertedId: new ObjectId('507f1f77bcf86cd799439016') };

            const mockQuiz = {
                _id: mockQuizResult.insertedId,
                title: 'Quiz: French Basics',
                description: 'AI-generated quiz from French Basics',
                difficulty: 'easy',
                questionCount: 5,
                userId,
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date)
            };

            const collections = createMockCollections({
                VocabularyList: {
                    findOne: jest.fn().mockResolvedValue(mockVocabularyList)
                },
                Word: {
                    find: jest.fn().mockReturnThis(),
                    toArray: jest.fn().mockResolvedValue(mockWords)
                },
                IdempotencyKey: {
                    findOne: jest.fn().mockResolvedValue(null),
                    insertOne: jest.fn().mockResolvedValue({ insertedId: new ObjectId() }),
                    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
                    deleteOne: jest.fn()
                },
                Quiz: {
                    insertOne: jest.fn().mockResolvedValue(mockQuizResult),
                    findOne: jest.fn().mockResolvedValue(mockQuiz)
                },
                QuizQuestion: {
                    insertOne: jest.fn()
                        .mockResolvedValueOnce(mockQuestionResult1)
                        .mockResolvedValueOnce(mockQuestionResult2)
                        .mockResolvedValueOnce(mockQuestionResult1)
                        .mockResolvedValueOnce(mockQuestionResult2),
                    findOne: jest.fn()
                        .mockResolvedValueOnce({ _id: mockQuestionResult1.insertedId })
                        .mockResolvedValueOnce({ _id: mockQuestionResult2.insertedId })
                        .mockResolvedValueOnce({ _id: mockQuestionResult1.insertedId })
                        .mockResolvedValueOnce({ _id: mockQuestionResult2.insertedId })
                }
            });

            jest.spyOn(AIService, 'generateQuestions').mockResolvedValue(mockAIQuestions);

            const first = await QuizService.generateQuiz(vocabularyListId, options, userId, 'key-a');
            const second = await QuizService.generateQuiz(vocabularyListId, options, userId, 'key-b');

            expect(first?.created).toBe(true);
            expect(second?.created).toBe(true);
            expect(collections.Quiz.insertOne).toHaveBeenCalledTimes(2);
            expect(collections.IdempotencyKey.insertOne).toHaveBeenCalledTimes(2);
        });

        it('should scope idempotency keys per user', async () => {
            const vocabularyListId = '507f1f77bcf86cd799439011';
            const options = { questionCount: 5, difficulty: 'easy' as const };
            const idempotencyKey = 'shared-key';

            const mockVocabularyList = createMockVocabularyList(vocabularyListId);
            const mockWords = createMockWords();
            const mockAIQuestions = createMockAIQuestions();
            const mockQuizResult = { insertedId: new ObjectId('507f1f77bcf86cd799439014') };
            const mockQuestionResult1 = { insertedId: new ObjectId('507f1f77bcf86cd799439015') };
            const mockQuestionResult2 = { insertedId: new ObjectId('507f1f77bcf86cd799439016') };

            const mockQuiz = {
                _id: mockQuizResult.insertedId,
                title: 'Quiz: French Basics',
                description: 'AI-generated quiz from French Basics',
                difficulty: 'easy',
                questionCount: 5,
                userId: 'user-a',
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date)
            };

            const collections = createMockCollections({
                VocabularyList: {
                    findOne: jest.fn().mockResolvedValue(mockVocabularyList)
                },
                Word: {
                    find: jest.fn().mockReturnThis(),
                    toArray: jest.fn().mockResolvedValue(mockWords)
                },
                IdempotencyKey: {
                    findOne: jest.fn().mockResolvedValue(null),
                    insertOne: jest.fn().mockResolvedValue({ insertedId: new ObjectId() }),
                    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
                    deleteOne: jest.fn()
                },
                Quiz: {
                    insertOne: jest.fn().mockResolvedValue(mockQuizResult),
                    findOne: jest.fn().mockResolvedValue(mockQuiz)
                },
                QuizQuestion: {
                    insertOne: jest.fn()
                        .mockResolvedValueOnce(mockQuestionResult1)
                        .mockResolvedValueOnce(mockQuestionResult2)
                        .mockResolvedValueOnce(mockQuestionResult1)
                        .mockResolvedValueOnce(mockQuestionResult2),
                    findOne: jest.fn()
                        .mockResolvedValueOnce({ _id: mockQuestionResult1.insertedId })
                        .mockResolvedValueOnce({ _id: mockQuestionResult2.insertedId })
                        .mockResolvedValueOnce({ _id: mockQuestionResult1.insertedId })
                        .mockResolvedValueOnce({ _id: mockQuestionResult2.insertedId })
                }
            });

            jest.spyOn(AIService, 'generateQuestions').mockResolvedValue(mockAIQuestions);

            await QuizService.generateQuiz(vocabularyListId, options, 'user-a', idempotencyKey);
            await QuizService.generateQuiz(vocabularyListId, options, 'user-b', idempotencyKey);

            expect(collections.Quiz.insertOne).toHaveBeenCalledTimes(2);
            expect(collections.IdempotencyKey.insertOne).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 'user-a', key: idempotencyKey })
            );
            expect(collections.IdempotencyKey.insertOne).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 'user-b', key: idempotencyKey })
            );
        });
    });

    describe('getUserQuizzes', () => {
        it('should get user quizzes with questions and attempts', async () => {
            const userId = 'user123';

            const mockQuizzes = [
                createMockQuiz('507f1f77bcf86cd799439011'),
                createMockQuiz('507f1f77bcf86cd799439012', {
                    title: 'French Greetings',
                    description: 'French greetings and expressions',
                    difficulty: 'medium',
                    questionCount: 5
                })
            ];

            const mockQuestions = createMockQuestions();
            const mockAttempts = createMockAttempts();

            const collections = createMockCollections({
                Quiz: {
                    find: jest.fn().mockReturnThis(),
                    sort: jest.fn().mockReturnThis(),
                    toArray: jest.fn().mockResolvedValue(mockQuizzes)
                },
                QuizQuestion: {
                    find: jest.fn().mockReturnThis(),
                    toArray: jest.fn().mockResolvedValue(mockQuestions)
                },
                QuizAttempt: {
                    find: jest.fn().mockReturnThis(),
                    sort: jest.fn().mockReturnThis(),
                    limit: jest.fn().mockReturnThis(),
                    toArray: jest.fn().mockResolvedValue(mockAttempts)
                }
            });

            const result = await QuizService.getUserQuizzes(userId);

            expect(result).toEqual([
                {
                    ...mockQuizzes[0],
                    questions: mockQuestions,
                    attempts: mockAttempts,
                    _count: { questions: 1, attempts: 1 }
                },
                {
                    ...mockQuizzes[1],
                    questions: mockQuestions,
                    attempts: mockAttempts,
                    _count: { questions: 1, attempts: 1 }
                }
            ]);

            expect(collections.QuizQuestion.find).toHaveBeenCalledWith({ quizId: '507f1f77bcf86cd799439011' });
            expect(collections.QuizQuestion.find).toHaveBeenCalledWith({ quizId: '507f1f77bcf86cd799439012' });
            expect(collections.QuizAttempt.find).toHaveBeenCalledWith({ quizId: '507f1f77bcf86cd799439011', userId });
            expect(collections.QuizAttempt.find).toHaveBeenCalledWith({ quizId: '507f1f77bcf86cd799439012', userId });
        });
    });

    describe('getQuizById', () => {
        it('should get quiz by ID with questions', async () => {
            const quizId = '507f1f77bcf86cd799439011';
            const userId = 'user123';

            const mockQuiz = createMockQuiz(quizId);
            const mockQuestions = createMockQuestions();

            const collections = createMockCollections({
                Quiz: {
                    findOne: jest.fn().mockResolvedValue(mockQuiz)
                },
                QuizQuestion: {
                    find: jest.fn().mockReturnThis(),
                    toArray: jest.fn().mockResolvedValue(mockQuestions)
                }
            });

            const result = await QuizService.getQuizById(quizId, userId);

            expect(result).toEqual({
                ...mockQuiz,
                questions: mockQuestions
            });

            expect(collections.Quiz.findOne).toHaveBeenCalledWith({
                _id: new ObjectId(quizId),
                userId
            });
            expect(collections.QuizQuestion.find).toHaveBeenCalledWith({ quizId });
        });

        it('should return null if quiz does not exist', async () => {
            const quizId = '507f1f77bcf86cd799439011';
            const userId = 'user123';

            const collections = createMockCollections({
                Quiz: {
                    findOne: jest.fn().mockResolvedValue(null)
                }
            });

            const result = await QuizService.getQuizById(quizId, userId);

            expect(result).toBeNull();
        });
    });

    describe('submitQuizAnswers', () => {
        const createMockQuizForSubmit = (quizId: string) => ({
            _id: new ObjectId(quizId),
            title: 'French Basics',
            difficulty: 'easy',
            questionCount: 2,
            userId: 'user123'
        });

        const createMockQuestionsForSubmit = () => [
            {
                _id: new ObjectId('507f1f77bcf86cd799439012'),
                question: 'What is "hello" in French?',
                type: 'multiple_choice',
                correctAnswer: 'bonjour',
                wordId: new ObjectId('507f1f77bcf86cd799439014')
            },
            {
                _id: new ObjectId('507f1f77bcf86cd799439013'),
                question: 'What is "thank you" in French?',
                type: 'multiple_choice',
                correctAnswer: 'merci',
                wordId: new ObjectId('507f1f77bcf86cd799439015')
            }
        ];

        const createMockAttemptResult = () => ({
            insertedId: new ObjectId('507f1f77bcf86cd799439016')
        });

        it('should submit quiz answers and update progress', async () => {
            const quizId = '507f1f77bcf86cd799439011';
            const userId = 'user123';
            const answers = [
                { questionId: '507f1f77bcf86cd799439012', answer: 'bonjour' },
                { questionId: '507f1f77bcf86cd799439013', answer: 'merci' }
            ];

            const mockQuiz = createMockQuizForSubmit(quizId);
            const mockQuestions = createMockQuestionsForSubmit();
            const mockAttemptResult = createMockAttemptResult();
            const mockExistingProgress = createMockWordProgress();
            const mockWord = createMockWord();

            const collections = createMockCollections({
                Quiz: {
                    findOne: jest.fn().mockResolvedValue(mockQuiz)
                },
                QuizQuestion: {
                    find: jest.fn().mockReturnThis(),
                    toArray: jest.fn().mockResolvedValue(mockQuestions)
                },
                QuizAttempt: {
                    insertOne: jest.fn().mockResolvedValue(mockAttemptResult)
                },
                QuizAnswer: {
                    insertOne: jest.fn()
                },
                WordProgress: {
                    findOne: jest.fn().mockResolvedValue(mockExistingProgress),
                    updateOne: jest.fn()
                },
                Word: {
                    findOne: jest.fn().mockResolvedValue(mockWord)
                },
                LearningStats: {
                    findOneAndUpdate: jest.fn()
                }
            });

            const result = await QuizService.submitQuizAnswers(quizId, answers, userId);

            expect(result).toEqual({
                id: mockAttemptResult.insertedId.toString(),
                score: 1.0,
                completed: true,
                correctAnswers: 2,
                totalQuestions: 2,
                answers: [
                    {
                        answer: 'bonjour',
                        isCorrect: true,
                        questionId: '507f1f77bcf86cd799439012',
                        wordId: new ObjectId('507f1f77bcf86cd799439014')
                    },
                    {
                        answer: 'merci',
                        isCorrect: true,
                        questionId: '507f1f77bcf86cd799439013',
                        wordId: new ObjectId('507f1f77bcf86cd799439015')
                    }
                ]
            });

            expect(collections.Quiz.findOne).toHaveBeenCalledWith({
                _id: new ObjectId(quizId),
                userId
            });

            expect(collections.QuizAttempt.insertOne).toHaveBeenCalledWith({
                score: 1.0,
                completed: true,
                userId,
                quizId,
                createdAt: expect.any(Date)
            });

            expect(collections.QuizAnswer.insertOne).toHaveBeenCalledTimes(2);
            expect(collections.WordProgress.findOne).toHaveBeenCalledWith({
                userId,
                wordId: new ObjectId('507f1f77bcf86cd799439014')
            });
            expect(collections.WordProgress.findOne).toHaveBeenCalledWith({
                userId,
                wordId: new ObjectId('507f1f77bcf86cd799439015')
            });
            expect(collections.WordProgress.updateOne).toHaveBeenCalledTimes(2);
            expect(collections.LearningStats.findOneAndUpdate).toHaveBeenCalledWith(
                { userId, date: expect.any(Date) },
                expect.objectContaining({
                    $inc: {
                        quizzesTaken: 1,
                        wordsReviewed: 2,
                        totalQuestions: 2,
                        correctAnswers: 2
                    }
                }),
                { upsert: true }
            );
        });

        it('should return null if quiz does not exist', async () => {
            const quizId = '507f1f77bcf86cd799439011';
            const userId = 'user123';
            const answers = [
                { questionId: '507f1f77bcf86cd799439012', answer: 'bonjour' }
            ];

            const collections = createMockCollections({
                Quiz: {
                    findOne: jest.fn().mockResolvedValue(null)
                }
            });

            const result = await QuizService.submitQuizAnswers(quizId, answers, userId);

            expect(result).toBeNull();
        });
    });

    describe('getQuizResults', () => {
        it('should get quiz results with detailed answers', async () => {
            const quizId = '507f1f77bcf86cd799439011';
            const userId = 'user123';

            const mockQuiz = createMockQuiz(quizId);
            const mockAttempts = createMockAttempts();
            const mockAnswers = createMockAnswers();
            const mockQuestions = createMockQuestions();

            const collections = createMockCollections({
                Quiz: {
                    findOne: jest.fn().mockResolvedValue(mockQuiz)
                },
                QuizAttempt: {
                    find: jest.fn().mockReturnThis(),
                    sort: jest.fn().mockReturnThis(),
                    toArray: jest.fn().mockResolvedValue(mockAttempts)
                },
                QuizAnswer: {
                    find: jest.fn().mockReturnThis(),
                    toArray: jest.fn().mockResolvedValue(mockAnswers)
                },
                QuizQuestion: {
                    findOne: jest.fn().mockResolvedValue(mockQuestions[0])
                }
            });

            const result = await QuizService.getQuizResults(quizId, userId);

            expect(result).toEqual({
                ...mockQuiz,
                attempts: [
                    {
                        ...mockAttempts[0],
                        answers: [
                            {
                                ...mockAnswers[0],
                                question: mockQuestions[0]
                            }
                        ]
                    }
                ]
            });

            expect(collections.Quiz.findOne).toHaveBeenCalledWith({
                _id: new ObjectId(quizId),
                userId
            });
            expect(collections.QuizAttempt.find).toHaveBeenCalledWith({ quizId, userId });
            expect(collections.QuizAnswer.find).toHaveBeenCalledWith({ attemptId: '507f1f77bcf86cd799439014' });
            expect(collections.QuizQuestion.findOne).toHaveBeenCalledWith({ _id: new ObjectId('507f1f77bcf86cd799439012') });
        });

        it('should return null if quiz does not exist', async () => {
            const quizId = '507f1f77bcf86cd799439011';
            const userId = 'user123';

            const collections = createMockCollections({
                Quiz: {
                    findOne: jest.fn().mockResolvedValue(null)
                }
            });

            const result = await QuizService.getQuizResults(quizId, userId);

            expect(result).toBeNull();
        });
    });

    describe('SM-2 product path integration', () => {
        const wordId = '507f1f77bcf86cd799439014';
        const userId = 'user123';

        const runQuizReview = async (
            collections: ReturnType<typeof createMockCollections>,
            existingProgress: ReturnType<typeof createMockWordProgress> | null,
            accuracy: { correct: number; total: number }
        ) => {
            const mockWord = createMockWord();

            collections.WordProgress.findOne.mockResolvedValueOnce(existingProgress);
            collections.Word.findOne.mockResolvedValue(mockWord);

            const wordProgressMap = new Map<string, { correct: number; total: number }>();
            wordProgressMap.set(wordId, accuracy);

            await (QuizService as any).updateWordProgressFromQuiz(wordProgressMap, userId);

            if (!existingProgress) {
                const inserted = collections.WordProgress.insertOne.mock.calls[
                    collections.WordProgress.insertOne.mock.calls.length - 1
                ][0];
                return {
                    _id: new ObjectId(),
                    userId,
                    wordId: new ObjectId(wordId),
                    ...inserted,
                };
            }

            const updateCall = collections.WordProgress.updateOne.mock.calls[
                collections.WordProgress.updateOne.mock.calls.length - 1
            ];
            return {
                ...existingProgress,
                status: updateCall[1].$set.status,
                streak: updateCall[1].$set.streak,
                reviewCount: updateCall[1].$set.reviewCount,
                easeFactor: updateCall[1].$set.easeFactor,
                interval: updateCall[1].$set.interval,
            };
        };

        const runConsecutiveQuizReviews = async (
            collections: ReturnType<typeof createMockCollections>,
            count: number,
            accuracy: { correct: number; total: number }
        ) => {
            let progress: ReturnType<typeof createMockWordProgress> | null = null;

            for (let i = 0; i < count; i++) {
                progress = await runQuizReview(collections, progress, accuracy);
            }

            return progress;
        };

        it('should set status learning and streak 1 on first perfect quiz for a new word', async () => {
            const collections = createMockCollections({
                WordProgress: {
                    findOne: jest.fn(),
                    updateOne: jest.fn(),
                    insertOne: jest.fn(),
                },
                Word: {
                    findOne: jest.fn(),
                },
            });

            const progress = await runQuizReview(collections, null, { correct: 1, total: 1 });

            expect(progress.status).toBe(WordStatus.LEARNING);
            expect(progress.streak).toBe(1);
            expect(collections.WordProgress.insertOne).toHaveBeenCalled();
            expect(collections.WordProgress.updateOne).not.toHaveBeenCalled();
        });

        it('should reach mastered status after five consecutive perfect quiz reviews', async () => {
            const collections = createMockCollections({
                WordProgress: {
                    findOne: jest.fn(),
                    updateOne: jest.fn(),
                    insertOne: jest.fn(),
                },
                Word: {
                    findOne: jest.fn(),
                },
            });

            const progress = await runConsecutiveQuizReviews(collections, 5, { correct: 1, total: 1 });

            expect(progress?.status).toBe(WordStatus.MASTERED);
            expect(progress?.streak).toBe(5);
            expect(collections.WordProgress.insertOne).toHaveBeenCalledTimes(1);
            expect(collections.WordProgress.updateOne).toHaveBeenCalledTimes(4);
        });

        it('should reset streak to 0 on quiz fail and recover to streak 1 on next success', async () => {
            const collections = createMockCollections({
                WordProgress: {
                    findOne: jest.fn(),
                    updateOne: jest.fn(),
                    insertOne: jest.fn(),
                },
                Word: {
                    findOne: jest.fn(),
                },
            });

            const streakThree = createMockWordProgress({
                status: WordStatus.LEARNING,
                streak: 3,
                reviewCount: 3,
                easeFactor: 2.6,
                interval: 6,
            });

            const afterFail = await runQuizReview(collections, streakThree, { correct: 1, total: 4 });
            expect(afterFail.status).toBe(WordStatus.LEARNING);
            expect(afterFail.streak).toBe(0);

            const afterSuccess = await runQuizReview(collections, afterFail, { correct: 1, total: 1 });
            expect(afterSuccess.status).toBe(WordStatus.LEARNING);
            expect(afterSuccess.streak).toBe(1);
        });

        it('should reset manually mastered word to learning when quiz fails (quiz path uses calculateSM2)', async () => {
            const collections = createMockCollections({
                WordProgress: {
                    findOne: jest.fn(),
                    updateOne: jest.fn(),
                    insertOne: jest.fn(),
                },
                Word: {
                    findOne: jest.fn(),
                },
            });

            const manualMastered = createMockWordProgress({
                status: WordStatus.MASTERED,
                streak: 5,
                reviewCount: 5,
                easeFactor: 2.6,
                interval: 6,
            });

            const afterFail = await runQuizReview(collections, manualMastered, { correct: 1, total: 4 });

            expect(afterFail.status).toBe(WordStatus.LEARNING);
            expect(afterFail.streak).toBe(0);
        });

        it('should keep new word on learning after perfect quiz (contrast with manual mastered shortcut)', async () => {
            const collections = createMockCollections({
                WordProgress: {
                    findOne: jest.fn(),
                    updateOne: jest.fn(),
                    insertOne: jest.fn(),
                },
                Word: {
                    findOne: jest.fn(),
                },
            });

            const quizProgress = await runQuizReview(collections, null, { correct: 1, total: 1 });

            expect(quizProgress.status).toBe(WordStatus.LEARNING);
            expect(quizProgress.streak).toBe(1);
            expect(quizProgress.streak).toBeLessThan(5);
        });
    });

    describe('updateWordProgressFromQuiz', () => {
        it('should update existing word progress using SM-2 for good accuracy (q=4)', async () => {
            const userId = 'user123';
            const wordProgressMap = new Map<string, { correct: number; total: number }>();
            wordProgressMap.set('507f1f77bcf86cd799439014', { correct: 3, total: 4 }); // 75% -> q=4

            // streak=1 means SM-2 repetition=1, so next will be repetition=2 -> interval=6
            const mockExistingProgress = createMockWordProgress({
                streak: 1,
                easeFactor: 2.5,
                interval: 1
            });

            const mockWord = createMockWord();

            const collections = createMockCollections({
                WordProgress: {
                    findOne: jest.fn().mockResolvedValue(mockExistingProgress),
                    updateOne: jest.fn()
                },
                Word: {
                    findOne: jest.fn().mockResolvedValue(mockWord)
                }
            });

            await (QuizService as any).updateWordProgressFromQuiz(wordProgressMap, userId);

            expect(collections.WordProgress.findOne).toHaveBeenCalledWith({
                userId,
                wordId: new ObjectId('507f1f77bcf86cd799439014')
            });
            expect(collections.WordProgress.updateOne).toHaveBeenCalledWith(
                { _id: mockExistingProgress._id },
                {
                    $set: {
                        status: 'learning',
                        reviewCount: 6, // 2 + 4
                        streak: 2, // SM-2 repetition incremented
                        easeFactor: expect.any(Number),
                        interval: 6, // SM-2: n=2 -> interval=6
                        lastReviewed: expect.any(Date),
                        nextReview: expect.any(Date),
                        updatedAt: expect.any(Date)
                    }
                }
            );
        });

        it('should schedule nextReview using SM-2 interval for n=2', async () => {
            const userId = 'user123';
            const wordProgressMap = new Map<string, { correct: number; total: number }>();
            wordProgressMap.set('507f1f77bcf86cd799439014', { correct: 1, total: 1 }); // 100% -> q=5

            const mockExistingProgress = createMockWordProgress({
                streak: 1,
                easeFactor: 2.5,
                interval: 1
            });
            const mockWord = createMockWord();

            const collections = createMockCollections({
                WordProgress: {
                    findOne: jest.fn().mockResolvedValue(mockExistingProgress),
                    updateOne: jest.fn()
                },
                Word: {
                    findOne: jest.fn().mockResolvedValue(mockWord)
                }
            });

            const now = Date.now();
            await (QuizService as any).updateWordProgressFromQuiz(wordProgressMap, userId);

            const updateCall = collections.WordProgress.updateOne.mock.calls[0][1];
            const nextReviewDate: Date = updateCall.$set.nextReview;
            const diffDays = Math.round((nextReviewDate.getTime() - now) / (24 * 60 * 60 * 1000));
            expect(diffDays).toBe(6); // SM-2: n=2 -> interval=6
        });

        it('should reset repetition and interval on poor accuracy (q<3)', async () => {
            const userId = 'user123';
            const wordProgressMap = new Map<string, { correct: number; total: number }>();
            wordProgressMap.set('507f1f77bcf86cd799439014', { correct: 1, total: 4 }); // 25% -> q=2

            const mockExistingProgress = createMockWordProgress({
                status: 'learning',
                reviewCount: 5,
                streak: 3,
                easeFactor: 2.5,
                interval: 15
            });

            const mockWord = createMockWord();

            const collections = createMockCollections({
                WordProgress: {
                    findOne: jest.fn().mockResolvedValue(mockExistingProgress),
                    updateOne: jest.fn()
                },
                Word: {
                    findOne: jest.fn().mockResolvedValue(mockWord)
                }
            });

            await (QuizService as any).updateWordProgressFromQuiz(wordProgressMap, userId);

            expect(collections.WordProgress.updateOne).toHaveBeenCalledWith(
                { _id: mockExistingProgress._id },
                {
                    $set: {
                        status: 'learning',
                        reviewCount: 9, // 5 + 4
                        streak: 0, // SM-2: repetition reset to 0
                        easeFactor: expect.any(Number),
                        interval: 1, // SM-2: reset to 1
                        lastReviewed: expect.any(Date),
                        nextReview: expect.any(Date),
                        updatedAt: expect.any(Date)
                    }
                }
            );
        });

        it('should create new word progress record with SM-2 defaults', async () => {
            const userId = 'user123';
            const wordProgressMap = new Map<string, { correct: number; total: number }>();
            wordProgressMap.set('507f1f77bcf86cd799439014', { correct: 3, total: 4 }); // 75% -> q=4

            const mockWord = createMockWord();

            const collections = createMockCollections({
                WordProgress: {
                    findOne: jest.fn().mockResolvedValue(null), // No existing progress
                    updateOne: jest.fn(),
                    insertOne: jest.fn()
                },
                Word: {
                    findOne: jest.fn().mockResolvedValue(mockWord)
                }
            });

            await (QuizService as any).updateWordProgressFromQuiz(wordProgressMap, userId);

            expect(collections.WordProgress.findOne).toHaveBeenCalledWith({
                userId,
                wordId: new ObjectId('507f1f77bcf86cd799439014')
            });
            expect(collections.WordProgress.insertOne).toHaveBeenCalledWith({
                userId,
                wordId: new ObjectId('507f1f77bcf86cd799439014'),
                status: 'learning',
                reviewCount: 4,
                streak: 1,
                easeFactor: expect.any(Number),
                interval: 1,
                lastReviewed: expect.any(Date),
                nextReview: expect.any(Date),
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date)
            });
        });

        it('should skip progress update for invalid wordId', async () => {
            const quizId = '507f1f77bcf86cd799439011';
            const userId = 'user123';
            const answers = [
                { questionId: '507f1f77bcf86cd799439012', answer: 'bonjour' }
            ];

            const mockQuiz = createMockQuiz(quizId);
            const mockQuestions = [
                {
                    _id: new ObjectId('507f1f77bcf86cd799439012'),
                    question: 'What is "hello" in French?',
                    type: 'multiple_choice',
                    correctAnswer: 'bonjour',
                    wordId: 'invalidWordId' // This is an invalid wordId (not 24 characters)
                }
            ];
            const mockAttemptResult = { insertedId: new ObjectId('507f1f77bcf86cd799439016') };

            const collections = createMockCollections({
                Quiz: {
                    findOne: jest.fn().mockResolvedValue(mockQuiz)
                },
                QuizQuestion: {
                    find: jest.fn().mockReturnThis(),
                    toArray: jest.fn().mockResolvedValue(mockQuestions)
                },
                QuizAttempt: {
                    insertOne: jest.fn().mockResolvedValue(mockAttemptResult)
                },
                QuizAnswer: {
                    insertOne: jest.fn()
                },
                WordProgress: {
                    findOne: jest.fn(),
                    updateOne: jest.fn(),
                    insertOne: jest.fn()
                },
                Word: {
                    findOne: jest.fn()
                },
                LearningStats: {
                    findOneAndUpdate: jest.fn()
                }
            });

            const result = await QuizService.submitQuizAnswers(quizId, answers, userId);

            // Verify the result
            expect(result).toEqual({
                id: mockAttemptResult.insertedId.toString(),
                score: 1.0,
                completed: true,
                correctAnswers: 1,
                totalQuestions: 1,
                answers: [
                    {
                        answer: 'bonjour',
                        isCorrect: true,
                        questionId: '507f1f77bcf86cd799439012',
                        wordId: 'invalidWordId'
                    }
                ]
            });

            // Verify that WordProgress operations were not called due to invalid wordId
            expect(collections.WordProgress.findOne).not.toHaveBeenCalled();
            expect(collections.WordProgress.updateOne).not.toHaveBeenCalled();
            expect(collections.WordProgress.insertOne).not.toHaveBeenCalled();

            // Verify LearningStats was still called with 0 wordsReviewed
            expect(collections.LearningStats.findOneAndUpdate).toHaveBeenCalledWith(
                { userId, date: expect.any(Date) },
                expect.objectContaining({
                    $inc: expect.objectContaining({
                        wordsReviewed: 0
                    })
                }),
                { upsert: true }
            );
        });

        it('should handle empty word progress map', async () => {
            const userId = 'user123';
            const wordProgressMap = new Map<string, { correct: number; total: number }>();

            const collections = createMockCollections({
                WordProgress: {
                    findOne: jest.fn(),
                    updateOne: jest.fn(),
                    insertOne: jest.fn()
                }
            });

            // Call the private method through the class
            await (QuizService as any).updateWordProgressFromQuiz(wordProgressMap, userId);

            // Verify no operations were called for empty map
            expect(collections.WordProgress.findOne).not.toHaveBeenCalled();
            expect(collections.WordProgress.updateOne).not.toHaveBeenCalled();
            expect(collections.WordProgress.insertOne).not.toHaveBeenCalled();
        });
    });

    describe('LearningStatsService.updateDailyStats', () => {
        it('should upsert learning stats including wordsReviewed', async () => {
            const userId = 'user123';
            const stats = {
                quizzesTaken: 2,
                totalQuestions: 10,
                correctAnswers: 8,
                wordsReviewed: 3
            };

            const collections = createMockCollections({
                LearningStats: {
                    findOneAndUpdate: jest.fn()
                }
            });

            await LearningStatsService.updateDailyStats(userId, stats);

            expect(collections.LearningStats.findOneAndUpdate).toHaveBeenCalledWith(
                { userId, date: expect.any(Date) },
                {
                    $inc: {
                        quizzesTaken: 2,
                        wordsReviewed: 3,
                        totalQuestions: 10,
                        correctAnswers: 8
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

            const startOfDay = collections.LearningStats.findOneAndUpdate.mock.calls[0][0].date as Date;
            const now = new Date();
            expect(startOfDay.toISOString()).toBe(new Date(Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate()
            )).toISOString());
        });

        it('should upsert new learning stats record', async () => {
            const userId = 'user123';
            const stats = {
                quizzesTaken: 1,
                totalQuestions: 5,
                correctAnswers: 3,
                wordsReviewed: 2
            };

            const collections = createMockCollections({
                LearningStats: {
                    findOneAndUpdate: jest.fn()
                }
            });

            await LearningStatsService.updateDailyStats(userId, stats);

            expect(collections.LearningStats.findOneAndUpdate).toHaveBeenCalledWith(
                { userId, date: expect.any(Date) },
                expect.objectContaining({
                    $inc: {
                        quizzesTaken: 1,
                        wordsReviewed: 2,
                        totalQuestions: 5,
                        correctAnswers: 3
                    }
                }),
                { upsert: true }
            );
        });
    });
});
