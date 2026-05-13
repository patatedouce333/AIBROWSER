# IMPL-PHASE-2: Execution Plan & Code Implementation
**Phase 2 of 8 - Architectural Solutions | Status: READY TO IMPLEMENT**  
**Start Date:** May 11, 2026 | **Target Completion:** May 18, 2026  
**Effort:** 20-24 hours developer time

---

## EXECUTIVE SUMMARY

**Objective:** Implement 5 complete architectural solutions for API resilience, request optimization, and system observability

**Focus Areas:** Rate limiting, request queuing, state management, caching, monitoring

**Success Criteria:**
- ✓ All 5 architectural patterns implemented with tests passing
- ✓ Circuit breaker prevents API cascading failures
- ✓ Request queue batches actions efficiently
- ✓ Centralized state eliminates data inconsistencies
- ✓ DOM caching reduces redundant snapshots
- ✓ Comprehensive monitoring provides visibility
- ✓ Integration tests verify all patterns working together
- ✓ Performance benchmarks meet targets

---

## 5 ARCHITECTURAL IMPLEMENTATIONS

### IMPL-2.1: Circuit Breaker Pattern (API Rate Limiting)
**Priority:** CRITICAL | **Effort:** 4-5 hours  
**Status:** READY TO IMPLEMENT

**File to Create:** `src/shared/circuit-breaker.ts`

**Requirements:**
```typescript
export class CircuitBreaker {
  // States: CLOSED (normal) -> OPEN (failing) -> HALF_OPEN (testing)
  static CLOSED = 'CLOSED';      // Normal operation
  static OPEN = 'OPEN';          // Failing, reject requests
  static HALF_OPEN = 'HALF_OPEN'; // Testing, allow single request

  constructor(options?: CircuitBreakerOptions)
  
  async execute<T>(
    fn: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T>
  
  getState(): CircuitBreakerState
  reset(): void
}

// Must prevent:
// - Cascading API failures
// - Retry storms
// - Wasted compute on doomed requests
// - User-facing timeout delays
```

**Configuration:**
```typescript
interface CircuitBreakerOptions {
  failureThreshold?: number;     // Failures before opening (default: 5)
  successThreshold?: number;     // Successes to close (default: 2)
  timeout?: number;              // State timeout in ms (default: 60000)
  name?: string;                 // For logging
}
```

**State Machine:**
```
  CLOSED ──(failures > threshold)──> OPEN
    ▲                                  │
    │                                  │
    └─(timeout expires)─ HALF_OPEN ────┘
                          │
                (success) │ (failure)
                          ▼
                       CLOSED / OPEN
```

**Test Cases:**
- ✓ Starts in CLOSED state
- ✓ Opens after N consecutive failures
- ✓ Returns fallback in OPEN state
- ✓ Transitions to HALF_OPEN after timeout
- ✓ Closes on successful request in HALF_OPEN
- ✓ Reopens on failed request in HALF_OPEN
- ✓ Metrics tracking (success rate, failures)
- ✓ Per-API endpoint breakers

---

### IMPL-2.2: Request Queue System (Action Batching)
**Priority:** CRITICAL | **Effort:** 4-5 hours  
**Status:** READY TO IMPLEMENT

**File to Create:** `src/shared/request-queue.ts`

**Requirements:**
```typescript
export class RequestQueue {
  enqueue<T>(
    request: QueuedRequest<T>,
    priority?: number
  ): Promise<T>
  
  // Batch processing
  private async processBatch(): Promise<void>
  
  // Queue management
  getStats(): QueueStats
  pause(): void
  resume(): void
}

// Must handle:
// - Priority queuing
// - Batching of similar requests
// - Rate limiting (max requests/second)
// - Backpressure handling
// - Fair distribution (FIFO within priority)
```

**Configuration:**
```typescript
interface RequestQueueOptions {
  maxConcurrent?: number;        // Max simultaneous requests (default: 3)
  batchSize?: number;            // Actions per batch (default: 5)
  batchIntervalMs?: number;       // Max wait before processing (default: 500ms)
  maxQueueSize?: number;          // Max items before rejecting (default: 100)
  priorityLevels?: number;        // Priority queue levels (default: 3)
}

// Priority levels:
// 0 = HIGH (delete, submit, critical)
// 1 = NORMAL (click, type, default)
// 2 = LOW (scroll, observe, background)
```

