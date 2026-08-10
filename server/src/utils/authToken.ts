import { Request } from 'express';
import jwt from 'jsonwebtoken';

const JWT_EXPIRY = '7d';

export function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'language_learning_jwt_secret_key_2026';
}

export function signAuthToken(userId: string): string {
  return jwt.sign({ userId }, getJwtSecret(), { expiresIn: JWT_EXPIRY });
}

export function extractAuthToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return undefined;
}
