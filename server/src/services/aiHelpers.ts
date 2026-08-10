import { z } from 'zod';
import logger from '../utils/logger';
import { ModerationError } from '../utils/moderation';

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

export function categorizeAIError(error: unknown): string {
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
  if (errorMessage.includes('circuit breaker')) {
    return 'CIRCUIT_BREAKER_OPEN';
  }
  if (errorMessage.includes('flagged by moderation')) {
    return 'MODERATION_ERROR';
  }

  return 'UNKNOWN_ERROR';
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

      if (attempt === maxRetries) {
        logAIMetrics(metrics, err);
        if (onMaxRetries) {
          return onMaxRetries(error, errorType);
        }
        throw new Error(
          `Failed ${operation} after ${maxRetries} retries. Error type: ${errorType}`
        );
      }

      const delay = initialDelayMs * Math.pow(2, attempt - 1);
      logger.debug(`Retrying in ${delay}ms...`, { attempt, delay });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error(`Failed ${operation} due to unexpected flow.`);
}