**Batch Processing Logic:**
```
Request arrives -> Add to priority queue
                ↓
        Wait for batch interval OR batch size reached
                ↓
        Process up to maxConcurrent in parallel
                ↓
        Return results in order
```

**Test Cases:**
- ✓ Enqueues requests in priority order
- ✓ Batches requests efficiently
- ✓ Respects maxConcurrent limit
- ✓ Processes batches on timer or size threshold
- ✓ Rejects requests when queue full
- ✓ Maintains FIFO within priority level
- ✓ Pauses and resumes processing
- ✓ Reports queue stats (size, depth, latency)

---

### IMPL-2.3: State Management Refactor (Centralized Store)
**Priority:** HIGH | **Effort:** 5-6 hours  
**Status:** READY TO IMPLEMENT

**Files to Create:**
- `src/shared/store.ts` - State management system
- `src/shared/store-types.ts` - Type definitions

**Requirements:**
```typescript
export class Store {
  // State management with subscriptions
  getState<T>(path: string): T
  setState<T>(path: string, value: T): void
  
  // Atomic updates
  updateState(updates: Record<string, any>): void
  
  // Subscriptions
  subscribe(path: string, callback: (value: any) => void): Unsubscribe
  
  // History/undo
  getHistory(): StateSnapshot[]
  undo(): void
  redo(): void
}

// State structure:
// {
//   auth: { token, expiresAt, refreshToken }
//   tasks: { [id]: Task }
//   tabs: { [tabId]: TabState }
//   actions: { queue, executing, completed }
//   cache: { snapshots, mutations }
//   errors: { lastError, errorHistory }
// }
```

**Features:**
```typescript
interface Store {
  // Auth state
  auth: {
    authenticated: boolean;
    token: string;
    expiresAt: number;
    refreshToken: string;
  };

  // Task management
  tasks: Record<string, Task>;
  activeTaskId: string | null;

  // Tab tracking
  tabs: Record<number, TabState>;
  activeTabId: number | null;

  // Action execution
  actions: {
    queue: QueuedAction[];
    executing: QueuedAction | null;
    completed: QueuedAction[];
  };

  // Caching
  cache: {
    snapshots: Record<number, DOMSnapshot>;
    mutations: Record<number, Mutation[]>;
  };

  // Error tracking
  errors: {
    lastError: Error | null;
    errorHistory: Error[];
  };
}
```

**Test Cases:**
- ✓ Gets and sets state values
- ✓ Supports nested paths (auth.token)
- ✓ Notifies subscribers on state change
- ✓ Unsubscribe removes listeners
- ✓ Atomic batched updates
- ✓ State snapshots for history
- ✓ Undo/redo functionality
- ✓ No direct state mutations (immutable)
- ✓ Type-safe state access

---

### IMPL-2.4: Caching Strategy (DOM Snapshots)
**Priority:** HIGH | **Effort:** 3-4 hours  
**Status:** READY TO IMPLEMENT

**File to Create:** `src/shared/dom-cache.ts`

**Requirements:**
```typescript
export class DOMCache {
  // Get cached snapshot
  getSnapshot(tabId: number, key?: string): DOMSnapshot | null
  
  // Store snapshot with TTL
  setSnapshot(
    tabId: number,
    snapshot: DOMSnapshot,
    ttlMs?: number
  ): void
  
  // Cache invalidation
  invalidate(tabId: number, pattern?: string): void
  
  // Statistics
  getStats(): CacheStats
}

// Must handle:
// - TTL-based expiration (default: 30 seconds)
// - Size limits (max 50MB total, 5MB per tab)
// - Compression of snapshots
// - Versioning (detect stale snapshots)
// - Tab isolation (tab close clears cache)
```

**Configuration:**
```typescript
interface CacheConfig {
  maxTotalSize?: number;         // Max cache size (default: 50MB)
  maxTabSize?: number;           // Per-tab limit (default: 5MB)
  defaultTtlMs?: number;         // Default TTL (default: 30000ms)
  compressionThreshold?: number;  // Compress if > threshold (default: 1KB)
}
```

**Invalidation Strategy:**
```
- Timer-based: Expire after TTL
- Event-based: Invalidate on mutation/navigation
- Size-based: LRU eviction when full
- Tab-based: Clear on tab close
- Pattern-based: Match selector patterns
```

