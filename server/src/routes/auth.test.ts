import request from 'supertest';
import express from 'express';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';

jest.mock('../utils/testMongo');
jest.mock('../utils/mongo');
jest.mock('bcryptjs');

import authRouter from './auth';
import { connectToTestDatabase } from '../utils/testMongo';
import { signAuthToken } from '../utils/authToken';

function createAuthApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use((err: any, _req: any, res: any, _next: any) => {
    if (err?.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    return res.status(500).json({ message: err?.message || 'Internal server error' });
  });
  return app;
}

describe('Auth API Endpoints', () => {
  const app = createAuthApp();
  let mockFindOne: jest.Mock;
  let mockInsertOne: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    process.env.NODE_ENV = 'test';

    mockFindOne = jest.fn();
    mockInsertOne = jest.fn();
    (connectToTestDatabase as jest.Mock).mockResolvedValue({
      collection: jest.fn(() => ({
        findOne: mockFindOne,
        insertOne: mockInsertOne,
      })),
    });
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  });

  describe('POST /api/auth/register', () => {
    it('registers a new user', async () => {
      const userId = new ObjectId();
      mockFindOne.mockResolvedValue(null);
      mockInsertOne.mockResolvedValue({ insertedId: userId });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Jane Doe',
          email: 'Jane@Example.com',
          password: 'password123',
          nativeLanguage: 'en',
          targetLanguage: 'fr',
          proficiencyLevel: 'beginner',
        })
        .expect(201);

      expect(response.body.message).toBe('User registered successfully');
      expect(response.body.token).toBeDefined();
      expect(response.body.user).toEqual({
        name: 'Jane Doe',
        email: 'jane@example.com',
        nativeLanguage: 'en',
        targetLanguage: 'fr',
        proficiencyLevel: 'beginner',
        createdAt: expect.any(String),
      });
      expect(mockInsertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'hashed-password',
          nativeLanguage: 'en',
          targetLanguage: 'fr',
          proficiencyLevel: 'beginner',
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
      );
    });

    it('returns 400 when the email is already registered', async () => {
      mockFindOne.mockResolvedValue({ email: 'jane@example.com' });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'password123',
          nativeLanguage: 'en',
          targetLanguage: 'fr',
          proficiencyLevel: 'beginner',
        })
        .expect(400);

      expect(response.body.error).toBe('User already exists with this email');
      expect(mockInsertOne).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Jane Doe',
          email: 'not-an-email',
          password: 'short',
          nativeLanguage: 'en',
          targetLanguage: 'fr',
          proficiencyLevel: 'beginner',
        })
        .expect(400);

      expect(response.body.message).toContain('Validation error');
    });

    it('returns 400 for invalid password length', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Jane Doe',
          email: 'jane@email.com',
          password: 'short',
          nativeLanguage: 'en',
          targetLanguage: 'fr',
          proficiencyLevel: 'beginner',
        })
        .expect(400);

      expect(response.body.message).toContain('Validation error');
    });

    it('returns 400 for invalid name', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'J',
          email: 'jane@email.com',
          password: 'password123',
          nativeLanguage: 'en',
          targetLanguage: 'fr',
          proficiencyLevel: 'beginner',
        })
        .expect(400);

      expect(response.body.message).toContain('Validation error');
    });

    it('returns 400 for null native language', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'J',
          email: 'jane@email.com',
          password: 'password123',
          targetLanguage: 'fr',
          proficiencyLevel: 'beginner',
        })
        .expect(400);

      expect(response.body.message).toContain('Validation error');
    });

    it('returns 400 for null target language', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'J',
          email: 'jane@email.com',
          password: 'password123',
          nativeLanguage: 'fr',
          proficiencyLevel: 'beginner',
        })
        .expect(400);

      expect(response.body.message).toContain('Validation error');
    });

    it('returns 400 for null proficiency level', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'J',
          email: 'jane@email.com',
          password: 'password123',
          nativeLanguage: 'fr',
          targetLangugae: 'en',
        })
        .expect(400);

      expect(response.body.message).toContain('Validation error');
    });
  });

  describe('POST /api/auth/login', () => {
    it('logs in with valid credentials', async () => {
      const userId = new ObjectId();
      mockFindOne.mockResolvedValue({
        _id: userId,
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'hashed-password',
        nativeLanguage: 'en',
        targetLanguage: 'fr',
        proficiencyLevel: 'beginner',
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'jane@example.com',
          password: 'password123',
        })
        .expect(200);

      expect(response.body.message).toBe('Login successful');
      expect(response.body.token).toBeDefined();
      expect(response.body.user.email).toBe('jane@example.com');
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashed-password');
    });

    it('returns 401 for invalid credentials', async () => {
      mockFindOne.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'missing@example.com',
          password: 'password123',
        })
        .expect(401);

      expect(response.body.error).toBe('Invalid email or password');
    });

    it('returns 401 for wrong password', async () => {
      const userId = new ObjectId();

      mockFindOne.mockResolvedValue({
        _id: userId,
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'hashed-password',
        nativeLanguage: 'en',
        targetLanguage: 'fr',
        proficiencyLevel: 'beginner',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false)

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'jane@example.com',
          password: 'password123',
        })
        .expect(401);

      expect(response.body.error).toBe('Invalid email or password');
    });

    it('creates demo learner if not found', async () => {
      const userId = new ObjectId();
      mockFindOne.mockResolvedValue(null);
      mockInsertOne.mockResolvedValue({ insertedId: userId });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@email.com',
          password: '12345678$',
        })
        .expect(200);
      expect(mockInsertOne).toHaveBeenCalledWith( 
        expect.objectContaining({
          name: 'Demo Learner',
          email: 'test@email.com',
          password: 'hashed-password',
          nativeLanguage: 'en',
          targetLanguage: 'es',
          proficiencyLevel: 'intermediate',
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
      );
      expect(response.body.token).toBeDefined();
      expect(response.body.user.email).toBe('test@email.com');
    });
  });

  describe('POST /api/auth/demo', () => {
    it('returns a demo user token', async () => {
      const userId = new ObjectId();
      mockFindOne.mockResolvedValue({
        _id: userId,
        name: 'Demo Learner',
        email: 'test@email.com',
        nativeLanguage: 'en',
        targetLanguage: 'es',
        proficiencyLevel: 'intermediate',
      });

      const response = await request(app).post('/api/auth/demo').expect(200);

      expect(response.body.message).toBe('Demo login successful');
      expect(response.body.user.email).toBe('test@email.com');
      expect(response.body.token).toBeDefined();
    });
  });

  describe('GET /api/auth/profile', () => {
    it('returns 401 when no token is provided', async () => {
      const response = await request(app).get('/api/auth/profile').expect(401);

      expect(response.body.error).toBe('Access denied. No token provided.');
    });

    it('returns 404 when the user is not found', async () => {
      const userId = new ObjectId().toString();
      const token = signAuthToken(userId);
      mockFindOne.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.error).toBe('User not found');
    });

    it('returns the authenticated user profile', async () => {
      const userId = new ObjectId();
      const token = signAuthToken(userId.toString());
      mockFindOne.mockResolvedValue({
        _id: userId,
        name: 'Jane Doe',
        email: 'jane@example.com',
        nativeLanguage: 'en',
        targetLanguage: 'fr',
        proficiencyLevel: 'beginner',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      });

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.user).toEqual({
        name: 'Jane Doe',
        email: 'jane@example.com',
        nativeLanguage: 'en',
        targetLanguage: 'fr',
        proficiencyLevel: 'beginner',
        createdAt: '2024-01-01T00:00:00.000Z',
      });
    });
  });

  describe('POST /api/auth/logout', () => {
    it('returns a logout success message', async () => {
      const response = await request(app).post('/api/auth/logout').expect(200);

      expect(response.body.message).toBe('Logged out successfully');
    });
  });
});
