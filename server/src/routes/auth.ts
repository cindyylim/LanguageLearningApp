import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { connectToDatabase } from '../utils/mongo';
import { ObjectId } from 'mongodb';
import { asyncHandler } from '../utils/asyncHandler';

interface jwtToken {
  userId: string;
}

const router = Router();

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
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, nativeLanguage, targetLanguage, proficiencyLevel } = registerSchema.parse(req.body);
  const db = await connectToDatabase();

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
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );

  // Set httpOnly cookie
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  return res.status(201).json({
    message: 'User registered successfully',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      nativeLanguage: user.nativeLanguage,
      targetLanguage: user.targetLanguage,
      proficiencyLevel: user.proficiencyLevel,
      createdAt: user.createdAt
    }
  });
}));

// Login user
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = loginSchema.parse(req.body);
  const db = await connectToDatabase();

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
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );

  // Set httpOnly cookie
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  return res.json({
    message: 'Login successful',
    user: {
      id: user._id.toString(),
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
  const decoded = jwt.verify(token, process.env.JWT_SECRET!) as jwtToken;
  const db = await connectToDatabase();
  const user = await db.collection('User').findOne({ _id: new ObjectId(decoded.userId) });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  return res.json({
    user: {
      id: user._id.toString(),
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
  res.clearCookie('token');
  return res.json({ message: 'Logged out successfully' });
}));

export default router; 