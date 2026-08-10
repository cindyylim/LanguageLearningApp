import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { connectToDatabase } from '../utils/mongo';
import { connectToTestDatabase } from '../utils/testMongo';
import { ObjectId } from 'mongodb';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import {
  extractAuthToken,
  getJwtSecret,
  signAuthToken,
} from '../utils/authToken';

interface jwtToken {
  userId: string;
}

const router: Router = Router();

// Validation schemas
const registerSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(8),
  nativeLanguage: z.string().optional().default('en'),
  targetLanguage: z.string().optional().default('es'),
  proficiencyLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional().default('beginner')
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

function authResponse(res: Response, token: string, user: Record<string, unknown>, message: string, status = 200) {
  return res.status(status).json({
    message,
    token,
    user,
  });
}

// Register new user
router.post('/register', validate(registerSchema), asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, nativeLanguage, targetLanguage, proficiencyLevel } = req.body;
  const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();

  const existingUser = await db.collection('User').findOne({ email });
  if (existingUser) {
    return res.status(400).json({ error: 'User already exists with this email' });
  }

  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  const userDoc = {
    name,
    email,
    password: hashedPassword,
    nativeLanguage,
    targetLanguage,
    proficiencyLevel,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await db.collection('User').insertOne(userDoc);
  const userId = result.insertedId.toString();
  const token = signAuthToken(userId);

  return authResponse(res, token, toPublicUser(userDoc), 'User registered successfully', 201);
}));

// Helper to get or create demo user
const getOrCreateDemoUser = async (db: any) => {
  const demoEmail = 'test@email.com';
  let user = await db.collection('User').findOne({ email: demoEmail });

  if (!user) {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash('12345678$', saltRounds);
    const demoUserDoc = {
      name: 'Demo Learner',
      email: demoEmail,
      password: hashedPassword,
      nativeLanguage: 'en',
      targetLanguage: 'es',
      proficiencyLevel: 'intermediate',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await db.collection('User').insertOne(demoUserDoc);
    user = { ...demoUserDoc, _id: result.insertedId };
  }
  return user;
};

function toPublicUser(user: Record<string, any>) {
  return {
    name: user.name,
    email: user.email,
    nativeLanguage: user.nativeLanguage,
    targetLanguage: user.targetLanguage,
    proficiencyLevel: user.proficiencyLevel,
    ...(user.createdAt ? { createdAt: user.createdAt } : {}),
  };
}

// Demo login endpoint
router.post('/demo', asyncHandler(async (req: Request, res: Response) => {
  const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();
  const user = await getOrCreateDemoUser(db);
  const token = signAuthToken(user._id.toString());

  return authResponse(res, token, toPublicUser(user), 'Demo login successful');
}));

// Login user
router.post('/login', validate(loginSchema), asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();

  if (email.toLowerCase() === 'test@email.com') {
    const user = await getOrCreateDemoUser(db);
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signAuthToken(user._id.toString());
    return authResponse(res, token, toPublicUser(user), 'Login successful');
  }

  const user = await db.collection('User').findOne({ email });
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signAuthToken(user._id.toString());
  return authResponse(res, token, toPublicUser(user), 'Login successful');
}));

// Get current user profile
router.get('/profile', asyncHandler(async (req: Request, res: Response) => {
  const token = extractAuthToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const decoded = jwt.verify(token, getJwtSecret()) as jwtToken;
  const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();
  const user = await db.collection('User').findOne({ _id: new ObjectId(decoded.userId) });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json({
    user: toPublicUser(user),
  });
}));

// Logout user
router.post('/logout', asyncHandler(async (_req: Request, res: Response) => {
  return res.json({ message: 'Logged out successfully' });
}));

export default router;
