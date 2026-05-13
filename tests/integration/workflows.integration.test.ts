/**
 * Integration tests for major workflows
 * Tests complete end-to-end scenarios across multiple systems
 */

import { CircuitBreaker } from '../../src/shared/circuit-breaker';
import { RequestQueue, RequestPriority } from '../../src/shared/request-queue';
import { Store } from '../../src/shared/store';
import { DOMCache } from '../../src/shared/dom-cache';
import { Logger, Metrics, Tracer } from '../../src/shared/observability';

describe('Integration: Major Workflows', () => {
  let circuitBreaker: CircuitBreaker;
  let requestQueue: RequestQueue;
  let store: Store;
  let domCache: DOMCache;
  let logger: Logger;
  let metrics: Metrics;
  let tracer: Tracer;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
    });
    requestQueue = new RequestQueue({
      maxConcurrent: 2,
      batchSize: 3,
      batchIntervalMs: 100,
    });
    store = new Store({
      auth: { token: null },
      cache: { snapshots: {} },
    });
    domCache = new DOMCache();
    logger = new Logger();
    metrics = new Metrics();
    tracer = new Tracer();

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('WORKFLOW-1: Complete Action Execution Flow', () => {
    test('action flows through queue, breaker, cache, and store', async () => {
      const action = {
        id: 'action-1',
        type: 'click',
        selector: 'button.submit',
      };

      let apiCallCount = 0;
      const mockExecutor = jest.fn(async () => {
        apiCallCount++;
        return circuitBreaker.execute(async () => {
          metrics.recordLatency('action', 50);
          return { success: true };
        });
      });

      // Enqueue action with metrics
      const span = tracer.startSpan('execute-action');
      logger.setContext('actionId', action.id);

      const result = await requestQueue.enqueue(
        { id: action.id, execute: mockExecutor },
        RequestPriority.NORMAL
      );

      jest.runAllTimers();

      tracer.endSpan(span);

      // Verify flow
      expect(result.success).toBe(true);
      expect(apiCallCount).toBe(1);
      expect(mockExecutor).toHaveBeenCalled();

      // Verify metrics recorded
      const stats = metrics.getLatencyStats('action');
      expect(stats.avg).toBeGreaterThan(0);
    });

    test('action updates state and triggers subscribers', async () => {
      const stateCallback = jest.fn();
      store.subscribe('lastAction', stateCallback);

      const action = { id: 'act1', type: 'click' };

      const executor = jest.fn(async () => {
        store.setState('lastAction', action);
        return { success: true };
      });

      await requestQueue.enqueue({ id: action.id, execute: executor });
      jest.runAllTimers();

      expect(stateCallback).toHaveBeenCalled();
      expect(store.getState('lastAction')).toEqual(action);
    });
  });

  describe('WORKFLOW-2: Cascading Failure Recovery', () => {
    test('circuit opens after failures, recovers after timeout', async () => {
      const failingApi = jest.fn().mockRejectedValue(new Error('API Error'));

      // Open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingApi);
        } catch (e) {
          // Expected
        }
      }

      expect(circuitBreaker.getState().state).toBe('OPEN');

      // Verify fast-fail
      const state1 = circuitBreaker.getState();
      const before = state1.totalRequests;

      try {
        await circuitBreaker.execute(failingApi);
      } catch (e) {
        // Expected
      }

      const state2 = circuitBreaker.getState();
      expect(state2.totalRequests).toBe(before); // Not incremented (fast-fail)

      // Timeout and recovery
      jest.advanceTimersByTime(1000);

      const successApi = jest.fn().mockResolvedValue({ status: 'ok' });
      await circuitBreaker.execute(successApi);

      expect(circuitBreaker.getState().state).toBe('CLOSED');
    });

    test('fallback used when circuit open', async () => {
      const primary = jest.fn().mockRejectedValue(new Error('Failed'));
      const fallback = jest.fn().mockResolvedValue({ fallback: true });

      // Open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(primary);
        } catch (e) {
          // Expected
        }
      }

      const result = await circuitBreaker.execute(primary, fallback);

      expect(result.fallback).toBe(true);
      expect(fallback).toHaveBeenCalled();
      expect(primary).toHaveBeenCalledTimes(3); // Only initial failures
    });
  });

  describe('WORKFLOW-3: State Management with Undo/Redo', () => {
    test('complex state changes with history', async () => {
      const subscriber = jest.fn();
      store.subscribe('user', subscriber);

      store.setState('user.name', 'Alice');
      store.setState('user.email', 'alice@example.com');
      store.setState('user.role', 'admin');

      expect(subscriber).toHaveBeenCalledTimes(3);
      expect(store.canUndo()).toBe(true);

      // Undo all changes
      store.undo();
      expect(store.getState('user.email')).toBe(undefined);

      store.undo();
      expect(store.getState('user.name')).toBe(undefined);

      // Redo
      store.redo();
      expect(store.getState('user.name')).toBe('Alice');
    });

    test('atomic batch updates notify subscribers once per path', async () => {
      const nameCallback = jest.fn();
      const emailCallback = jest.fn();

      store.subscribe('user.name', nameCallback);
      store.subscribe('user.email', emailCallback);

      store.updateState({
        'user.name': 'Bob',
        'user.email': 'bob@example.com',
      });

      expect(nameCallback).toHaveBeenCalledTimes(1);
      expect(emailCallback).toHaveBeenCalledTimes(1);

      store.undo();

      expect(nameCallback).toHaveBeenCalledTimes(2);
      expect(emailCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe('WORKFLOW-4: DOM Caching with TTL', () => {
    test('snapshots cached and expire correctly', () => {
      const snapshot = {
        tabId: 1,
        html: '<div>Page content</div>',
        timestamp: Date.now(),
        size: 30,
        compressed: false,
      };

      // Cache snapshot
      domCache.setSnapshot(1, snapshot);
      let cached = domCache.getSnapshot(1);
      expect(cached).not.toBeNull();

      // Still valid at 20 seconds
      jest.advanceTimersByTime(20000);
      cached = domCache.getSnapshot(1);
      expect(cached).not.toBeNull();

      // Expired at 35 seconds (TTL is 30s default)
      jest.advanceTimersByTime(15000);
      cached = domCache.getSnapshot(1);
      expect(cached).toBeNull();

      // Verify statistics
      const stats = domCache.getStats();
      expect(stats.misses).toBeGreaterThan(0);
    });

    test('LRU eviction under size pressure', () => {
      const smallCache = new DOMCache({ maxTabSize: 100 });

      const snap1 = {
        tabId: 1,
        html: 'a'.repeat(40),
        timestamp: Date.now(),
        size: 40,
        compressed: false,
      };
      const snap2 = {
        tabId: 1,
        html: 'b'.repeat(40),
        timestamp: Date.now(),
        size: 40,
        compressed: false,
      };
      const snap3 = {
        tabId: 1,
        html: 'c'.repeat(40),
        timestamp: Date.now(),
        size: 40,
        compressed: false,
      };

      smallCache.setSnapshot(1, snap1, 'key1');
      smallCache.setSnapshot(1, snap2, 'key2');

      // Access snap1 to make it recently used
      smallCache.getSnapshot(1, 'key1');

      // Add snap3 - should evict snap2 (least recently used)
      smallCache.setSnapshot(1, snap3, 'key3');

      expect(smallCache.getSnapshot(1, 'key1')).not.toBeNull();
      expect(smallCache.getSnapshot(1, 'key3')).not.toBeNull();
      expect(smallCache.getSnapshot(1, 'key2')).toBeNull();
    });
  });

  describe('WORKFLOW-5: Observability Across Systems', () => {
    test('metrics and logging integrated throughout', async () => {
      logger.setLevel('DEBUG');
      logger.setContext('requestId', 'req-123');

      const span = tracer.startSpan('complete-flow');

      const executor = jest.fn(async () => {
        const innerSpan = tracer.startSpan('api-call', span);

        logger.info('Starting API call');
        metrics.recordCounter('api.calls', 1);

        jest.advanceTimersByTime(50);

        metrics.recordLatency('api.duration', 50);
        tracer.endSpan(innerSpan);

        return { result: 'success' };
      });

      await requestQueue.enqueue({ id: 'op1', execute: executor });
      jest.runAllTimers();

      tracer.endSpan(span);

      // Verify all systems recorded activity
      const logs = logger.getLogs();
      expect(logs.length).toBeGreaterThan(0);

      const metrics_data = metrics.getMetrics('api.duration');
      expect(metrics_data.length).toBeGreaterThan(0);

      const spans = tracer.getSpans();
      expect(spans.length).toBeGreaterThan(0);

      // Verify parent-child span relationship
      const childSpans = spans.filter((s) => s.parent);
      expect(childSpans.length).toBeGreaterThan(0);
    });
  });

  describe('WORKFLOW-6: Priority Queuing with Circuit Breaker', () => {
    test('high priority requests processed first despite circuit limits', async () => {
      const order: number[] = [];

      const makeExecutor = (priority: number) =>
        jest.fn(async () => {
          order.push(priority);
          return { priority };
        });

      // Enqueue in mixed order
      requestQueue.enqueue(
        { id: 'low', execute: makeExecutor(RequestPriority.LOW) },
        RequestPriority.LOW
      );

      requestQueue.enqueue(
        { id: 'normal', execute: makeExecutor(RequestPriority.NORMAL) },
        RequestPriority.NORMAL
      );

      requestQueue.enqueue(
        { id: 'high', execute: makeExecutor(RequestPriority.HIGH) },
        RequestPriority.HIGH
      );

      jest.runAllTimers();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // HIGH should be first
      expect(order[0]).toBe(RequestPriority.HIGH);
    });
  });

  describe('WORKFLOW-7: Error Handling Across Stack', () => {
    test('error logged at all levels', async () => {
      const span = tracer.startSpan('failing-operation');

      const executor = jest.fn(async () => {
        const error = new Error('Operation failed');
        logger.error('Execute failed', error);
        tracer.recordError(span, error);
        throw error;
      });

      try {
        await requestQueue.enqueue({ id: 'op', execute: executor });
        jest.runAllTimers();
      } catch (e) {
        // Expected
      }

      const errorLogs = logger.getLogs('ERROR');
      expect(errorLogs.length).toBeGreaterThan(0);

      const spans = tracer.getSpans();
      const failedSpan = spans.find((s) => s.status === 'ERROR');
      expect(failedSpan).toBeDefined();
    });
  });
});
