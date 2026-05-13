/**
 * Unit tests for Request Queue System
 * Tests priority queuing, batching, rate limiting, and concurrency control
 */

import { RequestQueue, RequestPriority } from '../../src/shared/request-queue';

describe('RequestQueue', () => {
  let queue: RequestQueue;

  beforeEach(() => {
    queue = new RequestQueue({
      maxConcurrent: 2,
      batchSize: 3,
      batchIntervalMs: 100,
      maxQueueSize: 50,
      priorityLevels: 3,
    });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Basic Queueing', () => {
    test('enqueues a request', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');
      const promise = queue.enqueue({
        id: 'req1',
        execute: mockFn,
      });

      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('result');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test('enqueues multiple requests in order', async () => {
      const calls: string[] = [];
      const req1 = jest.fn(async () => {
        calls.push('req1');
        return 'result1';
      });
      const req2 = jest.fn(async () => {
        calls.push('req2');
        return 'result2';
      });

      const p1 = queue.enqueue({ id: 'req1', execute: req1 });
      const p2 = queue.enqueue({ id: 'req2', execute: req2 });

      jest.runAllTimers();

      await Promise.all([p1, p2]);

      expect(calls).toContain('req1');
      expect(calls).toContain('req2');
    });

    test('rejects if queue is full', async () => {
      queue = new RequestQueue({ maxQueueSize: 2 });

      const mockFn = jest.fn().mockResolvedValue('result');

      queue.enqueue({ id: 'req1', execute: mockFn });
      queue.enqueue({ id: 'req2', execute: mockFn });

      await expect(
        queue.enqueue({ id: 'req3', execute: mockFn })
      ).rejects.toThrow('queue full');
    });

    test('rejects if request missing id', async () => {
      const mockFn = jest.fn();

      await expect(
        queue.enqueue({ id: '', execute: mockFn })
      ).rejects.toThrow();
    });

    test('rejects if request missing execute function', async () => {
      await expect(
        queue.enqueue({ id: 'req1', execute: undefined as any })
      ).rejects.toThrow();
    });
  });

  describe('Priority Queuing', () => {
    test('processes HIGH priority before NORMAL priority', async () => {
      const order: number[] = [];

      const highPri = jest.fn(async () => {
        order.push(RequestPriority.HIGH);
        return 'high';
      });
      const normalPri = jest.fn(async () => {
        order.push(RequestPriority.NORMAL);
        return 'normal';
      });

      // Enqueue NORMAL first
      queue.enqueue({ id: 'normal', execute: normalPri }, RequestPriority.NORMAL);

      // Then HIGH
      queue.enqueue({ id: 'high', execute: highPri }, RequestPriority.HIGH);

      jest.runAllTimers();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // HIGH should execute first
      expect(order[0]).toBe(RequestPriority.HIGH);
      expect(order[1]).toBe(RequestPriority.NORMAL);
    });

    test('processes NORMAL before LOW priority', async () => {
      const order: number[] = [];

      const normalPri = jest.fn(async () => {
        order.push(RequestPriority.NORMAL);
        return 'normal';
      });
      const lowPri = jest.fn(async () => {
        order.push(RequestPriority.LOW);
        return 'low';
      });

      queue.enqueue({ id: 'low', execute: lowPri }, RequestPriority.LOW);
      queue.enqueue({ id: 'normal', execute: normalPri }, RequestPriority.NORMAL);

      jest.runAllTimers();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(order[0]).toBe(RequestPriority.NORMAL);
      expect(order[1]).toBe(RequestPriority.LOW);
    });

    test('maintains FIFO within same priority', async () => {
      const order: string[] = [];

      const makeFn = (id: string) =>
        jest.fn(async () => {
          order.push(id);
          return id;
        });

      queue.enqueue({ id: 'req1', execute: makeFn('req1') }, RequestPriority.NORMAL);
      queue.enqueue({ id: 'req2', execute: makeFn('req2') }, RequestPriority.NORMAL);
      queue.enqueue({ id: 'req3', execute: makeFn('req3') }, RequestPriority.NORMAL);

      jest.runAllTimers();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(order).toEqual(['req1', 'req2', 'req3']);
    });

    test('rejects invalid priority', async () => {
      const mockFn = jest.fn();

      await expect(
        queue.enqueue({ id: 'req1', execute: mockFn }, 999)
      ).rejects.toThrow('Priority');
    });
  });

  describe('Batching', () => {
    test('batches requests up to batchSize', async () => {
      const executionOrder: string[] = [];

      const makeFn = (id: string) =>
        jest.fn(async () => {
          executionOrder.push(id);
          return id;
        });

      // Enqueue 5 requests
      for (let i = 1; i <= 5; i++) {
        queue.enqueue(
          { id: `req${i}`, execute: makeFn(`req${i}`) },
          RequestPriority.NORMAL
        );
      }

      // After batchIntervalMs, should process first batch
      jest.advanceTimersByTime(100);

      // Should have processed 3 (batchSize)
      expect(executionOrder.length).toBeLessThanOrEqual(3);
    });

    test('processes remaining items in subsequent batches', async () => {
      const stats1 = queue.getStats();
      expect(stats1.totalQueued).toBe(0);

      const mockFn = jest.fn().mockResolvedValue('result');

      for (let i = 1; i <= 7; i++) {
        queue.enqueue({ id: `req${i}`, execute: mockFn }, RequestPriority.NORMAL);
      }

      jest.runAllTimers();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const stats = queue.getStats();
      expect(stats.totalQueued).toBe(7);
    });

    test('processes immediately if batch reaches batchSize', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');

      for (let i = 1; i <= 3; i++) {
        queue.enqueue({ id: `req${i}`, execute: mockFn }, RequestPriority.NORMAL);
      }

      // Should process immediately without waiting for interval
      jest.advanceTimersByTime(1);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('Concurrency Control', () => {
    test('respects maxConcurrent limit', async () => {
      let concurrent = 0;
      let maxObserved = 0;

      const slowFn = jest.fn(async () => {
        concurrent++;
        maxObserved = Math.max(maxObserved, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 50));
        concurrent--;
        return 'done';
      });

      for (let i = 1; i <= 5; i++) {
        queue.enqueue({ id: `req${i}`, execute: slowFn });
      }

      jest.runAllTimers();
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(maxObserved).toBeLessThanOrEqual(2); // maxConcurrent = 2
    });

    test('queues additional requests when at concurrency limit', async () => {
      queue = new RequestQueue({ maxConcurrent: 1 });

      const longRunning = jest.fn(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      queue.enqueue({ id: 'req1', execute: longRunning });
      queue.enqueue({ id: 'req2', execute: longRunning });
      queue.enqueue({ id: 'req3', execute: longRunning });

      jest.advanceTimersByTime(50);

      const stats = queue.getStats();
      expect(stats.executing).toBeLessThanOrEqual(1);
      expect(stats.queueDepth).toBeGreaterThan(0);
    });
  });

  describe('Queue Statistics', () => {
    test('tracks queued requests', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');

      queue.enqueue({ id: 'req1', execute: mockFn });

      const stats = queue.getStats();
      expect(stats.totalQueued).toBe(1);
    });

    test('tracks processed requests', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');

      const p = queue.enqueue({ id: 'req1', execute: mockFn });
      jest.runAllTimers();
      await p;

      const stats = queue.getStats();
      expect(stats.totalProcessed).toBe(1);
    });

    test('tracks failed requests', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('Failed'));

      try {
        const p = queue.enqueue({ id: 'req1', execute: failFn });
        jest.runAllTimers();
        await p;
      } catch (e) {
        // Expected
      }

      const stats = queue.getStats();
      expect(stats.totalFailed).toBe(1);
    });

    test('calculates success rate', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      const failFn = jest.fn().mockRejectedValue(new Error('Failed'));

      queue.enqueue({ id: 'req1', execute: successFn });
      queue.enqueue({ id: 'req2', execute: failFn });

      jest.runAllTimers();

      try {
        await queue.enqueue({ id: 'req2', execute: failFn });
      } catch (e) {
        // Expected
      }

      jest.runAllTimers();

      const stats = queue.getStats();
      expect(stats.successRate).toBe(50); // 1 success, 1 failure
    });

    test('reports queue depth', async () => {
      const slowFn = jest.fn(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );

      for (let i = 1; i <= 5; i++) {
        queue.enqueue({ id: `req${i}`, execute: slowFn });
      }

      const stats = queue.getStats();
      expect(stats.queueDepth).toBeGreaterThan(0);
    });
  });

  describe('Pause and Resume', () => {
    test('pauses processing', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');

      queue.enqueue({ id: 'req1', execute: mockFn });
      queue.pause();
      jest.runAllTimers();

      expect(mockFn).not.toHaveBeenCalled();
    });

    test('resumes processing', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');

      queue.enqueue({ id: 'req1', execute: mockFn });
      queue.pause();
      jest.runAllTimers();

      expect(mockFn).not.toHaveBeenCalled();

      queue.resume();
      jest.runAllTimers();

      expect(mockFn).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('rejects promise on execute error', async () => {
      const error = new Error('Execution failed');
      const failFn = jest.fn().mockRejectedValue(error);

      const p = queue.enqueue({ id: 'req1', execute: failFn });
      jest.runAllTimers();

      await expect(p).rejects.toThrow('Execution failed');
    });

    test('continues processing after error', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('Failed'));
      const successFn = jest.fn().mockResolvedValue('success');

      try {
        const p1 = queue.enqueue({ id: 'req1', execute: failFn });
        jest.runAllTimers();
        await p1;
      } catch (e) {
        // Expected
      }

      const p2 = queue.enqueue({ id: 'req2', execute: successFn });
      jest.runAllTimers();

      const result = await p2;
      expect(result).toBe('success');
    });
  });

  describe('Drain', () => {
    test('waits for all requests to complete', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');

      queue.enqueue({ id: 'req1', execute: mockFn });
      queue.enqueue({ id: 'req2', execute: mockFn });

      const drainPromise = queue.drain();
      jest.runAllTimers();

      await drainPromise;

      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    test('resolves immediately if queue empty', async () => {
      const drainPromise = queue.drain();
      jest.advanceTimersByTime(100);

      // Should resolve without error
      await drainPromise;
    });
  });

  describe('Configuration Validation', () => {
    test('validates maxConcurrent', () => {
      expect(() => {
        new RequestQueue({ maxConcurrent: 0 });
      }).toThrow('maxConcurrent');
    });

    test('validates batchSize', () => {
      expect(() => {
        new RequestQueue({ batchSize: 0 });
      }).toThrow('batchSize');
    });

    test('validates batchIntervalMs', () => {
      expect(() => {
        new RequestQueue({ batchIntervalMs: 5 });
      }).toThrow('batchIntervalMs');
    });

    test('validates maxQueueSize', () => {
      expect(() => {
        new RequestQueue({ maxQueueSize: 0 });
      }).toThrow('maxQueueSize');
    });

    test('validates priorityLevels', () => {
      expect(() => {
        new RequestQueue({ priorityLevels: 0 });
      }).toThrow('priorityLevels');
    });
  });

  describe('Complex Scenarios', () => {
    test('handles mixed priority batch processing', async () => {
      const order: string[] = [];

      const makeFn = (id: string) =>
        jest.fn(async () => {
          order.push(id);
          return id;
        });

      queue.enqueue({ id: 'low1', execute: makeFn('low1') }, RequestPriority.LOW);
      queue.enqueue({ id: 'normal1', execute: makeFn('normal1') }, RequestPriority.NORMAL);
      queue.enqueue({ id: 'high1', execute: makeFn('high1') }, RequestPriority.HIGH);
      queue.enqueue({ id: 'normal2', execute: makeFn('normal2') }, RequestPriority.NORMAL);
      queue.enqueue({ id: 'high2', execute: makeFn('high2') }, RequestPriority.HIGH);

      jest.runAllTimers();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should prioritize: both HIGH before NORMAL, then LOW
      const highIndices = [
        order.indexOf('high1'),
        order.indexOf('high2'),
      ].filter((i) => i >= 0);
      const normalIndices = [
        order.indexOf('normal1'),
        order.indexOf('normal2'),
      ].filter((i) => i >= 0);
      const lowIndices = [order.indexOf('low1')].filter((i) => i >= 0);

      const firstHigh = Math.min(...highIndices);
      const firstNormal = Math.min(...normalIndices);
      const firstLow = Math.min(...lowIndices);

      expect(firstHigh).toBeLessThan(firstNormal);
      expect(firstNormal).toBeLessThan(firstLow);
    });

    test('rate limits to prevent API overload', async () => {
      queue = new RequestQueue({
        maxConcurrent: 2,
        batchSize: 3,
        batchIntervalMs: 200,
        maxQueueSize: 50,
      });

      let maxConcurrent = 0;
      let concurrent = 0;

      const slowFn = jest.fn(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 100));
        concurrent--;
      });

      for (let i = 0; i < 10; i++) {
        queue.enqueue({ id: `req${i}`, execute: slowFn });
      }

      jest.runAllTimers();
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(maxConcurrent).toBeLessThanOrEqual(2);
      expect(slowFn).toHaveBeenCalledTimes(10);
    });
  });
});
