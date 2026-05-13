/**
 * Action Retry: Exponential backoff retry strategy for transient errors
 * Prevents temporary failures from blocking action execution
 *
 * CRITICAL: Some errors are transient and resolve on retry:
 * - Network timeouts (element loading delay)
 * - DOM not found (page still rendering)
 * - Content script dead (may reconnect)
 * - Connection resets
 *
 * Other errors are permanent and should fail fast:
 * - Invalid selector syntax
 * - Auth failures
 * - Critical operations (delete, submit, pay)
 */

export interface Action {
  type: string;
  selector?: string;
  [key: string]: any;
}

export interface ExecutionResult {
  success: boolean;
  error?: string;
  data?: any;
}

export interface ActionResult {
  action: Action;
  success: boolean;
  attempts: number;
  error?: string;
  lastError?: Error;
}

export interface RetryOptions {
  maxAttempts?: number;
  baseBackoffMs?: number;
  timeoutMs?: number;
  criticalActions?: string[]; // Actions that should never retry (delete, submit, pay)
}

/**
 * Error classification for retry logic
 */
interface ErrorClassification {
  isTransient: boolean;
  reason: string;
}

/**
 * Execute an action with exponential backoff retry strategy
 */
export async function executeActionWithRetry(
  action: Action,
  executor: (action: Action) => Promise<ExecutionResult>,
  options: RetryOptions = {}
): Promise<ActionResult> {
  const {
    maxAttempts = 3,
    baseBackoffMs = 100,
    timeoutMs = 30000,
    criticalActions = ['delete', 'submit', 'pay'],
  } = options;

  // Critical actions should never retry
  if (criticalActions.includes(action.type)) {
    try {
      const result = await executeWithTimeout(executor(action), timeoutMs);
      if (result.success) {
        return { action, success: true, attempts: 1 };
      } else {
        return {
          action,
          success: false,
          attempts: 1,
          error: result.error,
        };
      }
    } catch (error: any) {
      return {
        action,
        success: false,
        attempts: 1,
        error: error.message || 'Unknown error',
        lastError: error,
      };
    }
  }

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await executeWithTimeout(executor(action), timeoutMs);

      if (result.success) {
        return {
          action,
          success: true,
          attempts: attempt,
        };
      }

      // Check if error is transient
      const errorClassification = classifyError(result.error || 'Unknown error');
      if (!errorClassification.isTransient || attempt === maxAttempts) {
        return {
          action,
          success: false,
          attempts: attempt,
          error: result.error || 'Unknown error',
        };
      }

      // Transient error - wait and retry
      const backoffMs = calculateBackoff(attempt - 1, baseBackoffMs);
      await sleep(backoffMs);
    } catch (error: any) {
      lastError = error;

      // Classify the exception
      const errorClassification = classifyError(error.message || String(error));

      if (!errorClassification.isTransient || attempt === maxAttempts) {
        return {
          action,
          success: false,
          attempts: attempt,
          error: error.message || 'Unknown error',
          lastError: error,
        };
      }

      // Transient error - wait and retry
      const backoffMs = calculateBackoff(attempt - 1, baseBackoffMs);
      await sleep(backoffMs);
    }
  }

  return {
    action,
    success: false,
    attempts: maxAttempts,
    error: lastError?.message || 'Max attempts exceeded',
    lastError,
  };
}

// ============ PRIVATE HELPERS ============

/**
 * Classify error as transient or permanent
 */
function classifyError(error: string | Error): ErrorClassification {
  const errorStr = typeof error === 'string' ? error : error.message || '';
  const lowerError = errorStr.toLowerCase();

  // Transient errors that should be retried
  if (lowerError.includes('timeout') || lowerError.includes('timed out')) {
    return { isTransient: true, reason: 'Timeout error' };
  }

  if (lowerError.includes('econnreset') || lowerError.includes('connection reset')) {
    return { isTransient: true, reason: 'Connection reset' };
  }

  if (lowerError.includes('enotfound') || lowerError.includes('not found')) {
    // Element not found might be transient (page still loading)
    // But invalid selectors are permanent
    if (lowerError.includes('selector syntax') || lowerError.includes('invalid css')) {
      return { isTransient: false, reason: 'Invalid selector syntax' };
    }
    return { isTransient: true, reason: 'Element not found (may load on retry)' };
  }

  if (lowerError.includes('ehostunreach') || lowerError.includes('host unreachable')) {
    return { isTransient: true, reason: 'Host unreachable' };
  }

  if (lowerError.includes('content script') && lowerError.includes('dead')) {
    return { isTransient: true, reason: 'Content script disconnected' };
  }

  if (lowerError.includes('service worker') && lowerError.includes('suspend')) {
    return { isTransient: true, reason: 'Service worker suspended' };
  }

  if (lowerError.includes('network')) {
    return { isTransient: true, reason: 'Network error' };
  }

  // Permanent errors that should not be retried
  if (
    lowerError.includes('auth') ||
    lowerError.includes('unauthorized') ||
    lowerError.includes('forbidden')
  ) {
    return { isTransient: false, reason: 'Authentication/authorization failure' };
  }

  if (lowerError.includes('dom mismatch') || lowerError.includes('page changed')) {
    return { isTransient: false, reason: 'Page changed during execution' };
  }

  if (lowerError.includes('validation') || lowerError.includes('invalid')) {
    return { isTransient: false, reason: 'Validation error' };
  }

  // Unknown errors default to permanent (fail-fast)
  return { isTransient: false, reason: 'Unknown error type' };
}

/**
 * Calculate exponential backoff: baseMs * 2^attemptIndex
 * Examples:
 * - Attempt 0: 100ms
 * - Attempt 1: 200ms
 * - Attempt 2: 400ms
 */
function calculateBackoff(attemptIndex: number, baseBackoffMs: number): number {
  return baseBackoffMs * Math.pow(2, attemptIndex);
}

/**
 * Execute promise with timeout protection
 */
function executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get human-readable backoff strategy description
 */
export function getBackoffStrategy(
  maxAttempts: number = 3,
  baseBackoffMs: number = 100
): string {
  const backoffs = [];
  for (let i = 0; i < maxAttempts - 1; i++) {
    backoffs.push(`${calculateBackoff(i, baseBackoffMs)}ms`);
  }
  return `${maxAttempts} attempts with backoff: ${backoffs.join(', ')}`;
}
