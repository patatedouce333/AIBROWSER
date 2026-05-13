/**
 * Request Queue: Priority-based action batching and rate limiting
 * Prevents request storms and ensures fair resource allocation
 *
 * CRITICAL: Without queuing:
 * - Concurrent actions overwhelm API
 * - No differentiation between critical and low-priority actions
 * - Difficult to rate limit effectively
 * - Network bandwidth wasted on redundant requests
 *
 * With queuing:
 * - Critical actions (delete, submit) processed first
 * - Normal actions (click, type) batched efficiently
 * - Background actions (observe) deferred
 * - Rate limiting prevents API overload
 */

export interface QueuedRequest<T> {
  id: string;
  execute: () => Promise<T>;
  priority?: number; // 0=HIGH, 1=NORMAL (default), 2=LOW
  timeout?: number; // Max time in queue (ms)
}

export interface QueueStats {
  totalQueued: number;
  totalProcessed: number;
  totalFailed: number;
  queueDepth: number;
  executing: number;
  averageWaitTime: number;
  successRate: number;
}

export interface RequestQueueOptions {
  maxConcurrent?: number; // Max simultaneous requests (default: 3)
  batchSize?: number; // Actions per batch (default: 5)
  batchIntervalMs?: number; // Max wait before processing (default: 500ms)
  maxQueueSize?: number; // Max items before rejecting (default: 100)
  priorityLevels?: number; // Priority queue levels (default: 3)
}

/**
 * Priority-based request queue with batching
 */
export class RequestQueue {
  private queues: Map<number, QueuedRequest<any>[]> = new Map(); // Priority -> requests
  private executing: Set<string> = new Set(); // Currently executing request IDs
  private results: Map<string, any> = new Map(); // Request results
  private errors: Map<string, Error> = new Map(); // Request errors
  private resolvers: Map<string, { resolve: Function; reject: Function }> = new Map();

  private totalQueued: number = 0;
  private totalProcessed: number = 0;
  private totalFailed: number = 0;
  private waitTimes: number[] = [];

  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private paused: boolean = false;

  private readonly maxConcurrent: number;
  private readonly batchSize: number;
  private readonly batchIntervalMs: number;
  private readonly maxQueueSize: number;
  private readonly priorityLevels: number;

  constructor(options: RequestQueueOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 3;
    this.batchSize = options.batchSize ?? 5;
    this.batchIntervalMs = options.batchIntervalMs ?? 500;
    this.maxQueueSize = options.maxQueueSize ?? 100;
    this.priorityLevels = options.priorityLevels ?? 3;

    // Initialize priority queues
    for (let i = 0; i < this.priorityLevels; i++) {
      this.queues.set(i, []);
    }

    this.validateOptions();
  }

  /**
   * Enqueue a request for processing
   */
  async enqueue<T>(request: QueuedRequest<T>, priority: number = 1): Promise<T> {
    // Validate inputs
    if (!request.id || !request.execute) {
      throw new Error('Request must have id and execute function');
    }

    if (priority < 0 || priority >= this.priorityLevels) {
      throw new Error(`Priority must be between 0 and ${this.priorityLevels - 1}`);
    }

    // Check queue size
    const totalSize = Array.from(this.queues.values()).reduce((sum, q) => sum + q.length, 0);
    if (totalSize >= this.maxQueueSize) {
      throw new Error(`Request queue full (${this.maxQueueSize} max)`);
    }

    // Add to appropriate priority queue
    const queue = this.queues.get(priority)!;
    queue.push({ ...request, priority });
    this.totalQueued++;

    console.log(`RequestQueue: Enqueued request ${request.id} (priority ${priority})`);

    // Start processing if needed
    this.scheduleProcessing();

    // Return promise that resolves when request completes
    return new Promise((resolve, reject) => {
      this.resolvers.set(request.id, { resolve, reject });
    });
  }

  /**
   * Get current queue statistics
   */
  getStats(): QueueStats {
    const queueDepth = Array.from(this.queues.values()).reduce((sum, q) => sum + q.length, 0);
    const avgWaitTime = this.waitTimes.length > 0
      ? this.waitTimes.reduce((a, b) => a + b, 0) / this.waitTimes.length
      : 0;
    const successRate =
      this.totalProcessed > 0 ? ((this.totalProcessed - this.totalFailed) / this.totalProcessed) * 100 : 0;

    return {
      totalQueued: this.totalQueued,
      totalProcessed: this.totalProcessed,
      totalFailed: this.totalFailed,
      queueDepth,
      executing: this.executing.size,
      averageWaitTime: Math.round(avgWaitTime),
      successRate: Math.round(successRate),
    };
  }

  /**
   * Pause queue processing
   */
  pause(): void {
    this.paused = true;
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    console.log('RequestQueue: Paused');
  }

