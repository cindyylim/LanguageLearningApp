import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { connectToDatabase } from '../utils/mongo';
import { connectToTestDatabase } from '../utils/testMongo';
import { ObjectId } from 'mongodb';
import logger from '../utils/logger';

interface JwtPayload {
  userId: string;
  iat: number;
  exp: number;
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {

    const token = req.cookies?.token;

    if (!token) {
      res.status(401).json({ error: 'Access denied. No token provided.' });
      return;
    }


    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;

    const db = process.env.NODE_ENV === 'test' ? await connectToTestDatabase() : await connectToDatabase();

    const user = await db.collection('User').findOne(
      { _id: new ObjectId(decoded.userId) },
      { projection: { _id: 1, email: 1, name: 1 } }
    );

    if (!user) {
      res.status(401).json({ error: 'Invalid token. User not found.' });
      return;
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name
    };

    next();
  } catch (error) {
    const log = req.logger || logger;
    log.error('Authentication error:', { error });
    res.status(401).json({ error: 'Invalid token.' });
  }
};