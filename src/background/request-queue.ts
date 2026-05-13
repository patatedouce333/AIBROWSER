// Request queue with rate limiting and retry logic for Vertex AI
interface QueuedRequest {
  id: string;
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  priority: number;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
}

export class RequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private requestsThisMinute = 0;
  private minuteStart = Date.now();
  private readonly maxPerMinute: number;
  private readonly minDelayMs: number;

  constructor(options: { maxPerMinute?: number; minDelayMs?: number } = {}) {
    this.maxPerMinute = options.maxPerMinute || 55; // Safety margin vs 60 quota
    this.minDelayMs = options.minDelayMs || 1000;
  }

  async enqueue<T>(
    execute: () => Promise<T>,
    options: { priority?: number; maxRetries?: number } = {}
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: crypto.randomUUID(),
        execute,
        resolve,
        reject,
        priority: options.priority ?? 5,
        retryCount: 0,
        maxRetries: options.maxRetries ?? 3,
        createdAt: Date.now(),
      };

      // Insert by priority (lower number = higher priority)
      const insertIdx = this.queue.findIndex((r) => r.priority > request.priority);
      if (insertIdx === -1) {
        this.queue.push(request);
      } else {
        this.queue.splice(insertIdx, 0, request);
      }

      this.processNext();
    });
  }

  private async processNext() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      await this.waitForSlot();

      const request = this.queue.shift()!;
      const startTime = Date.now();

      try {
        const result = await request.execute();
        request.resolve(result);
        console.log(`Request ${request.id} completed in ${Date.now() - startTime}ms`);
      } catch (error: any) {
        console.error(`Request ${request.id} failed:`, error);

        if (this.isRetryable(error) && request.retryCount < request.maxRetries) {
          request.retryCount++;

          // Exponential backoff with jitter
          const backoff = Math.min(
            1000 * Math.pow(2, request.retryCount),
            30000 // Max 30s
          ) + Math.random() * 1000; // Jitter

          console.log(`Retrying request ${request.id} in ${backoff}ms (attempt ${request.retryCount}/${request.maxRetries})`);

          await this.sleep(backoff);
          this.queue.unshift(request); // Re-queue at front
        } else {
          request.reject(error);
        }
      }
    }

    this.processing = false;
  }

  private async waitForSlot() {
    const now = Date.now();

    // Reset counter every minute
    if (now - this.minuteStart > 60000) {
      this.requestsThisMinute = 0;
      this.minuteStart = now;
    }

    // Wait if quota exceeded
    if (this.requestsThisMinute >= this.maxPerMinute) {
      const waitTime = 60000 - (now - this.minuteStart) + 100;
      console.log(`Rate limit reached, waiting ${waitTime}ms`);
      await this.sleep(waitTime);
      this.requestsThisMinute = 0;
      this.minuteStart = Date.now();
    }

    // Minimum delay between requests
    await this.sleep(this.minDelayMs);
    this.requestsThisMinute++;
  }

  private isRetryable(error: any): boolean {
    const message = error.message || '';
    const status = error.status || 0;

    return (
      status === 429 || // Rate limited
      status === 503 || // Service unavailable
      status === 500 || // Server error
      message.includes('RESOURCE_EXHAUSTED') ||
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('fetch')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  // Get queue stats for debugging
  getStats() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      requestsThisMinute: this.requestsThisMinute,
      minuteStart: this.minuteStart,
    };
  }
}