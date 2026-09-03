import request from 'supertest';
import express from 'express';
import { ObjectId } from 'mongodb';

jest.mock('../utils/testDb');
jest.mock('../utils/testMongo');

import testDbRouter from './testDb';
import { cleanupTestData, resetTestDatabase, seedTestDatabase } from '../utils/testDb';
import { connectToTestDatabase } from '../utils/testMongo';

type MockCollection = {
  findOne: jest.Mock;
  find: jest.Mock;
  deleteMany: jest.Mock;
  deleteOne: jest.Mock;
};

function createTestDbApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/test-db', testDbRouter);
  app.use((err: any, _req: any, res: any, _next: any) => {
    return res.status(500).json({ message: err?.message || 'Internal server error' });
  });
  return app;
}

describe('Test DB API Endpoints', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let collections: Record<string, MockCollection>;
  let mockCollection: jest.Mock;

  function getCollection(name: string): MockCollection {
    if (!collections[name]) {
      collections[name] = {
        findOne: jest.fn(),
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([]),
        }),
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
        deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      };
    }
    return collections[name];
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    collections = {};

    mockCollection = jest.fn((name: string) => getCollection(name));
    (connectToTestDatabase as jest.Mock).mockResolvedValue({
      collection: mockCollection,
    });

    (seedTestDatabase as jest.Mock).mockResolvedValue(undefined);
    (cleanupTestData as jest.Mock).mockResolvedValue(undefined);
    (resetTestDatabase as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('returns 403 outside the test environment', async () => {
    process.env.NODE_ENV = 'production';
    const app = createTestDbApp();

    const response = await request(app).post('/api/test-db/seed').expect(403);

    expect(response.body.error).toBe('Test database endpoints are only available in test environment');
    expect(seedTestDatabase).not.toHaveBeenCalled();
  });

  it('seeds the test database', async () => {
    const app = createTestDbApp();

    const response = await request(app).post('/api/test-db/seed').expect(200);

    expect(response.body.message).toBe('Test database seeded successfully');
    expect(seedTestDatabase).toHaveBeenCalledTimes(1);
  });

  it('cleans up test data', async () => {
    const app = createTestDbApp();

    const response = await request(app).post('/api/test-db/cleanup').expect(200);

    expect(response.body.message).toBe('Test data cleaned up successfully');
    expect(cleanupTestData).toHaveBeenCalledTimes(1);
  });

  it('resets the test database', async () => {
    const app = createTestDbApp();

    const response = await request(app).post('/api/test-db/reset').expect(200);

    expect(response.body.message).toBe('Test database reset successfully');
    expect(resetTestDatabase).toHaveBeenCalledTimes(1);
  });

  describe('POST /api/test-db/delete-user', () => {
    it('returns 400 when email is missing', async () => {
      const app = createTestDbApp();

      const response = await request(app).post('/api/test-db/delete-user').send({}).expect(400);

      expect(response.body.error).toBe('Email is required');
    });

    it('returns 404 when the user does not exist', async () => {
      const app = createTestDbApp();
      getCollection('User').findOne.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/test-db/delete-user')
        .send({ email: 'missing@example.com' })
        .expect(404);

      expect(response.body.error).toBe('User not found');
      expect(getCollection('User').findOne).toHaveBeenCalledWith({ email: 'missing@example.com' });
    });

    it('deletes the user and related data', async () => {
      const app = createTestDbApp();
      const userId = new ObjectId();
      const vocabListId = new ObjectId();

      getCollection('User').findOne.mockResolvedValue({ _id: userId, email: 'user@example.com' });
      getCollection('VocabularyList').find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([{ _id: vocabListId }]),
      });

      const response = await request(app)
        .post('/api/test-db/delete-user')
        .send({ email: 'user@example.com' })
        .expect(200);

      expect(response.body.message).toBe('User deleted successfully');
      expect(getCollection('Word').deleteMany).toHaveBeenCalledWith({
        vocabularyListId: { $in: [vocabListId] },
      });
      expect(getCollection('VocabularyList').deleteMany).toHaveBeenCalledWith({
        userId: userId.toString(),
      });
      expect(getCollection('QuizAttempt').deleteMany).toHaveBeenCalledWith({
        userId: userId.toString(),
      });
      expect(getCollection('WordProgress').deleteMany).toHaveBeenCalledWith({
        userId: userId.toString(),
      });
      expect(getCollection('User').deleteOne).toHaveBeenCalledWith({ _id: userId });
    });
  });
});
