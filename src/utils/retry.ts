import { GitHubAPIError, NetworkError } from "../errors/index.js";
import { logger } from "./logging.js";

export interface RetryOptions {
  /** Solo es seguro en operaciones idempotentes: una escritura pudo aplicarse aunque falle la respuesta. */
  retryTransientErrors?: boolean;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function isRateLimited(error: unknown): error is GitHubAPIError {
  return error instanceof GitHubAPIError && error.rateLimited;
}

function isTransient(error: unknown): boolean {
  return error instanceof NetworkError || (error instanceof GitHubAPIError && error.status >= 500);
}

function computeBackoff(attempt: number, baseDelayMs: number): number {
  return baseDelayMs * 2 ** (attempt - 1) + Math.random() * baseDelayMs;
}

export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retryTransientErrors = false, maxAttempts = 3, baseDelayMs = 1_000, maxDelayMs = 30_000 } = options;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const retryable = isRateLimited(error) || (retryTransientErrors && isTransient(error));
      if (!retryable || attempt >= maxAttempts) {
        throw error;
      }

      const requestedDelayMs = isRateLimited(error) ? (error.retryAfterMs ?? 0) : 0;
      const delayMs = Math.max(requestedDelayMs, computeBackoff(attempt, baseDelayMs));
      if (delayMs > maxDelayMs) {
        throw error;
      }

      logger.warn("Reintentando solicitud a GitHub", { attempt, delayMs: Math.round(delayMs) });
      await sleep(delayMs);
    }
  }
}
