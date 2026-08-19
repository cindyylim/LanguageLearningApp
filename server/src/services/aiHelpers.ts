import OpenAI from 'openai';
import { z } from 'zod';
import logger from '../utils/logger';
import { AppError } from '../utils/AppError';
import { ModerationError } from '../utils/moderation';

export type AIErrorType =
  | 'MODERATION_ERROR'
  | 'VALIDATION_ERROR'
  | 'JSON_PARSE_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'TIMEOUT_ERROR'
  | 'NETWORK_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'BAD_REQUEST_ERROR'
  | 'SERVER_ERROR'
  | 'CIRCUIT_BREAKER_OPEN'
  | 'UNKNOWN_ERROR';

export interface AIMetrics {
  operation: string;
  startTime: number;
  retryCount: number;
  errorType?: string;
  statusCode?: number;
  responseTimeMs?: number;
}

export function cleanJsonResponse(text: string, wrapAsArray = false): string {
  let cleaned = text.replace(/```[a-z]*\n?|```/gi, '').trim();
  if (wrapAsArray) {
    cleaned = cleaned.replace(/^\[?/, '[').replace(/\]?$/, ']');
  }
  return cleaned;
}

export function parseJsonWithSchema<T>(text: string, schema: z.ZodType<T>, wrapAsArray = false): T {
  const cleaned = cleanJsonResponse(text, wrapAsArray);
  const parsed = JSON.parse(cleaned);
  return schema.parse(parsed);
}

function getOpenAIStatus(error: unknown): number | undefined {
  if (error instanceof OpenAI.APIError && typeof error.status === 'number') {
    return error.status;
  }
  return undefined;
}

export function categorizeAIError(error: unknown): AIErrorType {
  if (error instanceof ModerationError) {
    return 'MODERATION_ERROR';
  }
  if (error instanceof z.ZodError) {
    return 'VALIDATION_ERROR';
  }
  if (error instanceof SyntaxError) {
    return 'JSON_PARSE_ERROR';
  }

  const errorMessage = error instanceof Error ? error.message : String(error);

  if (errorMessage.includes('Circuit is OPEN')) {
    return 'CIRCUIT_BREAKER_OPEN';
  }

  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return 'TIMEOUT_ERROR';
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return 'NETWORK_ERROR';
  }

  const status = getOpenAIStatus(error);
  if (status !== undefined) {
    if (status === 429) {
      return 'RATE_LIMIT_ERROR';
    }
    if (status === 401 || status === 403) {
      return 'AUTHENTICATION_ERROR';
    }
    if (status === 400) {
      return 'BAD_REQUEST_ERROR';
    }
    if (status >= 500) {
      return 'SERVER_ERROR';
    }
  }

  if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
    return 'RATE_LIMIT_ERROR';
  }
  if (errorMessage.includes('timeout')) {
    return 'TIMEOUT_ERROR';
  }
  if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
    return 'NETWORK_ERROR';
  }
  if (errorMessage.includes('API key')) {
    return 'AUTHENTICATION_ERROR';
  }
  if (errorMessage.includes('flagged by moderation')) {
    return 'MODERATION_ERROR';
  }

  return 'UNKNOWN_ERROR';
}

export function isRetryableForErrorType(errorType: string): boolean {
  switch (errorType) {
    case 'RATE_LIMIT_ERROR':
    case 'TIMEOUT_ERROR':
    case 'NETWORK_ERROR':
    case 'SERVER_ERROR':
      return true;
    case 'MODERATION_ERROR':
    case 'VALIDATION_ERROR':
    case 'JSON_PARSE_ERROR':
    case 'AUTHENTICATION_ERROR':
    case 'BAD_REQUEST_ERROR':
    case 'CIRCUIT_BREAKER_OPEN':
    case 'UNKNOWN_ERROR':
      return false;
    default:
      return false;
  }
}

export function isRetryableAIError(error: unknown): boolean {
  if (error instanceof ModerationError) {
    return false;
  }
  if (error instanceof z.ZodError) {
    return false;
  }
  if (error instanceof SyntaxError) {
    return false;
  }

  return isRetryableForErrorType(categorizeAIError(error));
}

