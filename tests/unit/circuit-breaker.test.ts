/**
 * Unit tests for Circuit Breaker Pattern
 * Tests state machine, cascading failure prevention, and recovery
 */

import { CircuitBreaker, CircuitBreakerRegistry } from '../../src/shared/circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;
  let successFn: jest.Mock;
  let failureFn: jest.Mock;
  let fallbackFn: jest.Mock;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
      name: 'TestBreaker',
    });

    successFn = jest.fn().mockResolvedValue('success');
    failureFn = jest.fn().mockRejectedValue(new Error('API Error'));
    fallbackFn = jest.fn().mockResolvedValue('fallback');

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initial State', () => {
    test('starts in CLOSED state', () => {
      const state = breaker.getState();
      expect(state.state).toBe('CLOSED');
      expect(state.successCount).toBe(0);
      expect(state.failureCount).toBe(0);
      expect(state.totalRequests).toBe(0);
    });

    test('allows requests in CLOSED state', async () => {
      const result = await breaker.execute(successFn);
      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalledTimes(1);
    });

    test('tracks total requests', async () => {
      await breaker.execute(successFn);
      await breaker.execute(successFn);

      const state = breaker.getState();
      expect(state.totalRequests).toBe(2);
    });
  });

  describe('Failure Handling - CLOSED State', () => {
    test('increments failure count on error', async () => {
      try {
        await breaker.execute(failureFn);
      } catch (e) {
        // Expected
      }

      const state = breaker.getState();
      expect(state.failureCount).toBe(1);
    });

    test('stores last error', async () => {
      const error = new Error('Test error');
      const fn = jest.fn().mockRejectedValue(error);

      try {
        await breaker.execute(fn);
      } catch (e) {
        // Expected
      }

      const state = breaker.getState();
      expect(state.lastError?.message).toBe('Test error');
    });

    test('opens after failureThreshold consecutive failures', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failureFn);
        } catch (e) {
          // Expected
        }
      }

      const state = breaker.getState();
      expect(state.state).toBe('OPEN');
      expect(state.failureCount).toBe(3);
    });

    test('resets failure count on successful request', async () => {
      // Fail once
      try {
        await breaker.execute(failureFn);
      } catch (e) {
        // Expected
      }

      // Succeed
      await breaker.execute(successFn);

      const state = breaker.getState();
      expect(state.failureCount).toBe(0);
    });

    test('does not open before threshold reached', async () => {
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(failureFn);
        } catch (e) {
          // Expected
        }
      }

      const state = breaker.getState();
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(2);
    });
  });

  describe('OPEN State Behavior', () => {
    test('rejects requests immediately when OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failureFn);
        } catch (e) {
          // Expected
        }
      }

      // Reset mock to verify it's not called
      successFn.mockClear();

      // Try to execute a successful function
      await expect(breaker.execute(successFn)).rejects.toThrow('Circuit is OPEN');

      // Function should not have been called
      expect(successFn).not.toHaveBeenCalled();
    });

    test('uses fallback when OPEN if provided', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failureFn);
        } catch (e) {
          // Expected
        }
      }

      const result = await breaker.execute(successFn, fallbackFn);
      expect(result).toBe('fallback');
      expect(fallbackFn).toHaveBeenCalledTimes(1);
      expect(successFn).not.toHaveBeenCalled();
    });

    test('rejects without fallback when OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failureFn);
        } catch (e) {
          // Expected
        }
      }

      await expect(breaker.execute(successFn)).rejects.toThrow('Circuit is OPEN');
    });

    test('prevents cascading failures by failing fast', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failureFn);
        } catch (e) {
          // Expected
        }
      }

      // Subsequent requests should fail immediately without calling the function
      failureFn.mockClear();

      for (let i = 0; i < 10; i++) {
        try {
          await breaker.execute(failureFn);
        } catch (e) {
          // Expected
        }
      }

      // Function should not have been called for any of the fast-fail requests
      expect(failureFn).not.toHaveBeenCalled();
    });
  });

  describe('Recovery - HALF_OPEN State', () => {
    test('transitions to HALF_OPEN after timeout', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failureFn);
        } catch (e) {
          // Expected
        }
      }

      const openState = breaker.getState();
      expect(openState.state).toBe('OPEN');

      // Advance time
      jest.advanceTimersByTime(1000);

      // Next request should transition to HALF_OPEN
      await breaker.execute(successFn);

      const halfOpenState = breaker.getState();
      expect(halfOpenState.state).toBe('HALF_OPEN');
    });

    test('allows single request in HALF_OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failureFn);
        } catch (e) {
          // Expected
        }
      }

      jest.advanceTimersByTime(1000);

      successFn.mockClear();
      await breaker.execute(successFn);

      expect(successFn).toHaveBeenCalledTimes(1);
    });

    test('closes after successThreshold successes in HALF_OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failureFn);
        } catch (e) {
          // Expected
        }
      }

      jest.advanceTimersByTime(1000);

      // Two successes to reach threshold
      await breaker.execute(successFn);
      await breaker.execute(successFn);

      const state = breaker.getState();
      expect(state.state).toBe('CLOSED');
      expect(state.successCount).toBe(0); // Reset after close
    });

    test('reopens on failure in HALF_OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failureFn);
        } catch (e) {
          // Expected
        }
      }

      jest.advanceTimersByTime(1000);

      // Single failure in HALF_OPEN reopens
      try {
        await breaker.execute(failureFn);
      } catch (e) {
        // Expected
      }

      const state = breaker.getState();
      expect(state.state).toBe('OPEN');
    });

    test('does not allow requests until timeout expires', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failureFn);
        } catch (e) {
          // Expected
        }
      }

      successFn.mockClear();

      // Immediately try to request
      await expect(breaker.execute(successFn)).rejects.toThrow('Circuit is OPEN');
      expect(successFn).not.toHaveBeenCalled();

      // Advance time partially
      jest.advanceTimersByTime(500);

      // Still OPEN
      await expect(breaker.execute(successFn)).rejects.toThrow('Circuit is OPEN');
      expect(successFn).not.toHaveBeenCalled();

      // Advance rest of time
      jest.advanceTimersByTime(500);

      // Now should transition to HALF_OPEN and allow request
      await breaker.execute(successFn);
      expect(successFn).toHaveBeenCalled();
    });
  });

  describe('Reset Functionality', () => {
    test('resets to CLOSED state', () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failureFn);
        } catch (e) {
          // Expected
        }
      }

      breaker.reset();

      const state = breaker.getState();
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
      expect(state.successCount).toBe(0);
    });

    test('clears metrics on reset', () => {
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failureFn);
        } catch (e) {
          // Expected
        }
      }

      breaker.reset();

      const state = breaker.getState();
      expect(state.totalRequests).toBe(0);
      expect(state.lastError).toBeUndefined();
    });

    test('allows normal operation after reset', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failureFn);
        } catch (e) {
          // Expected
        }
      }

      breaker.reset();

      const result = await breaker.execute(successFn);
      expect(result).toBe('success');
    });
  });

  describe('Manual State Control', () => {
    test('can manually open circuit', async () => {
      breaker.open();
      const state = breaker.getState();
      expect(state.state).toBe('OPEN');

      await expect(breaker.execute(successFn)).rejects.toThrow('Circuit is OPEN');
    });

    test('can manually close circuit', async () => {
      breaker.open();
      breaker.close();

      const state = breaker.getState();
      expect(state.state).toBe('CLOSED');

      const result = await breaker.execute(successFn);
      expect(result).toBe('success');
    });
  });

  describe('Configuration Validation', () => {
    test('validates failureThreshold', () => {
      expect(() => {
        new CircuitBreaker({ failureThreshold: 0 });
      }).toThrow('failureThreshold must be >= 1');
    });

    test('validates successThreshold', () => {
      expect(() => {
        new CircuitBreaker({ successThreshold: 0 });
      }).toThrow('successThreshold must be >= 1');
    });

    test('validates timeout', () => {
      expect(() => {
        new CircuitBreaker({ timeout: 50 });
      }).toThrow('timeout must be >= 100ms');
    });
  });

  describe('Concurrent Requests', () => {
    test('handles concurrent requests in CLOSED state', async () => {
      const results = await Promise.all([
        breaker.execute(successFn),
        breaker.execute(successFn),
        breaker.execute(successFn),
      ]);

      expect(results).toEqual(['success', 'success', 'success']);
      expect(successFn).toHaveBeenCalledTimes(3);
    });

    test('fails all concurrent requests when OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failureFn);
        } catch (e) {
          // Expected
        }
      }

      successFn.mockClear();

      const results = await Promise.allSettled([
        breaker.execute(successFn),
        breaker.execute(successFn),
        breaker.execute(successFn),
      ]);

      expect(results.every((r) => r.status === 'rejected')).toBe(true);
      expect(successFn).not.toHaveBeenCalled();
    });
  });

  describe('Metrics Tracking', () => {
    test('tracks successful and failed requests', async () => {
      await breaker.execute(successFn);
      await breaker.execute(successFn);

      try {
        await breaker.execute(failureFn);
      } catch (e) {
        // Expected
      }

      const state = breaker.getState();
      expect(state.totalRequests).toBe(3);
      expect(state.successCount).toBe(0); // Reset after success
    });

    test('returns metrics in getState', async () => {
      await breaker.execute(successFn);

      const state = breaker.getState();
      expect(state.state).toBe('CLOSED');
      expect(state.successCount).toBe(0);
      expect(state.failureCount).toBe(0);
      expect(state.totalRequests).toBe(1);
      expect(state.stateChangedAt).toBeGreaterThan(0);
    });
  });
});

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry({
      failureThreshold: 3,
      timeout: 1000,
    });
  });

  test('creates breaker for endpoint', () => {
    const breaker = registry.getBreaker('https://api.example.com/v1/actions');
    expect(breaker).toBeDefined();
  });

  test('returns same breaker for same endpoint', () => {
    const breaker1 = registry.getBreaker('endpoint1');
    const breaker2 = registry.getBreaker('endpoint1');
    expect(breaker1).toBe(breaker2);
  });

  test('creates separate breakers for different endpoints', () => {
    const breaker1 = registry.getBreaker('endpoint1');
    const breaker2 = registry.getBreaker('endpoint2');
    expect(breaker1).not.toBe(breaker2);
  });

  test('returns states for all breakers', () => {
    registry.getBreaker('endpoint1');
    registry.getBreaker('endpoint2');

    const states = registry.getStates();
    expect(Object.keys(states)).toContain('endpoint1');
    expect(Object.keys(states)).toContain('endpoint2');
  });

  test('resets all breakers', () => {
    const breaker1 = registry.getBreaker('endpoint1');
    const breaker2 = registry.getBreaker('endpoint2');

    breaker1.open();
    breaker2.open();

    registry.resetAll();

    expect(breaker1.getState().state).toBe('CLOSED');
    expect(breaker2.getState().state).toBe('CLOSED');
  });

  test('counts breakers', () => {
    expect(registry.getCount()).toBe(0);

    registry.getBreaker('endpoint1');
    expect(registry.getCount()).toBe(1);

    registry.getBreaker('endpoint2');
    expect(registry.getCount()).toBe(2);
  });

  test('allows per-breaker option override', () => {
    const breaker = registry.getBreaker('endpoint', { failureThreshold: 10 });
    const state = breaker.getState();
    // Can't directly test threshold, but breaker should be created successfully
    expect(state.state).toBe('CLOSED');
  });
});
