import jwt from 'jsonwebtoken';
import { extractAuthToken, getJwtSecret, signAuthToken } from './authToken';

describe('authToken', () => {
  const originalSecret = process.env.JWT_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  it('throws when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;

    expect(() => getJwtSecret()).toThrow('JWT_SECRET environment variable is required');
  });

  it('signs auth tokens with configured secret', () => {
    process.env.JWT_SECRET = 'test-secret-key';

    const token = signAuthToken('user-123');
    const decoded = jwt.verify(token, 'test-secret-key') as { userId: string };

    expect(decoded.userId).toBe('user-123');
  });

  it('extracts bearer tokens from authorization header', () => {
    expect(
      extractAuthToken({ headers: { authorization: 'Bearer abc.def.ghi' } } as any)
    ).toBe('abc.def.ghi');
    expect(extractAuthToken({ headers: {} } as any)).toBeUndefined();
  });
});
