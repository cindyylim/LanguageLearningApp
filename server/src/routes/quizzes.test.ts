import request from 'supertest';
import express from 'express';
import { ObjectId } from 'mongodb';

const mockInvalidateListCache = jest.fn();

jest.mock('../services/quiz.service');
jest.mock('../utils/cache', () => ({
  invalidateListCache: mockInvalidateListCache,
}));
jest.mock('../middleware/rateLimit', () => ({
  createUserRateLimiter: () => (_req: any, _res: any, next: any) => next(),
}));

import quizRouter from './quizzes';
import { QuizService } from '../services/quiz.service';
import { authMiddleware } from '../middleware/auth';

const testApp = express();
testApp.use(express.json());
testApp.use((req: any, _res, next) => {
  req.id = 'test-request-id';
  req.user = { id: 'test-user-id' };
  next();
});
testApp.use('/api/quizzes', quizRouter);
testApp.use((err: any, _req: any, res: any, _next: any) => {
  if (err && err.statusCode) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  return res.status(500).json({ message: err?.message || 'Internal server error' });
});

const unauthenticatedApp = express();
unauthenticatedApp.use(express.json());
unauthenticatedApp.use('/api/quizzes', authMiddleware, quizRouter);

describe('Quiz API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/quizzes/generate', () => {
    it('should return 400 for an invalid vocabularyListId', async () => {
      const response = await request(testApp)
        .post('/api/quizzes/generate')
        .send({ vocabularyListId: 'not-an-object-id' })
        .expect(400);

      expect(response.body.message).toMatch(/vocabularyListId/i);
      expect(QuizService.generateQuiz).not.toHaveBeenCalled();
    });

    it('should generate a quiz for a valid vocabularyListId', async () => {
      const vocabularyListId = new ObjectId().toString();
      const mockQuiz = { _id: new ObjectId().toString(), title: 'Quiz' };
      (QuizService.generateQuiz as jest.Mock).mockResolvedValue({ quiz: mockQuiz, created: true });

      const response = await request(testApp)
        .post('/api/quizzes/generate')
        .send({ vocabularyListId, questionCount: 5, difficulty: 'easy' })
        .expect(201);

      expect(response.body).toEqual({ quiz: mockQuiz });
      expect(QuizService.generateQuiz).toHaveBeenCalledWith(
        vocabularyListId,
        { questionCount: 5, difficulty: 'easy' },
        'test-user-id',
        undefined
      );
    });

    it('should pass Idempotency-Key header to generateQuiz', async () => {
      const vocabularyListId = new ObjectId().toString();
      const mockQuiz = { _id: new ObjectId().toString(), title: 'Quiz' };
      (QuizService.generateQuiz as jest.Mock).mockResolvedValue({ quiz: mockQuiz, created: false });

      const response = await request(testApp)
        .post('/api/quizzes/generate')
        .set('Idempotency-Key', 'test-idempotency-key')
        .send({ vocabularyListId })
        .expect(200);

      expect(response.body).toEqual({ quiz: mockQuiz });
      expect(QuizService.generateQuiz).toHaveBeenCalledWith(
        vocabularyListId,
        expect.objectContaining({}),
        'test-user-id',
        'test-idempotency-key'
      );
    });

    it('should return 401 when not authenticated', async () => {
      const vocabularyListId = new ObjectId().toString();

      const response = await request(unauthenticatedApp)
        .post('/api/quizzes/generate')
        .send({ vocabularyListId })
        .expect(401);

      expect(response.body.error).toMatch(/token/i);
      expect(QuizService.generateQuiz).not.toHaveBeenCalled();
    });

    it('should return 404 when vocabulary list is not found', async () => {
      const vocabularyListId = new ObjectId().toString();
      (QuizService.generateQuiz as jest.Mock).mockResolvedValue(null);

      const response = await request(testApp)
        .post('/api/quizzes/generate')
        .send({ vocabularyListId })
        .expect(404);

      expect(response.body.message).toMatch(/vocabulary list not found/i);
    });
  });

  describe('GET /api/quizzes', () => {
    it('should return user quizzes', async () => {
      const mockQuizzes = [{ _id: new ObjectId().toString(), title: 'Quiz 1' }];
      (QuizService.getUserQuizzes as jest.Mock).mockResolvedValue(mockQuizzes);

      const response = await request(testApp).get('/api/quizzes').expect(200);

      expect(response.body).toEqual({ quizzes: mockQuizzes });
      expect(QuizService.getUserQuizzes).toHaveBeenCalledWith('test-user-id');
    });
  });

  describe('GET /api/quizzes/:id', () => {
    it('should return a quiz by id', async () => {
      const quizId = new ObjectId().toString();
      const mockQuiz = { _id: quizId, title: 'Quiz' };
      (QuizService.getQuizById as jest.Mock).mockResolvedValue(mockQuiz);

      const response = await request(testApp).get(`/api/quizzes/${quizId}`).expect(200);

      expect(response.body).toEqual({ quiz: mockQuiz });
      expect(QuizService.getQuizById).toHaveBeenCalledWith(quizId, 'test-user-id');
    });

    it('should return 404 when quiz is not found', async () => {
      const quizId = new ObjectId().toString();
      (QuizService.getQuizById as jest.Mock).mockResolvedValue(null);

      const response = await request(testApp).get(`/api/quizzes/${quizId}`).expect(404);

      expect(response.body.message).toMatch(/quiz not found/i);
    });
  });

  describe('POST /api/quizzes/:id/submit', () => {
    it('should invalidate vocabulary list cache after progress is updated', async () => {
      const quizId = new ObjectId().toString();
      const mockAttempt = { id: 'attempt1', score: 1, completed: true };
      (QuizService.submitQuizAnswers as jest.Mock).mockResolvedValue(mockAttempt);

      const response = await request(testApp)
        .post(`/api/quizzes/${quizId}/submit`)
        .send({ answers: [{ questionId: new ObjectId().toString(), answer: 'bonjour' }] })
        .expect(200);

      expect(response.body).toEqual({ attempt: mockAttempt });
      expect(mockInvalidateListCache).toHaveBeenCalledWith('test-user-id');
    });

    it('should not invalidate cache when the quiz is not found', async () => {
      const quizId = new ObjectId().toString();
      (QuizService.submitQuizAnswers as jest.Mock).mockResolvedValue(null);

      await request(testApp)
        .post(`/api/quizzes/${quizId}/submit`)
        .send({ answers: [{ questionId: new ObjectId().toString(), answer: 'bonjour' }] })
        .expect(404);

      expect(mockInvalidateListCache).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/quizzes/:id/results', () => {
    it('should return quiz results', async () => {
      const quizId = new ObjectId().toString();
      const mockResults = { _id: quizId, attempts: [{ score: 1 }] };
      (QuizService.getQuizResults as jest.Mock).mockResolvedValue(mockResults);

      const response = await request(testApp).get(`/api/quizzes/${quizId}/results`).expect(200);

      expect(response.body).toEqual({ quiz: mockResults });
      expect(QuizService.getQuizResults).toHaveBeenCalledWith(quizId, 'test-user-id');
    });

    it('should return 404 when quiz results are not found', async () => {
      const quizId = new ObjectId().toString();
      (QuizService.getQuizResults as jest.Mock).mockResolvedValue(null);

      const response = await request(testApp).get(`/api/quizzes/${quizId}/results`).expect(404);

      expect(response.body.message).toMatch(/quiz not found/i);
    });
  });
});
