import { Request } from 'express';
import jwt from 'jsonwebtoken';

const JWT_EXPIRY = '7d';

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    return secret;
  }

  throw new Error('JWT_SECRET environment variable is required');
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
