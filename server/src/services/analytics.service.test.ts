import { AnalyticsService } from './analytics.service';
import { AIService } from './ai';
import { connectToDatabase } from '../utils/mongo';
import { ObjectId } from 'mongodb';

jest.mock('../utils/mongo');
jest.mock('./ai');

describe('AnalyticsService', () => {
    let mockDb: any;

    beforeEach(() => {
        mockDb = {
            collection: jest.fn().mockReturnValue({
                find: jest.fn().mockReturnThis(),
                aggregate: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                toArray: jest.fn(),
            }),
        };
        (connectToDatabase as jest.Mock).mockResolvedValue(mockDb);
    });

    describe('calculateStreak', () => {
        it('should calculate correct streak', async () => {
            const userId = 'user123';
            const mockStats = [
                { date: new Date() },
                { date: new Date(Date.now() - 86400000) },
                { date: new Date(Date.now() - 2 * 86400000) },
            ];

            mockDb.collection().toArray.mockResolvedValue(mockStats);

            const streak = await AnalyticsService.calculateStreak(userId);

            expect(typeof streak).toBe('number');
            expect(streak).toEqual(3);
        });

        it('should return 0 for no activity', async () => {
            mockDb.collection().toArray.mockResolvedValue([]);

            const streak = await AnalyticsService.calculateStreak('user123');

            expect(streak).toBe(0);
        });
    });

    describe('getSummaryStats', () => {
        it('should calculate summary statistics', () => {
            const wordProgress = [
                { mastery: 1.0, streak: 5 },
                { mastery: 0.5, streak: 2 },
                { mastery: 0.3, streak: 1 },
            ] as any;

            const allAttempts = [
                { score: 0.8 },
                { score: 0.9 },
            ] as any;

            const summary = AnalyticsService.getSummaryStats(wordProgress, allAttempts, 3);

            expect(summary.totalWords).toBe(3);
            expect(summary.masteredWords).toBe(1);
            expect(summary.needsReview).toBe(2);
            expect(summary.currentStreak).toBe(3);
            expect(summary.totalQuizzesTaken).toBe(2);
            expect(summary.avgScore).toBeCloseTo(0.85);
        });
    });

    describe('getProgress', () => {
        it('should get user progress with all components', async () => {
            const userId = 'user123';
            
            // Mock learning stats
            const mockLearningStats = [
                { date: new Date() },
                { date: new Date(Date.now() - 86400000) },
            ];
            
            // Mock word progress with word details
            const mockWordProgress = [
                {
                    _id: 'wp1',
                    wordId: 'word1',
                    userId,
                    mastery: 1.0,
                    status: 'mastered',
                    reviewCount: 5,
                    streak: 3,
                    lastReviewed: new Date().toISOString(),
                    nextReview: new Date(Date.now() + 86400000).toISOString(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    word: { _id: 'word1', text: 'hello', translation: 'bonjour' }
                },
                {
                    _id: 'wp2',
                    wordId: 'word2',
                    userId,
                    mastery: 0.5,
                    status: 'learning',
                    reviewCount: 2,
                    streak: 1,
                    lastReviewed: new Date(Date.now() - 86400000).toISOString(),
                    nextReview: new Date(Date.now() + 43200000).toISOString(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    word: { _id: 'word2', text: 'world', translation: 'monde' }
                }
            ] as any;
            
            // Mock quiz attempts
            const mockAllAttempts = [
                {
                    _id: 'attempt1',
                    score: 0.8,
                    completed: true,
                    userId,
                    quizId: 'quiz1',
                    createdAt: new Date().toISOString()
                },
                {
                    _id: 'attempt2',
                    score: 0.9,
                    completed: true,
                    userId,
                    quizId: 'quiz2',
                    createdAt: new Date(Date.now() - 86400000).toISOString()
                },
                {
                    _id: 'attempt3',
                    score: 0.7,
                    completed: true,
                    userId,
                    quizId: 'quiz3',
                    createdAt: new Date(Date.now() - 2 * 86400000).toISOString()
                }
            ] as any;
            
            // Mock the database calls
            const learningStatsCollection = {
                find: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue(mockLearningStats)
            };
            
            const wordProgressCollection = {
                aggregate: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue(mockWordProgress)
            };
            
            const quizAttemptCollection = {
                find: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue(mockAllAttempts)
            };
            
            mockDb.collection.mockImplementation((collectionName: string) => {
                if (collectionName === 'LearningStats') return learningStatsCollection;
                if (collectionName === 'WordProgress') return wordProgressCollection;
                if (collectionName === 'QuizAttempt') return quizAttemptCollection;
                return {
                    find: jest.fn().mockReturnThis(),
                    sort: jest.fn().mockReturnThis(),
                    limit: jest.fn().mockReturnThis(),
                    toArray: jest.fn().mockResolvedValue([])
                };
            });
            
            // Mock the calculateStreak method
            jest.spyOn(AnalyticsService, 'calculateStreak').mockResolvedValue(2);
            
            const progress = await AnalyticsService.getProgress(userId);
            
            // Verify the structure of the response
            expect(progress).toHaveProperty('summary');
            expect(progress).toHaveProperty('learningStats');
            expect(progress).toHaveProperty('wordProgress');
            expect(progress).toHaveProperty('recentAttempts');
            
            // Verify summary statistics
            expect(progress.summary.totalWords).toBe(2);
            expect(progress.summary.masteredWords).toBe(1);
            expect(progress.summary.needsReview).toBe(1);
            expect(progress.summary.currentStreak).toBe(2);
            expect(progress.summary.maxWordStreak).toBe(3);
            expect(progress.summary.totalQuizzesTaken).toBe(3);
            expect(progress.summary.avgScore).toBeCloseTo(0.8);
            
            // Verify the data arrays
            expect(progress.learningStats).toEqual(mockLearningStats);
            expect(progress.wordProgress).toEqual(mockWordProgress);
            expect(progress.recentAttempts).toEqual(mockAllAttempts.slice(0, 10));
            
            // Verify the correct methods were called
            expect(learningStatsCollection.find).toHaveBeenCalledWith({ userId });
            expect(wordProgressCollection.aggregate).toHaveBeenCalled();
            expect(quizAttemptCollection.find).toHaveBeenCalledWith({ userId });
            expect(AnalyticsService.calculateStreak).toHaveBeenCalledWith(userId);
        });
        
        it('should handle empty data gracefully', async () => {
            const userId = 'user123';
            
            // Mock empty collections
            const emptyCollection = {
                find: jest.fn().mockReturnThis(),
                aggregate: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue([])
            };
            
            mockDb.collection.mockReturnValue(emptyCollection);
            
            // Mock the calculateStreak method to return 0
            jest.spyOn(AnalyticsService, 'calculateStreak').mockResolvedValue(0);
            
            const progress = await AnalyticsService.getProgress(userId);
            
            // Verify the structure of the response
            expect(progress).toHaveProperty('summary');
            expect(progress).toHaveProperty('learningStats');
            expect(progress).toHaveProperty('wordProgress');
            expect(progress).toHaveProperty('recentAttempts');
            
            // Verify summary statistics with empty data
            expect(progress.summary.totalWords).toBe(0);
            expect(progress.summary.masteredWords).toBe(0);
            expect(progress.summary.needsReview).toBe(0);
            expect(progress.summary.currentStreak).toBe(0);
            expect(progress.summary.maxWordStreak).toBe(0);
            expect(progress.summary.totalQuizzesTaken).toBe(0);
            expect(progress.summary.avgScore).toBe(0);
            
            // Verify the data arrays are empty
            expect(progress.learningStats).toEqual([]);
            expect(progress.wordProgress).toEqual([]);
            expect(progress.recentAttempts).toEqual([]);

        });
    });

    describe('getRecommendations', () => {
        it('should get AI-powered recommendations with word details', async () => {
            const userId = 'user123';
            const lastReviewedDate = new Date();
            // Mock user progress with word details
            const mockUserProgress = [
                {
                    _id: 'wp1',
                    wordId: '507f1f77bcf86cd799439011',
                    userId,
                    mastery: 0.5,
                    status: 'learning',
                    reviewCount: 2,
                    streak: 1,
                    lastReviewed: lastReviewedDate.toISOString(),
                    nextReview: new Date(Date.now() + 43200000).toISOString(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    word: { _id: '507f1f77bcf86cd799439011', text: 'hello', translation: 'bonjour' }
                },
                {
                    _id: 'wp2',
                    wordId: '507f1f77bcf86cd799439012',
                    userId,
                    mastery: 0.8,
                    status: 'learning',
                    reviewCount: 3,
                    streak: 2,
                    lastReviewed: lastReviewedDate.toISOString(),
                    nextReview: new Date(Date.now() + 86400000).toISOString(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    word: { _id: '507f1f77bcf86cd799439012', text: 'world', translation: 'monde' }
                }
            ] as any;
            
            // Mock quiz attempts
            const mockAttempts = [
                {
                    _id: 'attempt1',
                    score: 0.8,
                    completed: true,
                    userId,
                    quizId: 'quiz1',
                    createdAt: new Date().toISOString()
                },
                {
                    _id: 'attempt2',
                    score: 0.9,
                    completed: true,
                    userId,
                    quizId: 'quiz2',
                    createdAt: new Date(Date.now() - 86400000).toISOString()
                }
            ] as any;
            const quizDate = new Date();
            // Mock quiz answers
            const mockAnswers = [
                {
                    _id: 'answer1',
                    answer: 'bonjour',
                    isCorrect: true,
                    attemptId: 'attempt1',
                    questionId: '507f1f77bcf86cd799439021',
                    createdAt: quizDate.toISOString(),
                },
                {
                    _id: 'answer2',
                    answer: 'monde',
                    isCorrect: false,
                    attemptId: 'attempt1',
                    questionId: '507f1f77bcf86cd799439022',
                    createdAt: quizDate.toISOString(),
                }
            ];
            
            // Mock quiz questions
            const mockQuestions = [
                {
                    _id: '507f1f77bcf86cd799439021',
                    question: 'What is "hello" in French?',
                    type: 'multiple_choice',
                    options: '["bonjour", "salut", "merci", "au revoir"]',
                    context: null,
                    difficulty: 'easy',
                    correctAnswer: 'bonjour',
                    createdAt: quizDate.toISOString(),
                    quizId: 'quiz1',
                    wordId: '507f1f77bcf86cd799439011'
                },
                {
                    _id: '507f1f77bcf86cd799439022',
                    question: 'What is "world" in French?',
                    type: 'multiple_choice',
                    options: '["monde", "terre", "vie", "jour"]',
                    context: null,
                    difficulty: 'easy',
                    correctAnswer: 'monde',
                    createdAt: quizDate.toISOString(),
                    quizId: 'quiz1',
                    wordId: '507f1f77bcf86cd799439012'
                }
            ];
            
            // Mock recommended words
            const mockRecommendedWords = [
                { _id: '507f1f77bcf86cd799439011', text: 'hello', translation: 'bonjour' },
                { _id: '507f1f77bcf86cd799439012', text: 'world', translation: 'monde' }
            ];
            
            // Mock AI recommendations
            const mockAIRecommendations = {
                focusAreas: ['vocabulary_review', 'practice_questions'],
                recommendedWords: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
                studyPlan: 'Focus on reviewing difficult words with contextual examples',
                estimatedTime: 30
            };
            
            // Mock the database collections
            const wordProgressCollection = {
                aggregate: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue(mockUserProgress)
            };
            
            const quizAttemptCollection = {
                find: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue(mockAttempts)
            };
            
            const quizAnswerCollection = {
                find: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue(mockAnswers)
            };
            
            const quizQuestionCollection = {
                findOne: jest.fn().mockImplementation((query) => {
                    return Promise.resolve(mockQuestions.find(q => q._id === query._id.toString()));
                })
            };
            
            const wordCollection = {
                find: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue(mockRecommendedWords)
            };
            
            mockDb.collection.mockImplementation((collectionName: string) => {
                if (collectionName === 'WordProgress') return wordProgressCollection;
                if (collectionName === 'QuizAttempt') return quizAttemptCollection;
                if (collectionName === 'QuizAnswer') return quizAnswerCollection;
                if (collectionName === 'QuizQuestion') return quizQuestionCollection;
                if (collectionName === 'Word') return wordCollection;
                return {
                    find: jest.fn().mockReturnThis(),
                    sort: jest.fn().mockReturnThis(),
                    limit: jest.fn().mockReturnThis(),
                    toArray: jest.fn().mockResolvedValue([])
                };
            });
            
            // Mock the AIService.generateRecommendations method
            jest.spyOn(AIService, 'generateRecommendations').mockResolvedValue(mockAIRecommendations);
            
            const recommendations = await AnalyticsService.getRecommendations(userId);
            
            // Verify the structure of the response
            expect(recommendations).toHaveProperty('focusAreas');
            expect(recommendations).toHaveProperty('recommendedWords');
            expect(recommendations).toHaveProperty('studyPlan');
            expect(recommendations).toHaveProperty('estimatedTime');
            
            // Verify the AI recommendations were merged with word details
            expect(recommendations.focusAreas).toEqual(['vocabulary_review', 'practice_questions']);
            expect(recommendations.recommendedWords).toEqual(mockRecommendedWords);
            expect(recommendations.studyPlan).toBe('Focus on reviewing difficult words with contextual examples');
            expect(recommendations.estimatedTime).toBe(30);
            
            // Verify the correct methods were called
            expect(wordProgressCollection.aggregate).toHaveBeenCalled();
            expect(quizAttemptCollection.find).toHaveBeenCalledWith({ userId });
            expect(quizAnswerCollection.find).toHaveBeenCalled();
            expect(quizQuestionCollection.findOne).toHaveBeenCalled();
            expect(AIService.generateRecommendations).toHaveBeenCalledWith(
                userId,
                expect.arrayContaining([
                    expect.objectContaining({
                        userId,
                        wordId: '507f1f77bcf86cd799439011',
                        mastery: 0.5,
                        reviewCount: 2,
                        streak: 1,
                        lastReviewed: lastReviewedDate,
                    }),
                    expect.objectContaining({
                        userId,
                        wordId: '507f1f77bcf86cd799439012',
                        mastery: 0.8,
                        reviewCount: 3,
                        streak: 2,
                        lastReviewed: lastReviewedDate,
                    })
                ]),
                expect.arrayContaining([
                    expect.objectContaining({wordId: "507f1f77bcf86cd799439012", score: 0}),
                    expect.objectContaining({wordId: "507f1f77bcf86cd799439011", score: 1})
                ])
            );
            
            // Verify word details were fetched for recommended words
            expect(wordCollection.find).toHaveBeenCalledWith({
                _id: {
                    $in: [
                        new ObjectId('507f1f77bcf86cd799439011'),
                        new ObjectId('507f1f77bcf86cd799439012')
                    ]
                }
            });
        });
        
        it('should handle empty recommendations gracefully', async () => {
            const userId = 'user123';
            
            // Mock empty user progress
            const wordProgressCollection = {
                aggregate: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue([])
            };
            
            // Mock empty quiz attempts
            const quizAttemptCollection = {
                find: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue([])
            };
            
            const wordCollection = {
                find: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue([])
            };
            
            mockDb.collection.mockImplementation((collectionName: string) => {
                if (collectionName === 'WordProgress') return wordProgressCollection;
                if (collectionName === 'QuizAttempt') return quizAttemptCollection;
                if (collectionName === 'Word') return wordCollection;
                return {
                    find: jest.fn().mockReturnThis(),
                    sort: jest.fn().mockReturnThis(),
                    limit: jest.fn().mockReturnThis(),
                    toArray: jest.fn().mockResolvedValue([])
                };
            });
            
            // Mock AI recommendations with no recommended words
            const mockAIRecommendations = {
                focusAreas: ['general_practice'],
                recommendedWords: [],
                studyPlan: 'Continue with regular study routine',
                estimatedTime: 20
            };
            
            jest.spyOn(AIService, 'generateRecommendations').mockResolvedValue(mockAIRecommendations);
            
            const recommendations = await AnalyticsService.getRecommendations(userId);
            
            // Verify the structure of the response
            expect(recommendations).toHaveProperty('focusAreas');
            expect(recommendations).toHaveProperty('recommendedWords');
            expect(recommendations).toHaveProperty('studyPlan');
            expect(recommendations).toHaveProperty('estimatedTime');
            
            // Verify empty recommendations
            expect(recommendations.focusAreas).toEqual(['general_practice']);
            expect(recommendations.recommendedWords).toEqual([]);
            expect(recommendations.studyPlan).toBe('Continue with regular study routine');
            expect(recommendations.estimatedTime).toBe(20);
            
            // Verify word collection was not called since there are no recommended words
            expect(wordCollection.find).not.toHaveBeenCalled();
        });
        
        it('should filter out invalid word IDs from recommendations', async () => {
            const userId = 'user123';
            
            // Mock empty user progress and attempts
            const emptyCollection = {
                find: jest.fn().mockReturnThis(),
                aggregate: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue([])
            };
            
            mockDb.collection.mockReturnValue(emptyCollection);
            
            // Mock AI recommendations with invalid word IDs
            const mockAIRecommendations = {
                focusAreas: ['vocabulary_review'],
                recommendedWords: [
                    '507f1f77bcf86cd799439011', // Valid ObjectId
                    'invalid-id', // Invalid ObjectId
                    '123', // Invalid ObjectId
                    '507f1f77bcf86cd799439012' // Valid ObjectId
                ],
                studyPlan: 'Review vocabulary',
                estimatedTime: 15
            };
            
            // Mock valid words
            const mockValidWords = [
                { _id: '507f1f77bcf86cd799439011', text: 'hello', translation: 'bonjour' },
                { _id: '507f1f77bcf86cd799439012', text: 'world', translation: 'monde' }
            ];
            
            const wordCollection = {
                find: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue(mockValidWords)
            };
            
            mockDb.collection.mockImplementation((collectionName: string) => {
                if (collectionName === 'Word') return wordCollection;
                return emptyCollection;
            });
            
            jest.spyOn(AIService, 'generateRecommendations').mockResolvedValue(mockAIRecommendations);
            
            const recommendations = await AnalyticsService.getRecommendations(userId);
            
            // Verify only valid word IDs were used to fetch words
            expect(wordCollection.find).toHaveBeenCalledWith({
                _id: {
                    $in: [
                        new ObjectId('507f1f77bcf86cd799439011'),
                        new ObjectId('507f1f77bcf86cd799439012')
                    ]
                }
            });
            
            // Verify only valid words were returned
            expect(recommendations.recommendedWords).toEqual(mockValidWords);
        });
    });
});
