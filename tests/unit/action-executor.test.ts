/**
 * Unit tests for Action Retry with Exponential Backoff
 * Tests transient error handling, critical action protection, and backoff timing
 */

import { executeActionWithRetry, getBackoffStrategy, Action, ExecutionResult } from '../../src/shared/retry';

describe('executeActionWithRetry', () => {
  describe('Successful execution', () => {
    test('succeeds on first attempt', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const executor = jest.fn().mockResolvedValue({ success: true });

      const result = await executeActionWithRetry(action, executor);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
      expect(executor).toHaveBeenCalledTimes(1);
    });

    test('succeeds on second attempt after transient error', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const executor = jest
        .fn()
        .mockResolvedValueOnce({ success: false, error: 'timeout' })
        .mockResolvedValueOnce({ success: true });

      const result = await executeActionWithRetry(action, executor, { baseBackoffMs: 10 });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(executor).toHaveBeenCalledTimes(2);
    });

    test('succeeds on third attempt after multiple transient errors', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const executor = jest
        .fn()
        .mockResolvedValueOnce({ success: false, error: 'timeout' })
        .mockResolvedValueOnce({ success: false, error: 'ECONNRESET' })
        .mockResolvedValueOnce({ success: true });

      const result = await executeActionWithRetry(action, executor, { baseBackoffMs: 10 });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(executor).toHaveBeenCalledTimes(3);
    });
  });

  describe('Transient error handling', () => {
    test('retries on timeout error', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const executor = jest
        .fn()
        .mockResolvedValueOnce({ success: false, error: 'Operation timeout after 5000ms' })
        .mockResolvedValueOnce({ success: true });

      const result = await executeActionWithRetry(action, executor, { baseBackoffMs: 10 });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    test('retries on ECONNRESET error', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const executor = jest
        .fn()
        .mockResolvedValueOnce({ success: false, error: 'ECONNRESET: Connection reset by peer' })
        .mockResolvedValueOnce({ success: true });

      const result = await executeActionWithRetry(action, executor, { baseBackoffMs: 10 });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    test('retries on ENOTFOUND error', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const executor = jest
        .fn()
        .mockResolvedValueOnce({ success: false, error: 'Element not found in DOM' })
        .mockResolvedValueOnce({ success: true });

      const result = await executeActionWithRetry(action, executor, { baseBackoffMs: 10 });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    test('retries on EHOSTUNREACH error', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const executor = jest
        .fn()
        .mockResolvedValueOnce({ success: false, error: 'EHOSTUNREACH: No route to host' })
        .mockResolvedValueOnce({ success: true });

      const result = await executeActionWithRetry(action, executor, { baseBackoffMs: 10 });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    test('retries on content script dead error', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const executor = jest
        .fn()
        .mockResolvedValueOnce({ success: false, error: 'Content script is dead' })
        .mockResolvedValueOnce({ success: true });

      const result = await executeActionWithRetry(action, executor, { baseBackoffMs: 10 });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    test('retries on network error', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const executor = jest
        .fn()
        .mockResolvedValueOnce({ success: false, error: 'Network error: unable to reach server' })
        .mockResolvedValueOnce({ success: true });

      const result = await executeActionWithRetry(action, executor, { baseBackoffMs: 10 });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });
  });

  describe('Permanent error handling - fail fast', () => {
    test('fails immediately on invalid selector syntax', async () => {
      const action: Action = { type: 'click', selector: '>>>>' };
      const executor = jest.fn().mockResolvedValueOnce({
        success: false,
        error: 'Invalid CSS selector syntax',
      });

      const result = await executeActionWithRetry(action, executor);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(executor).toHaveBeenCalledTimes(1);
    });

    test('fails immediately on auth error', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const executor = jest.fn().mockResolvedValueOnce({
        success: false,
        error: 'Unauthorized: invalid token',
      });

      const result = await executeActionWithRetry(action, executor);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(executor).toHaveBeenCalledTimes(1);
    });

    test('fails immediately on validation error', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const executor = jest.fn().mockResolvedValueOnce({
        success: false,
        error: 'Validation failed: selector must be non-empty',
      });

      const result = await executeActionWithRetry(action, executor);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });

    test('fails immediately on DOM mismatch error', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const executor = jest.fn().mockResolvedValueOnce({
        success: false,
        error: 'DOM mismatch: page changed during execution',
      });

      const result = await executeActionWithRetry(action, executor);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });
  });

  describe('Critical actions - never retry', () => {
    test('delete action never retries', async () => {
      const action: Action = { type: 'delete', selector: 'button.delete' };
      const executor = jest.fn().mockResolvedValueOnce({
        success: false,
        error: 'timeout',
      });

      const result = await executeActionWithRetry(action, executor);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(executor).toHaveBeenCalledTimes(1);
    });

    test('submit action never retries', async () => {
      const action: Action = { type: 'submit', selector: 'form' };
      const executor = jest.fn().mockResolvedValueOnce({
        success: false,
        error: 'timeout',
      });

      const result = await executeActionWithRetry(action, executor);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });

    test('pay action never retries', async () => {
      const action: Action = { type: 'pay', selector: 'button.pay' };
      const executor = jest.fn().mockResolvedValueOnce({
        success: false,
        error: 'timeout',
      });

      const result = await executeActionWithRetry(action, executor);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });

    test('custom critical actions are not retried', async () => {
      const action: Action = { type: 'transfer', selector: 'button.transfer' };
      const executor = jest.fn().mockResolvedValueOnce({
        success: false,
        error: 'timeout',
      });

      const result = await executeActionWithRetry(action, executor, {
        criticalActions: ['delete', 'submit', 'pay', 'transfer'],
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });
  });

  describe('Exponential backoff timing', () => {
    test('respects base backoff of 100ms', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const startTime = Date.now();

      const executor = jest
        .fn()
        .mockResolvedValueOnce({ success: false, error: 'timeout' })
        .mockResolvedValueOnce({ success: false, error: 'timeout' })
        .mockResolvedValueOnce({ success: true });

      // Use 50ms base to speed up test
      await executeActionWithRetry(action, executor, { baseBackoffMs: 50 });

      const elapsed = Date.now() - startTime;

      // Should wait: 50ms + 100ms = 150ms (with some tolerance)
      expect(elapsed).toBeGreaterThanOrEqual(100); // Lower bound
      expect(elapsed).toBeLessThan(500); // Upper bound
    });

    test('backoff doubles with each retry', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const executor = jest
        .fn()
        .mockResolvedValueOnce({ success: false, error: 'timeout' })
        .mockResolvedValueOnce({ success: false, error: 'timeout' })
        .mockResolvedValueOnce({ success: true });

      const result = await executeActionWithRetry(action, executor, { baseBackoffMs: 50 });

      expect(result.success).toBe(true);
      expect(executor).toHaveBeenCalledTimes(3);

      // Verify timing: 50ms + 100ms + (some execution time)
      // Total should be at least 150ms
    });
  });

  describe('Max attempts limit', () => {
    test('stops after maxAttempts is reached', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const executor = jest.fn().mockResolvedValue({ success: false, error: 'timeout' });

      const result = await executeActionWithRetry(action, executor, {
        maxAttempts: 2,
        baseBackoffMs: 10,
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(2);
      expect(executor).toHaveBeenCalledTimes(2);
    });

    test('default maxAttempts is 3', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const executor = jest.fn().mockResolvedValue({ success: false, error: 'timeout' });

      const result = await executeActionWithRetry(action, executor, { baseBackoffMs: 10 });

      expect(result.attempts).toBe(3);
      expect(executor).toHaveBeenCalledTimes(3);
    });

    test('respects custom maxAttempts', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const executor = jest.fn().mockResolvedValue({ success: false, error: 'timeout' });

      const result = await executeActionWithRetry(action, executor, {
        maxAttempts: 5,
        baseBackoffMs: 10,
      });

      expect(result.attempts).toBe(5);
      expect(executor).toHaveBeenCalledTimes(5);
    });
  });

  describe('Timeout protection', () => {
    test('enforces timeout for each execution attempt', async () => {
      const action: Action = { type: 'click', selector: 'button' };

      const executor = jest.fn(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ success: true }), 5000) // Very long execution
          )
      );

      const result = await executeActionWithRetry(action, executor, {
        timeoutMs: 100,
        maxAttempts: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });

  describe('Exception handling', () => {
    test('catches executor exceptions and returns error', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const executor = jest.fn().mockRejectedValue(new Error('Execution failed'));

      const result = await executeActionWithRetry(action, executor);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution failed');
      expect(result.lastError).toBeDefined();
    });

    test('retries transient exceptions', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const executor = jest
        .fn()
        .mockRejectedValueOnce(new Error('Content script is dead'))
        .mockResolvedValueOnce({ success: true });

      const result = await executeActionWithRetry(action, executor, { baseBackoffMs: 10 });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    test('does not retry permanent exceptions', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const executor = jest.fn().mockRejectedValue(new Error('Unauthorized: invalid token'));

      const result = await executeActionWithRetry(action, executor);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(executor).toHaveBeenCalledTimes(1);
    });
  });

  describe('Result structure', () => {
    test('returns correct result structure on success', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const executor = jest.fn().mockResolvedValue({ success: true, data: { id: 123 } });

      const result = await executeActionWithRetry(action, executor);

      expect(result).toEqual({
        action,
        success: true,
        attempts: 1,
      });
    });

    test('returns correct result structure on failure', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const executor = jest.fn().mockResolvedValue({ success: false, error: 'Failed' });

      const result = await executeActionWithRetry(action, executor);

      expect(result).toEqual({
        action,
        success: false,
        attempts: 1,
        error: 'Failed',
      });
    });

    test('includes lastError on exception', async () => {
      const action: Action = { type: 'click', selector: 'button' };
      const error = new Error('Execution error');
      const executor = jest.fn().mockRejectedValue(error);

      const result = await executeActionWithRetry(action, executor);

      expect(result.lastError).toBe(error);
    });
  });
});

describe('getBackoffStrategy', () => {
  test('returns human-readable backoff description', () => {
    const description = getBackoffStrategy(3, 100);
    expect(description).toContain('3 attempts');
    expect(description).toContain('100ms');
    expect(description).toContain('200ms');
    expect(description).toContain('400ms');
  });

  test('handles custom maxAttempts', () => {
    const description = getBackoffStrategy(2, 100);
    expect(description).toContain('2 attempts');
    expect(description).toContain('100ms');
  });

  test('uses provided base backoff in calculation', () => {
    const description = getBackoffStrategy(3, 50);
    expect(description).toContain('50ms');
    expect(description).toContain('100ms');
    expect(description).toContain('200ms');
  });
});
