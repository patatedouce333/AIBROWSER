/**
 * Circuit Breaker Pattern: Prevents cascading API failures
 * Protects against retry storms and wasted compute on doomed requests
 *
 * States:
 * - CLOSED (normal): All requests pass through
 * - OPEN (failing): Requests rejected immediately (fail-fast)
 * - HALF_OPEN (testing): Single request allowed to test recovery
 *
 * CRITICAL: Prevents cascading failures where:
 * - One API failure causes retry storms
 * - Retry storms overload the service
 * - Overload cascades to other services
 * - Entire system becomes unresponsive
 */

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Consecutive failures to open (default: 5)
  successThreshold?: number; // Consecutive successes to close (default: 2)
  timeout?: number; // Milliseconds before trying HALF_OPEN (default: 60000)
  name?: string; // For logging/debugging
}

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  successCount: number;
  failureCount: number;
  totalRequests: number;
  lastError?: Error;
  stateChangedAt: number;
}

/**
 * Protects APIs from cascading failures using state machine pattern
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private successCount: number = 0;
  private failureCount: number = 0;
  private totalRequests: number = 0;
  private lastError?: Error;
  private stateChangedAt: number = Date.now();
  private lastFailureTime?: number;

  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeout: number;
  private readonly name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 2;
    this.timeout = options.timeout ?? 60000; // 60 seconds
    this.name = options.name ?? 'CircuitBreaker';

    this.validateOptions();
  }

  /**
   * Execute a request through the circuit breaker
   * Throws if circuit is OPEN
   */
  async execute<T>(
    fn: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    // Check if we should transition to HALF_OPEN
    this.checkStateTransition();

    // If OPEN, reject immediately
    if (this.state === 'OPEN') {
      if (fallback) {
        console.warn(
          `CircuitBreaker [${this.name}]: Circuit OPEN, using fallback`
        );
        return fallback();
      }
      throw new Error(
        `CircuitBreaker [${this.name}]: Circuit is OPEN. Service unavailable.`
      );
    }

    // Execute the request
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error: any) {
      this.recordFailure(error);
      throw error;
    }
  }

  /**
   * Get current circuit breaker state and metrics
   */
  getState(): CircuitBreakerMetrics {
    return {
      state: this.state,
      successCount: this.successCount,
      failureCount: this.failureCount,
      totalRequests: this.totalRequests,
      lastError: this.lastError,
      stateChangedAt: this.stateChangedAt,
    };
  }

  /**
   * Reset circuit breaker to CLOSED state
   */
  reset(): void {
    this.state = 'CLOSED';
    this.successCount = 0;
    this.failureCount = 0;
    this.totalRequests = 0;
    this.lastError = undefined;
    this.stateChangedAt = Date.now();
    this.lastFailureTime = undefined;

    console.log(`CircuitBreaker [${this.name}]: Reset to CLOSED`);
  }

  /**
   * Manually open the circuit (for admin/testing)
   */
  open(): void {
    if (this.state !== 'OPEN') {
      this.setState('OPEN');
    }
  }

  /**
   * Manually close the circuit (for admin/testing)
   */
  close(): void {
    if (this.state !== 'CLOSED') {
      this.reset();
    }
  }

  // ============ PRIVATE HELPERS ============

  /**
   * Record a successful request
   */
  private recordSuccess(): void {
    this.totalRequests++;
    this.failureCount = 0; // Reset failure counter

    if (this.state === 'HALF_OPEN') {
      this.successCount++;

      if (this.successCount >= this.successThreshold) {
        // Enough successes to close
        this.setState('CLOSED');
        this.successCount = 0;
      }
    } else if (this.state === 'CLOSED') {
      // Already closed, nothing to do
      this.successCount = 0;
    }
  }

  /**
   * Record a failed request
   */
  private recordFailure(error: Error): void {
    this.totalRequests++;
    this.failureCount++;
    this.lastError = error;
    this.lastFailureTime = Date.now();
    this.successCount = 0; // Reset success counter

    console.warn(
      `CircuitBreaker [${this.name}]: Failure ${this.failureCount}/${this.failureThreshold}`,
      error.message
    );

    if (this.state === 'CLOSED') {
      if (this.failureCount >= this.failureThreshold) {
        // Too many failures - open the circuit
        this.setState('OPEN');
      }
    } else if (this.state === 'HALF_OPEN') {
      // Any failure in HALF_OPEN goes back to OPEN
      this.setState('OPEN');
    }
  }

  /**
   * Check if we should transition from OPEN to HALF_OPEN
   */
  private checkStateTransition(): void {
    if (this.state !== 'OPEN') {
      return;
    }

    const timeSinceStateChange = Date.now() - this.stateChangedAt;

    if (timeSinceStateChange >= this.timeout) {
      // Timeout expired - try to recover
      this.setState('HALF_OPEN');
      this.successCount = 0;
      this.failureCount = 0;
    }
  }

  /**
   * Transition to a new state
   */
  private setState(newState: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = newState;
    this.stateChangedAt = Date.now();

    console.log(
      `CircuitBreaker [${this.name}]: ${oldState} → ${newState}`
    );
  }

  /**
   * Validate configuration options
   */
  private validateOptions(): void {
    if (this.failureThreshold < 1) {
      throw new Error('failureThreshold must be >= 1');
    }
    if (this.successThreshold < 1) {
      throw new Error('successThreshold must be >= 1');
    }
    if (this.timeout < 100) {
      throw new Error('timeout must be >= 100ms');
    }
  }
}

/**
 * Circuit breaker for API endpoints
 * Tracks success/failure rates per endpoint
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private defaultOptions: CircuitBreakerOptions;

  constructor(defaultOptions: CircuitBreakerOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  /**
   * Get or create a circuit breaker for an endpoint
   */
  getBreaker(endpoint: string, options?: CircuitBreakerOptions): CircuitBreaker {
    if (!this.breakers.has(endpoint)) {
      const mergedOptions = { ...this.defaultOptions, ...options, name: endpoint };
      this.breakers.set(endpoint, new CircuitBreaker(mergedOptions));
    }
    return this.breakers.get(endpoint)!;
  }

  /**
   * Get all breakers and their states
   */
  getStates(): Record<string, CircuitBreakerMetrics> {
    const states: Record<string, CircuitBreakerMetrics> = {};
    for (const [name, breaker] of this.breakers.entries()) {
      states[name] = breaker.getState();
    }
    return states;
  }

  /**
   * Reset all breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Get breaker count
   */
  getCount(): number {
    return this.breakers.size;
  }
}

/**
 * Export singleton registry
 */
export const circuitBreakerRegistry = new CircuitBreakerRegistry({
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000,
});
