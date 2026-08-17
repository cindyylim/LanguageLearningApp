import OpenAI from 'openai';
import { z } from 'zod';
import { ModerationError } from '../utils/moderation';
import {
  categorizeAIError,
  executeWithRetry,
  isRetryableAIError,
  toAIAppError,
} from './aiHelpers';

jest.mock('../utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('isRetryableAIError', () => {
  it('retries OpenAI 429 rate limit errors', () => {
    const error = new OpenAI.RateLimitError(429, {}, 'rate limit', {});
    expect(isRetryableAIError(error)).toBe(true);
    expect(categorizeAIError(error)).toBe('RATE_LIMIT_ERROR');
  });

  it('retries OpenAI 500 server errors', () => {
    const error = new OpenAI.InternalServerError(500, {}, 'server error', {});
    expect(isRetryableAIError(error)).toBe(true);
    expect(categorizeAIError(error)).toBe('SERVER_ERROR');
  });

  it('does not retry OpenAI 400 bad request', () => {
    const error = new OpenAI.BadRequestError(400, {}, 'bad request', {});
    expect(isRetryableAIError(error)).toBe(false);
    expect(categorizeAIError(error)).toBe('BAD_REQUEST_ERROR');
  });

  it('does not retry Zod validation errors', () => {
    const error = z.string().safeParse(123).error;
    expect(isRetryableAIError(error)).toBe(false);
    expect(categorizeAIError(error)).toBe('VALIDATION_ERROR');
  });

  it('does not retry moderation errors', () => {
    const error = new ModerationError('Input');
    expect(isRetryableAIError(error)).toBe(false);
    expect(categorizeAIError(error)).toBe('MODERATION_ERROR');
  });

  it('does not retry circuit breaker open errors', () => {
    const error = new Error('Circuit is OPEN');
    expect(isRetryableAIError(error)).toBe(false);
    expect(categorizeAIError(error)).toBe('CIRCUIT_BREAKER_OPEN');
  });

  it('does not retry JSON parse errors', () => {
    const error = new SyntaxError('Unexpected token');
    expect(isRetryableAIError(error)).toBe(false);
    expect(categorizeAIError(error)).toBe('JSON_PARSE_ERROR');
  });

  it('does not retry authentication errors', () => {
    const error = new OpenAI.AuthenticationError(401, {}, 'invalid API key', {});
    expect(isRetryableAIError(error)).toBe(false);
    expect(categorizeAIError(error)).toBe('AUTHENTICATION_ERROR');
  });
});

describe('toAIAppError', () => {
  it('maps circuit open to 503', () => {
    const appError = toAIAppError(new Error('Circuit is OPEN.'));
    expect(appError.statusCode).toBe(503);
    expect(appError.message).toBe('AI service temporarily unavailable');
  });

  it('maps exhausted transient errors to 503', () => {
    const appError = toAIAppError(
      new OpenAI.RateLimitError(429, {}, 'rate limit', {}),
      'RATE_LIMIT_ERROR'
    );
    expect(appError.statusCode).toBe(503);
  });

  it('preserves moderation errors as 400', () => {
    const moderationError = new ModerationError('Input');
    const appError = toAIAppError(moderationError);
    expect(appError.statusCode).toBe(400);
    expect(appError).toBe(moderationError);
  });
});

describe('executeWithRetry', () => {
  it('does not retry permanent validation errors', async () => {
    const runAttempt = jest
      .fn()
      .mockRejectedValue(z.string().safeParse(123).error);

    await expect(
      executeWithRetry({
        operation: 'testValidation',
        maxRetries: 3,
        initialDelayMs: 10,
        runAttempt,
      })
    ).rejects.toMatchObject({ statusCode: 500, message: 'AI response validation failed' });

    expect(runAttempt).toHaveBeenCalledTimes(1);
  });

  it('retries transient errors until maxRetries', async () => {
    const runAttempt = jest
      .fn()
      .mockRejectedValue(new OpenAI.InternalServerError(500, {}, 'server error', {}));

    await expect(
      executeWithRetry({
        operation: 'testTransient',
        maxRetries: 3,
        initialDelayMs: 1,
        runAttempt,
      })
    ).rejects.toMatchObject({ statusCode: 503 });

    expect(runAttempt).toHaveBeenCalledTimes(3);
  });

  it('calls onMaxRetries immediately for permanent errors', async () => {
    const runAttempt = jest
      .fn()
      .mockRejectedValue(new OpenAI.BadRequestError(400, {}, 'bad request', {}));
    const onMaxRetries = jest.fn().mockReturnValue([]);

    const result = await executeWithRetry({
      operation: 'testOnMaxRetries',
      maxRetries: 3,
      initialDelayMs: 1,
      runAttempt,
      onMaxRetries,
    });

    expect(result).toEqual([]);
    expect(runAttempt).toHaveBeenCalledTimes(1);
    expect(onMaxRetries).toHaveBeenCalledWith(
      expect.any(OpenAI.BadRequestError),
      'BAD_REQUEST_ERROR'
    );
  });
});
