import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { connectToDatabase } from '../utils/mongo';
import { ObjectId } from 'mongodb';

const router = Router();

// Validation schemas
const registerSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(6),
  nativeLanguage: z.string().optional().default('en'),
  targetLanguage: z.string().optional().default('es'),
  proficiencyLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional().default('beginner')
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

// Register new user
router.post('/register', async (req: Request, res: Response) => {
  try {
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
      },
      token
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Login user
router.post('/login', async (req: Request, res: Response) => {
  try {
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

    return res.json({
      message: 'Login successful',
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        nativeLanguage: user.nativeLanguage,
        targetLanguage: user.targetLanguage,
        proficiencyLevel: user.proficiencyLevel
      },
      token
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user profile
router.get('/profile', async (req: Request, res: Response) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    const db = await connectToDatabase();
    const user = await db.collection('User').findOne({ _id: new ObjectId(decoded.userId) });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({ user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      nativeLanguage: user.nativeLanguage,
      targetLanguage: user.targetLanguage,
      proficiencyLevel: user.proficiencyLevel,
      createdAt: user.createdAt
    }});
  } catch (error) {
    console.error('Profile error:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
});

export default router; 