  /**
   * Resume queue processing
   */
  resume(): void {
    this.paused = false;
    console.log('RequestQueue: Resumed');
    this.scheduleProcessing();
  }

  /**
   * Drain queue (wait for all requests to complete)
   */
  async drain(): Promise<void> {
    return new Promise((resolve) => {
      const checkDrained = () => {
        if (this.executing.size === 0 && this.getQueueSize() === 0) {
          resolve();
        } else {
          setTimeout(checkDrained, 100);
        }
      };
      checkDrained();
    });
  }

  // ============ PRIVATE HELPERS ============

  /**
   * Schedule batch processing
   */
  private scheduleProcessing(): void {
    if (this.paused || this.batchTimer) {
      return;
    }

    const queueSize = this.getQueueSize();

    // Process immediately if batch is full
    if (queueSize >= this.batchSize) {
      this.processBatch();
      return;
    }

    // Otherwise schedule for later
    if (queueSize > 0) {
      this.batchTimer = setTimeout(() => {
        this.batchTimer = null;
        this.processBatch();
      }, this.batchIntervalMs);
    }
  }

  /**
   * Process a batch of requests
   */
  private async processBatch(): Promise<void> {
    if (this.paused || this.executing.size >= this.maxConcurrent) {
      return;
    }

    // Get next batch of requests (from highest to lowest priority)
    const batch: QueuedRequest<any>[] = [];

    for (let priority = 0; priority < this.priorityLevels; priority++) {
      const queue = this.queues.get(priority)!;

      while (queue.length > 0 && batch.length < this.batchSize) {
        const req = queue.shift();
        if (req) batch.push(req);
      }

      if (batch.length >= this.batchSize) break;
    }

    if (batch.length === 0) {
      return;
    }

    console.log(`RequestQueue: Processing batch of ${batch.length} requests`);

    // Execute all requests in batch in parallel (up to maxConcurrent)
    const processingPromises = batch.map((req) => this.executeRequest(req));

    await Promise.allSettled(processingPromises);

    // Schedule next batch if queue not empty
    if (this.getQueueSize() > 0 && this.executing.size < this.maxConcurrent) {
      this.scheduleProcessing();
    }
  }

  /**
   * Execute a single request
   */
  private async executeRequest(request: QueuedRequest<any>): Promise<void> {
    const startTime = Date.now();
    this.executing.add(request.id);

    try {
      const result = await request.execute();
      this.results.set(request.id, result);

      const resolver = this.resolvers.get(request.id);
      if (resolver) {
        resolver.resolve(result);
        this.resolvers.delete(request.id);
      }

      this.totalProcessed++;
      const waitTime = Date.now() - startTime;
      this.waitTimes.push(waitTime);

      console.log(
        `RequestQueue: Completed request ${request.id} in ${waitTime}ms`
      );
    } catch (error: any) {
      this.errors.set(request.id, error);

      const resolver = this.resolvers.get(request.id);
      if (resolver) {
        resolver.reject(error);
        this.resolvers.delete(request.id);
      }

      this.totalProcessed++;
      this.totalFailed++;

      console.error(
        `RequestQueue: Failed request ${request.id}:`,
        error.message
      );
    } finally {
      this.executing.delete(request.id);

      // Continue processing if space available and queue has items
      if (!this.paused && this.executing.size < this.maxConcurrent && this.getQueueSize() > 0) {
        this.processBatch();
      }
    }
  }

  /**
   * Get total queue size across all priorities
   */
  private getQueueSize(): number {
    return Array.from(this.queues.values()).reduce((sum, q) => sum + q.length, 0);
  }

  /**
   * Validate configuration
   */
  private validateOptions(): void {
    if (this.maxConcurrent < 1) {
      throw new Error('maxConcurrent must be >= 1');
    }
    if (this.batchSize < 1) {
      throw new Error('batchSize must be >= 1');
    }
    if (this.batchIntervalMs < 10) {
      throw new Error('batchIntervalMs must be >= 10ms');
    }
    if (this.maxQueueSize < 1) {
      throw new Error('maxQueueSize must be >= 1');
    }
    if (this.priorityLevels < 1) {
      throw new Error('priorityLevels must be >= 1');
    }
  }
}

/**
 * Request priority constants
 */
export const RequestPriority = {
  HIGH: 0, // Critical: delete, submit, pay
  NORMAL: 1, // Default: click, type, navigate
  LOW: 2, // Background: scroll, observe, watch
} as const;

/**
 * Export singleton instance
 */
export const requestQueue = new RequestQueue({
  maxConcurrent: 3,
  batchSize: 5,
  batchIntervalMs: 500,
  maxQueueSize: 100,
  priorityLevels: 3,
});