**Test Cases:**
- ✓ Stores and retrieves snapshots
- ✓ TTL expiration works correctly
- ✓ Size limits enforced
- ✓ Compression enabled for large snapshots
- ✓ Tab isolation (no cross-tab leaks)
- ✓ Pattern-based invalidation
- ✓ Stats reporting (hit rate, size)
- ✓ LRU eviction under pressure

---

### IMPL-2.5: Monitoring & Observability (Comprehensive Logging)
**Priority:** HIGH | **Effort:** 4-5 hours  
**Status:** READY TO IMPLEMENT

**Files to Create:**
- `src/shared/logger.ts` - Structured logging
- `src/shared/metrics.ts` - Performance metrics
- `src/shared/tracer.ts` - Request tracing

**Requirements:**

**Logger:**
```typescript
export class Logger {
  debug(message: string, data?: any): void
  info(message: string, data?: any): void
  warn(message: string, data?: any): void
  error(message: string, error?: Error, data?: any): void
  
  // Context tracking
  setContext(key: string, value: any): void
  clearContext(): void
  
  // Log levels
  setLevel(level: LogLevel): void
}

// Log format:
// {
//   timestamp: ISO8601,
//   level: DEBUG|INFO|WARN|ERROR,
//   service: cometeor,
//   message: string,
//   context: { taskId, tabId, userId },
//   error?: { message, stack, type },
//   duration?: ms,
//   tags: string[]
// }
```

**Metrics:**
```typescript
export class Metrics {
  // Record metrics
  recordLatency(operation: string, ms: number): void
  recordCounter(name: string, value: number): void
  recordGauge(name: string, value: number): void
  
  // Retrieve metrics
  getMetrics(name?: string): Metric[]
  reset(): void
}

// Key metrics:
// - Action latency (p50, p95, p99)
// - API success rate
// - Queue depth
// - Cache hit rate
// - Circuit breaker state changes
// - Token refresh count
// - Content script heartbeat count
```

**Tracer:**
```typescript
export class Tracer {
  startSpan(operation: string, parent?: Span): Span
  
  // Usage:
  // const span = tracer.startSpan('executeAction');
  // try {
  //   await executeAction();
  // } catch (e) {
  //   span.recordException(e);
  // } finally {
  //   span.end();
  // }
}
```

**Test Cases:**
- ✓ Structured log output
- ✓ Log level filtering
- ✓ Context propagation
- ✓ Metrics aggregation
- ✓ Latency percentiles (p50, p95, p99)
- ✓ Tracer span hierarchy
- ✓ Error recording with stack traces
- ✓ Performance tracking

---

## IMPLEMENTATION SEQUENCE

### Week 1: IMPL-2.1 + IMPL-2.2
```
Monday:
- IMPL-2.1: Circuit Breaker (4-5 hours)
  ├─ Write src/shared/circuit-breaker.ts
  ├─ Implement state machine
  ├─ Write tests/unit/circuit-breaker.test.ts
  └─ Integrate with VertexClient

Tuesday:
- IMPL-2.2: Request Queue (4-5 hours)
  ├─ Write src/shared/request-queue.ts
  ├─ Priority queue implementation
  ├─ Batch processing logic
  ├─ Write tests/unit/request-queue.test.ts
  └─ Integrate with ActionExecutor
```

### Week 2: IMPL-2.3 + IMPL-2.4
```
Wednesday:
- IMPL-2.3: Store & State (5-6 hours)
  ├─ Write src/shared/store.ts
  ├─ Write src/shared/store-types.ts
  ├─ Subscription system
  ├─ History & undo/redo
  ├─ Write tests/unit/store.test.ts
  └─ Migrate existing state

Thursday:
- IMPL-2.4: DOM Cache (3-4 hours)
  ├─ Write src/shared/dom-cache.ts
  ├─ TTL & size management
  ├─ Compression logic
  ├─ Write tests/unit/dom-cache.test.ts
  └─ Integrate with snapshot handling
```