export function toAIAppError(error: unknown, errorType?: AIErrorType): AppError {
  if (error instanceof ModerationError) {
    return error;
  }
  if (error instanceof AppError) {
    return error;
  }

  const type = errorType ?? categorizeAIError(error);

  switch (type) {
    case 'CIRCUIT_BREAKER_OPEN':
    case 'RATE_LIMIT_ERROR':
    case 'TIMEOUT_ERROR':
    case 'NETWORK_ERROR':
    case 'SERVER_ERROR':
      return new AppError('AI service temporarily unavailable', 503);
    case 'AUTHENTICATION_ERROR':
      const authMessage =
        process.env.NODE_ENV === 'production'
          ? 'AI service configuration error'
          : error instanceof Error
            ? error.message
            : String(error);
      return new AppError(authMessage, 503);
    case 'VALIDATION_ERROR':
    case 'JSON_PARSE_ERROR':
      return new AppError('AI response validation failed', 500);
    case 'BAD_REQUEST_ERROR':
      return new AppError('AI request failed', 500);
    case 'MODERATION_ERROR':
      return new ModerationError('Generated content');
    default:
      return new AppError('AI service temporarily unavailable', 503);
  }
}

export function logAIMetrics(metrics: AIMetrics, error?: Error): void {
  const logData = {
    operation: metrics.operation,
    durationMs: Date.now() - metrics.startTime,
    retryCount: metrics.retryCount,
    errorType: metrics.errorType,
    statusCode: metrics.statusCode,
    responseTimeMs: metrics.responseTimeMs,
  };

  if (error) {
    logger.error(`AI Operation Failed: ${metrics.operation}`, {
      ...logData,
      errorMessage: error.message,
      errorStack: error.stack,
    });
  } else {
    logger.info(`AI Operation Success: ${metrics.operation}`, logData);
  }
}

interface RetryConfig<T> {
  operation: string;
  maxRetries: number;
  initialDelayMs: number;
  runAttempt: () => Promise<T>;
  onSuccess?: (result: T, attempt: number, responseTimeMs: number) => void;
  onMaxRetries?: (error: unknown, errorType: string) => T;
}

export async function executeWithRetry<T>({
  operation,
  maxRetries,
  initialDelayMs,
  runAttempt,
  onSuccess,
  onMaxRetries,
}: RetryConfig<T>): Promise<T> {
  const metrics: AIMetrics = {
    operation,
    startTime: Date.now(),
    retryCount: 0,
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    metrics.retryCount = attempt - 1;
    const attemptStartTime = Date.now();

    try {
      logger.debug(`${operation} - Attempt ${attempt}/${maxRetries}`);
      const result = await runAttempt();
      metrics.responseTimeMs = Date.now() - attemptStartTime;
      logAIMetrics(metrics);
      onSuccess?.(result, attempt, metrics.responseTimeMs);
      return result;
    } catch (error) {
      const errorType = categorizeAIError(error);
      metrics.errorType = errorType;
      metrics.responseTimeMs = Date.now() - attemptStartTime;
      const err = error instanceof Error ? error : new Error(String(error));

      logger.warn(`${operation} attempt ${attempt} failed`, {
        attempt,
        maxRetries,
        errorType,
        errorMessage: err.message,
        responseTimeMs: metrics.responseTimeMs,
      });

      if (errorType === 'MODERATION_ERROR') {
        logAIMetrics(metrics, err);
        throw err;
      }

      if (!isRetryableAIError(error)) {
        logAIMetrics(metrics, err);
        if (onMaxRetries) {
          return onMaxRetries(error, errorType);
        }
        throw toAIAppError(error, errorType);
      }

      if (attempt === maxRetries) {
        logAIMetrics(metrics, err);
        if (onMaxRetries) {
          return onMaxRetries(error, errorType);
        }
        throw toAIAppError(error, errorType);
      }

      const delay = initialDelayMs * Math.pow(2, attempt - 1);
      logger.debug(`Retrying in ${delay}ms...`, { attempt, delay });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error(`Failed ${operation} due to unexpected flow.`);
}
