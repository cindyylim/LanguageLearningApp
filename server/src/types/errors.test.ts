import { getErrorMessage, isJWTError, isMongoError } from './errors';

describe('error type guards', () => {
  it('identifies Mongo CastError and ValidationError', () => {
    const castError = new Error('Cast failed') as Error & { name: string };
    castError.name = 'CastError';
    const validationError = new Error('Validation failed') as Error & { name: string };
    validationError.name = 'ValidationError';
    const genericError = new Error('Other');

    expect(isMongoError(castError)).toBe(true);
    expect(isMongoError(validationError)).toBe(true);
    expect(isMongoError(genericError)).toBe(false);
    expect(isMongoError('not an error')).toBe(false);
  });

  it('identifies JWT errors', () => {
    const jwtError = new Error('Invalid token') as Error & { name: string };
    jwtError.name = 'JsonWebTokenError';
    const expiredError = new Error('Expired') as Error & { name: string };
    expiredError.name = 'TokenExpiredError';

    expect(isJWTError(jwtError)).toBe(true);
    expect(isJWTError(expiredError)).toBe(true);
    expect(isJWTError(new Error('Other'))).toBe(false);
  });
});

describe('getErrorMessage', () => {
  it('returns message from Error instances', () => {
    expect(getErrorMessage(new Error('Something broke'))).toBe('Something broke');
  });

  it('returns string errors as-is', () => {
    expect(getErrorMessage('plain string error')).toBe('plain string error');
  });

  it('returns fallback message for unknown error shapes', () => {
    expect(getErrorMessage({ code: 500 })).toBe('An unknown error occurred');
    expect(getErrorMessage(null)).toBe('An unknown error occurred');
  });
});
