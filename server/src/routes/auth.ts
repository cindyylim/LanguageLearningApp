import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { connectToDatabase } from '../utils/mongo';
import { connectToTestDatabase } from '../utils/testMongo';
import { ObjectId } from 'mongodb';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';

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

// Register new user
router.post('/register', validate(registerSchema), asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, nativeLanguage, targetLanguage, proficiencyLevel } = req.body;
  // Use test database in test environment, main database otherwise
  const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();

  // Check if user already exists
  const existingUser = await db.collection('User').findOne({ email });
  if (existingUser) {
    return res.status(400).json({ error: 'User already exists with this email' });
  }

  // Hash password
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // Create user
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
  const user = { ...userDoc, id: result.insertedId.toString() };

  // Generate JWT token
  const token = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET || 'jwt-secret',
    { expiresIn: '7d' }
  );

  // Set httpOnly cookie
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  return res.status(201).json({
    message: 'User registered successfully',
    user: {
      name: user.name,
      email: user.email,
      nativeLanguage: user.nativeLanguage,
      targetLanguage: user.targetLanguage,
      proficiencyLevel: user.proficiencyLevel,
      createdAt: user.createdAt
    }
  });
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

// Demo login endpoint
router.post('/demo', asyncHandler(async (req: Request, res: Response) => {
  const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();
  const user = await getOrCreateDemoUser(db);

  const token = jwt.sign(
    { userId: user._id.toString() },
    process.env.JWT_SECRET || 'language_learning_jwt_secret_key_2026',
    { expiresIn: '7d' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  return res.json({
    message: 'Demo login successful',
    user: {
      name: user.name,
      email: user.email,
      nativeLanguage: user.nativeLanguage,
      targetLanguage: user.targetLanguage,
      proficiencyLevel: user.proficiencyLevel
    }
  });
}));

// Login user
router.post('/login', validate(loginSchema), asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  // Use test database in test environment, main database otherwise
  const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();

  // Handle demo account login specifically if email is demo email
  if (email.toLowerCase() === 'test@email.com') {
    const user = await getOrCreateDemoUser(db);
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_SECRET || 'language_learning_jwt_secret_key_2026',
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({
      message: 'Login successful',
      user: {
        name: user.name,
        email: user.email,
        nativeLanguage: user.nativeLanguage,
        targetLanguage: user.targetLanguage,
        proficiencyLevel: user.proficiencyLevel
      }
    });
  }

  // Find user
  const user = await db.collection('User').findOne({ email });
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Generate JWT token
  const token = jwt.sign(
    { userId: user._id.toString() },
    process.env.JWT_SECRET || 'language_learning_jwt_secret_key_2026',
    { expiresIn: '7d' }
  );

  // Set httpOnly cookie
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  return res.json({
    message: 'Login successful',
    user: {
      name: user.name,
      email: user.email,
      nativeLanguage: user.nativeLanguage,
      targetLanguage: user.targetLanguage,
      proficiencyLevel: user.proficiencyLevel
    }
  });
}));

// Get current user profile
router.get('/profile', asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'language_learning_jwt_secret_key_2026') as jwtToken;
  // Use test database in test environment, main database otherwise
  const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();
  const user = await db.collection('User').findOne({ _id: new ObjectId(decoded.userId) });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  return res.json({
    user: {
      name: user.name,
      email: user.email,
      nativeLanguage: user.nativeLanguage,
      targetLanguage: user.targetLanguage,
      proficiencyLevel: user.proficiencyLevel,
      createdAt: user.createdAt
    }
  });
}));

// Logout user
router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
  });
  return res.json({ message: 'Logged out successfully' });
}));

export default router; 