import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { Db } from 'mongodb';
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

const registerSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(8),
  nativeLanguage: z.string().optional().default('en'),
  targetLanguage: z.string().optional().default('es'),
  proficiencyLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional().default('beginner'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const DEMO_EMAIL = 'test@email.com';
const DEMO_PASSWORD = '12345678$';

async function getDb(): Promise<Db> {
  return process.env.NODE_ENV === 'test'
    ? await connectToTestDatabase()
    : await connectToDatabase();
}

function authResponse(
  res: Response,
  token: string,
  user: Record<string, unknown>,
  message: string,
  status = 200
) {
  return res.status(status).json({
    message,
    token,
    user,
  });
}

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

const getOrCreateDemoUser = async (db: Db) => {
  let user = await db.collection('User').findOne({ email: DEMO_EMAIL });

  if (!user) {
    const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);
    const demoUserDoc = {
      name: 'Demo Learner',
      email: DEMO_EMAIL,
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

async function authenticateWithPassword(db: Db, email: string, password: string) {
  const normalizedEmail = email.toLowerCase();
  const user =
    normalizedEmail === DEMO_EMAIL
      ? await getOrCreateDemoUser(db)
      : await db.collection('User').findOne({ email });

  if (!user) {
    return null;
  }

  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    return null;
  }

  return user;
}

router.post('/register', validate(registerSchema), asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, nativeLanguage, targetLanguage, proficiencyLevel } = req.body;
  const db = await getDb();

  const existingUser = await db.collection('User').findOne({ email });
  if (existingUser) {
    return res.status(400).json({ error: 'User already exists with this email' });
  }

  const hashedPassword = await bcrypt.hash(password, 12);

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

router.post('/demo', asyncHandler(async (_req: Request, res: Response) => {
  const db = await getDb();
  const user = await getOrCreateDemoUser(db);
  const token = signAuthToken(user._id.toString());

  return authResponse(res, token, toPublicUser(user), 'Demo login successful');
}));

router.post('/login', validate(loginSchema), asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const db = await getDb();
  const user = await authenticateWithPassword(db, email, password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signAuthToken(user._id.toString());
  return authResponse(res, token, toPublicUser(user), 'Login successful');
}));

router.get('/profile', asyncHandler(async (req: Request, res: Response) => {
  const token = extractAuthToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const decoded = jwt.verify(token, getJwtSecret()) as jwtToken;
  const db = await getDb();
  const user = await db.collection('User').findOne({ _id: new ObjectId(decoded.userId) });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json({
    user: toPublicUser(user),
  });
}));

router.post('/logout', asyncHandler(async (_req: Request, res: Response) => {
  return res.json({ message: 'Logged out successfully' });
}));

export default router;
