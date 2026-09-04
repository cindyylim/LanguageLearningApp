import OpenAI from 'openai';
import { z } from 'zod';
import { ModerationError } from '../utils/moderation';
import {
  categorizeAIError,
  cleanJsonResponse,
  executeWithRetry,
  isRetryableAIError,
  isRetryableForErrorType,
  logAIMetrics,
  parseJsonWithSchema,
  toAIAppError,
} from './aiHelpers';
import { AppError } from '../utils/AppError';
import logger from '../utils/logger';

jest.mock('../utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('cleanJsonResponse', () => {
  it('strips markdown fences and optionally wraps as array', () => {
    expect(cleanJsonResponse('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(cleanJsonResponse('{"a":1}', true)).toBe('[{"a":1}]');
    expect(cleanJsonResponse('[{"a":1}]', true)).toBe('[{"a":1}]');
  });
});

describe('parseJsonWithSchema', () => {
  it('parses cleaned JSON and validates with schema', () => {
    const schema = z.object({ word: z.string() });
    const result = parseJsonWithSchema('```json\n{"word":"bonjour"}\n```', schema);
    expect(result).toEqual({ word: 'bonjour' });
  });
});

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

  it('does not retry OpenAI 401 authentication error', () => {
    const error = new OpenAI.AuthenticationError(401, {}, 'authentication error', {});
    expect(isRetryableAIError(error)).toBe(false);
    expect(categorizeAIError(error)).toBe('AUTHENTICATION_ERROR');
  });

  it('does not retry OpenAI 403 authorization error', () => {
    const error = new OpenAI.PermissionDeniedError(403, {}, 'authorization error', {});
    expect(isRetryableAIError(error)).toBe(false);
    expect(categorizeAIError(error)).toBe('AUTHORIZATION_ERROR');
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


  it('retries OpenAI connection timeout and network errors', () => {
    const timeoutError = new OpenAI.APIConnectionTimeoutError();
    const networkError = new OpenAI.APIConnectionError({ cause: new Error('offline') } as any);

    expect(categorizeAIError(timeoutError)).toBe('TIMEOUT_ERROR');
    expect(categorizeAIError(networkError)).toBe('NETWORK_ERROR');
    expect(isRetryableAIError(timeoutError)).toBe(true);
    expect(isRetryableAIError(networkError)).toBe(true);
  });

  it('categorizes message-based transient and auth errors', () => {
    expect(categorizeAIError(new Error('quota exceeded'))).toBe('RATE_LIMIT_ERROR');
    expect(categorizeAIError(new Error('request timeout'))).toBe('TIMEOUT_ERROR');
    expect(categorizeAIError(new Error('network failure ECONNREFUSED'))).toBe('NETWORK_ERROR');
    expect(categorizeAIError(new Error('Invalid API key provided'))).toBe('AUTHENTICATION_ERROR');
    expect(categorizeAIError(new Error('flagged by moderation'))).toBe('MODERATION_ERROR');
    expect(categorizeAIError(new Error('something else'))).toBe('UNKNOWN_ERROR');
  });

  it('returns false for unrecognized categorized error types', () => {
    expect(isRetryableForErrorType('FUTURE_ERROR')).toBe(false);
  });
});

describe('toAIAppError', () => {
  it('maps circuit open to 503', () => {
    const appError = toAIAppError(new Error('Circuit is OPEN.'));
    expect(appError.statusCode).toBe(503);
    expect(appError.message).toBe('AI service temporarily unavailable');
  });

  it('maps exhausted transient errors to 503', () => {
    let appError = toAIAppError(
      new OpenAI.RateLimitError(429, {}, 'rate limit', {}),
      'RATE_LIMIT_ERROR'
    );
    expect(appError.statusCode).toBe(503);
    appError = toAIAppError(
      new OpenAI.APIConnectionTimeoutError(), 
      'TIMEOUT_ERROR',
    );
    expect(appError.statusCode).toBe(503);
    appError = toAIAppError(
      new OpenAI.APIConnectionError({ cause: new Error('offline') } as any),
      'NETWORK_ERROR',
    );
    expect(appError.statusCode).toBe(503);
    appError = toAIAppError(
      new OpenAI.InternalServerError(500, {}, 'server error', {}),
      'SERVER_ERROR',
    );
    expect(appError.statusCode).toBe(503);
  });
  
  it('preserves moderation errors as 400', () => {
    const moderationError = new ModerationError('Input');
    const appError = toAIAppError(moderationError);
    expect(appError.statusCode).toBe(400);
    expect(appError).toBe(moderationError);
  });

  it('returns existing AppError unchanged', () => {
    const existing = new AppError('Already handled', 400);
    expect(toAIAppError(existing)).toBe(existing);
  });

  it('maps validation and bad request errors to 500', () => {
    let appError = toAIAppError(new SyntaxError('bad json'), 'JSON_PARSE_ERROR');
    expect(appError.message).toBe('AI response validation failed');
    expect(appError.statusCode).toBe(500);
    appError = toAIAppError(new z.ZodError([]), 'VALIDATION_ERROR');
    expect(appError.message).toBe('AI response validation failed');
    expect(appError.statusCode).toBe(500);
    appError = toAIAppError(new OpenAI.BadRequestError(400, {}, 'bad', {}), 'BAD_REQUEST_ERROR');
    expect(appError.message).toBe(
      'AI request failed'
    );
    expect(appError.statusCode).toBe(400);
  });

  it('maps authentication errors to 401', () => {
    let appError = toAIAppError(new OpenAI.AuthenticationError(401, {}, 'authentication error', {}));
    expect(appError.message).toBe('AI authentication failed');
    expect(appError.statusCode).toBe(401);
  });

  it('maps unknown errors to 503', () => {
    let appError = toAIAppError(new Error("unknown error"));
    expect(appError.message).toBe('AI service temporarily unavailable');
    expect(appError.statusCode).toBe(503);
  });

describe('logAIMetrics', () => {
  it('logs success and failure metrics', () => {
    const metrics = { operation: 'testOp', startTime: Date.now() - 50, retryCount: 1 };

    logAIMetrics(metrics);
    expect(logger.info).toHaveBeenCalledWith(
      'AI Operation Success: testOp',
      expect.objectContaining({ operation: 'testOp', retryCount: 1 })
    );

    logAIMetrics(metrics, new Error('failed'));
    expect(logger.error).toHaveBeenCalledWith(
      'AI Operation Failed: testOp',
      expect.objectContaining({ errorMessage: 'failed', operation: 'testOp', durationMs: expect.any(Number), retryCount: 1 })
    );
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

  it('returns successful result on first attempt', async () => {
    const runAttempt = jest.fn().mockResolvedValue(['ok']);
    const onSuccess = jest.fn();

    const result = await executeWithRetry({
      operation: 'testSuccess',
      maxRetries: 3,
      initialDelayMs: 1,
      runAttempt,
      onSuccess,
    });

    expect(result).toEqual(['ok']);
    expect(runAttempt).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(['ok'], 1, expect.any(Number));
  });

  it('rethrows moderation errors without retrying', async () => {
    const moderationError = new ModerationError('Input');
    const runAttempt = jest.fn().mockRejectedValue(moderationError);

    await expect(
      executeWithRetry({
        operation: 'testModeration',
        maxRetries: 3,
        initialDelayMs: 1,
        runAttempt,
      })
    ).rejects.toBe(moderationError);

    expect(runAttempt).toHaveBeenCalledTimes(1);
  });

  it('calls onMaxRetries after exhausting transient retries', async () => {
    const runAttempt = jest
      .fn()
      .mockRejectedValue(new OpenAI.InternalServerError(500, {}, 'server error', {}));
    const onMaxRetries = jest.fn().mockReturnValue('fallback');

    const result = await executeWithRetry({
      operation: 'testTransientFallback',
      maxRetries: 2,
      initialDelayMs: 1,
      runAttempt,
      onMaxRetries,
    });

    expect(result).toBe('fallback');
    expect(runAttempt).toHaveBeenCalledTimes(2);
    expect(onMaxRetries).toHaveBeenCalledWith(expect.any(OpenAI.InternalServerError), 'SERVER_ERROR');
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

  it('throws when maxRetries is zero and no attempt runs', async () => {
    await expect(
      executeWithRetry({
        operation: 'testZeroRetries',
        maxRetries: 0,
        initialDelayMs: 1,
        runAttempt: jest.fn(),
      })
    ).rejects.toThrow('Failed testZeroRetries due to unexpected flow.');
  });
});
});