### Week 3: IMPL-2.5 + Integration
```
Friday:
- IMPL-2.5: Monitoring & Logging (4-5 hours)
  ├─ Write src/shared/logger.ts
  ├─ Write src/shared/metrics.ts
  ├─ Write src/shared/tracer.ts
  ├─ Write tests/unit/logging.test.ts
  └─ Write tests/unit/metrics.test.ts

Saturday:
- Integration Testing & Verification
  ├─ Test all patterns working together
  ├─ Verify performance benchmarks
  ├─ Run full test suite
  ├─ Code review (architecture gates)
  └─ Documentation update
```

---

## FILE CHANGES SUMMARY

### New Files (5 Created)
```
src/shared/circuit-breaker.ts          (200 lines)
src/shared/request-queue.ts            (250 lines)
src/shared/store.ts                    (300 lines)
src/shared/store-types.ts              (100 lines)
src/shared/dom-cache.ts                (200 lines)
src/shared/logger.ts                   (150 lines)
src/shared/metrics.ts                  (150 lines)
src/shared/tracer.ts                   (120 lines)
```

### Modified Files (3 Updated)
```
src/background/action-executor.ts      (use queue + circuit breaker)
src/background/vertex-client.ts        (use circuit breaker + logger)
src/background/index.ts                (use store + metrics)
```

### Test Files (5 Created)
```
tests/unit/circuit-breaker.test.ts
tests/unit/request-queue.test.ts
tests/unit/store.test.ts
tests/unit/dom-cache.test.ts
tests/unit/logging.test.ts
tests/unit/metrics.test.ts
tests/unit/tracer.test.ts
tests/integration/architecture.test.ts
```

---

## BUILD & TEST VERIFICATION

```bash
# Day 1 EOD
npm run build:dev
npm test -- tests/unit/circuit-breaker.test.ts
npm test -- tests/unit/request-queue.test.ts

# Day 2 EOD
npm test -- tests/unit/store.test.ts
npm test -- tests/unit/dom-cache.test.ts

# Day 3 EOD
npm test -- tests/unit/logging.test.ts
npm test -- tests/unit/metrics.test.ts
npm test -- tests/unit/tracer.test.ts
npm test -- tests/integration/

# Final Check
npm run lint
npm run typecheck
npm run test:coverage
# Expected: >85% coverage overall, 100% for architectural patterns
```

---

## QUALITY GATES (Before Merge)

- [ ] All unit tests passing (100%)
- [ ] All integration tests passing (100%)
- [ ] Code coverage ≥85%
- [ ] Architectural patterns verified
- [ ] Performance benchmarks met
  - Circuit breaker: <1ms routing overhead
  - Queue: <10ms batching latency
  - Cache: >80% hit rate
  - Logging: <5ms per log entry
- [ ] No race conditions (verified with tests)
- [ ] TypeScript strict mode passing
- [ ] ESLint 0 warnings
- [ ] Code review approved
- [ ] Changelog updated

---

## PERFORMANCE TARGETS

```
Circuit Breaker:
- State transition: <1ms
- Open state rejection: <0.5ms
- Metrics tracking: <1ms overhead

Request Queue:
- Enqueue operation: <5ms
- Batch processing: <50ms per batch
- Priority sorting: <10ms

State Management:
- Set/get operations: <1ms
- Subscription notification: <5ms
- State snapshots: <10ms

DOM Cache:
- Cache hit: <1ms
- Cache miss (fallback): <100ms
- Compression/decompression: <20ms
- TTL check: <1ms

Logging:
- Log entry creation: <2ms
- Metric recording: <1ms
- Trace span: <1ms
```

---

## ROLLBACK PLAN

If critical issue found during testing:

```bash
# Revert all Phase 2 changes
git reset --hard HEAD~8  # Adjust based on number of commits

# Or manually revert specific files
git checkout main -- src/shared/circuit-breaker.ts
git checkout main -- src/shared/request-queue.ts
git checkout main -- src/shared/store.ts
```

---

## EXECUTION STATUS

**Current Time:** May 11, 2026  
**Phase 2 Starting:** YES  
**Estimated Completion:** May 18, 2026

**Progress Tracking:**
- [ ] Day 1: IMPL-2.1 + IMPL-2.2 (8-10 hours)
- [ ] Day 2: IMPL-2.3 + IMPL-2.4 (8-10 hours)
- [ ] Day 3: IMPL-2.5 + Integration (4-5 hours)

---

**Next: Begin IMPL-2.1 implementation → Write CircuitBreaker class**
