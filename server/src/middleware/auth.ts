import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { connectToDatabase } from '../utils/mongo';
import { ObjectId } from 'mongodb';

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
): Promise<any> => { // changed from Promise<void> to Promise<any>
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    // Verify user still exists in database (MongoDB)
    const db = await connectToDatabase();
    let user = null;
    try {
      user = await db.collection('User').findOne(
        { _id: new ObjectId(decoded.userId) },
        { projection: { _id: 1, email: 1, name: 1 } }
      );
    } catch {
      // fallback for string IDs (pre-migration tokens)
      user = await db.collection('User').findOne(
        { _id: decoded.userId },
        { projection: { _id: 1, email: 1, name: 1 } }
      );
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid token. User not found.' });
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name
    };
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
}; 