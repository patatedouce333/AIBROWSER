# Phase 5: Testing Strategy & Test Plan
**Cometeor Extension: Comprehensive Test Coverage Design**  
**Date:** May 2026 | **Status:** Planning Phase | **Audience:** Engineering Team

---

## Executive Summary

**Current State:** 0% test coverage  
**Target State:** 85%+ coverage (unit + integration); 100% for critical paths  
**Estimated Effort:** 5-7 days (unit: 2 days, integration: 2 days, E2E: 1-2 days)

**Testing Pyramid:**
```
        ⬠ E2E Tests (5 tests, ~10s each)
       ⬠⬠ Integration Tests (20 tests, ~100ms each)
      ⬠⬠⬠⬠⬠ Unit Tests (80+ tests, ~1ms each)
```

---

## Testing Pyramid for Cometeor

| Layer | Type | Count | Speed | Tools | Purpose |
|-------|------|-------|-------|-------|---------|
| **Unit** | Isolated class/function tests | 80+ | <1ms | Jest, ts-jest | Fast feedback, code correctness |
| **Integration** | Message routing, task execution | 20 | ~100ms | Jest + mocks | Verify component interactions |
| **E2E** | Real browser automation | 5 | ~2-10s | Puppeteer | Real user workflows |
| **Security** | Injection, CSRF, XSS | 8 | ~100ms | Jest | Vulnerability detection |
| **Performance** | Latency, memory, throughput | 5 | ~1s | Custom | Regression prevention |

---

## UNIT TESTS (Target: 60+ tests)

### Category 1: Validation & Input Security

**File:** `tests/unit/validators.test.ts`  
**Classes to test:** ActionValidator, ConfigValidator, SelectorValidator

#### Test: ActionValidator.isValidSelector()
```typescript
describe('ActionValidator.isValidSelector', () => {
  it('accepts valid CSS selectors', () => {
    expect(validate('button.submit')).toBe(true);
    expect(validate('#user-menu')).toBe(true);
    expect(validate('input[type="email"]')).toBe(true);
    expect(validate('div > span:first-child')).toBe(true);
  });

  it('rejects XSS injection attempts', () => {
    expect(validate('img[src="x" onerror="alert(1)"]')).toBe(false);
    expect(validate('"><script>alert(1)</script>')).toBe(false);
    expect(validate('onclick="alert(1)"')).toBe(false);
    expect(validate('javascript:void(0)')).toBe(false);
  });

  it('rejects invalid CSS selectors', () => {
    expect(validate('!!invalid[[')).toBe(false);
    expect(validate('>>> bad selector')).toBe(false);
  });

  it('rejects Unicode escape attempts', () => {
    expect(validate('\\0041\\0042\\0043')).toBe(false); // ABC in Unicode
  });
});
```

**Coverage target:** 100% (security-critical)  
**Effort:** 3-4 hours

---

#### Test: ConfigValidator.validate()
```typescript
describe('ConfigValidator.validate', () => {
  it('accepts valid config', () => {
    const config = {
      oauth: { clientId: 'abc123', clientSecret: 'xyz', redirectUri: 'http://localhost:8080' },
      vertex: { projectId: 'my-project', region: 'us-central1', model: 'gemini-2.0-flash' },
      api: { rateLimitPerMinute: 55, requestTimeoutMs: 30000 },
      features: { enableAutoRetry: true, enableCircuitBreaker: true, enableDeltaSnapshots: true }
    };
    expect(() => validate(config)).not.toThrow();
  });

  it('rejects missing required fields', () => {
    const config = { oauth: { clientId: '' } }; // Missing fields
    expect(() => validate(config)).toThrow('Missing oauth.clientId');
  });

  it('validates format of IDs', () => {
    const config = {
      oauth: { clientId: 'not-a-valid-id!@#$' } // Invalid format
    };
    expect(() => validate(config)).toThrow('Invalid clientId format');
  });

  it('validates enum fields', () => {
    const config = {
      vertex: { region: 'invalid-region' } // Invalid enum
    };
    expect(() => validate(config)).toThrow('Invalid region; must be us-central1, us-east1, or europe-west1');
  });
});
```

**Coverage target:** 100%  
**Effort:** 2-3 hours

---

### Category 2: Token Management & Synchronization

**File:** `tests/unit/token-manager.test.ts`  
**Classes to test:** TokenManager

#### Test: TokenManager.getAccessToken() with concurrent requests
```typescript
describe('TokenManager.getAccessToken()', () => {
  it('prevents concurrent refreshes (mutex pattern)', async () => {
    const mockExchange = jest.fn().mockResolvedValue({
      accessToken: 'new-token',
      expiresInSeconds: 3600
    });
    
    const manager = new TokenManager();
    manager.setExchangeFunction(mockExchange);
    
    // Simulate two concurrent requests while token is expired
    const promise1 = manager.getAccessToken();
    const promise2 = manager.getAccessToken();
    
    const [token1, token2] = await Promise.all([promise1, promise2]);
    
    // Both should get same token
    expect(token1).toBe(token2);
    expect(token1).toBe('new-token');
    
    // API should only be called once, not twice
    expect(mockExchange).toHaveBeenCalledTimes(1);
  });

  it('returns cached token if not expired', async () => {
    const manager = new TokenManager();
    manager.setToken('cached-token', Date.now() + 10 * 60 * 1000); // 10 min from now
    
    const token = await manager.getAccessToken();
    expect(token).toBe('cached-token');
  });

  it('refreshes token if expiring soon (5min buffer)', async () => {
    const mockExchange = jest.fn().mockResolvedValue({
      accessToken: 'refreshed-token',
      expiresInSeconds: 3600
    });
    
    const manager = new TokenManager();
    manager.setToken('old-token', Date.now() + 2 * 60 * 1000); // Expires in 2 min
    manager.setExchangeFunction(mockExchange);
    
    const token = await manager.getAccessToken();
    
    // Should refresh because expiry < 5min buffer
    expect(token).toBe('refreshed-token');
    expect(mockExchange).toHaveBeenCalled();
  });

  it('propagates refresh failures to all callers', async () => {
    const mockExchange = jest.fn().mockRejectedValue(new Error('Network error'));
    const manager = new TokenManager();
    manager.setExchangeFunction(mockExchange);
    
    const promise1 = manager.getAccessToken();
    const promise2 = manager.getAccessToken();
    
    await expect(Promise.all([promise1, promise2])).rejects.toThrow('Network error');
    // Both callers see same error
  });
});
```

**Coverage target:** 100% (security-critical)  
**Effort:** 4-5 hours

---

### Category 3: Error Handling & Retry

**File:** `tests/unit/action-executor.test.ts`  
**Classes to test:** ActionExecutor, executeActionWithRetry()

#### Test: executeActionWithRetry()
```typescript
describe('executeActionWithRetry()', () => {
  it('succeeds on first attempt (no retry needed)', async () => {
    const mockExecute = jest.fn().mockResolvedValue({ success: true });
    
    const result = await executeActionWithRetry(
      { type: 'click', selector: 'button' },
      mockExecute
    );
    
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('retries transient errors with exponential backoff', async () => {
    jest.useFakeTimers();
    
    const mockExecute = jest
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ success: true });
    
    const resultPromise = executeActionWithRetry(
      { type: 'click', selector: 'button' },
      mockExecute
    );
    
    // First attempt fails immediately
    await jest.advanceTimersByTimeAsync(10);
    
    // Wait for backoff: 100ms
    await jest.advanceTimersByTimeAsync(100);
    
    // Second attempt fails at 100ms
    // Wait for backoff: 200ms
    await jest.advanceTimersByTimeAsync(200);
    
    // Third attempt succeeds at 300ms
    const result = await resultPromise;
    
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(3);
    expect(mockExecute).toHaveBeenCalledTimes(3);
    
    jest.useRealTimers();
  });

  it('gives up after 3 attempts', async () => {
    const mockExecute = jest.fn().mockRejectedValue(new Error('permanent failure'));
    
    const result = await executeActionWithRetry(
      { type: 'click', selector: 'button' },
      mockExecute
    );
    
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.error).toBe('permanent failure');
  });

  it('fails immediately on permanent errors (no retry)', async () => {
    const mockExecute = jest.fn().mockResolvedValue({
      success: false,
      error: 'Selector not found in DOM' // Permanent
    });
    
    const result = await executeActionWithRetry(
      { type: 'click', selector: '.not-there' },
      mockExecute
    );
    
    // Should fail immediately, not retry permanent error
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
  });

  it('respects timeout (30 seconds)', async () => {
    jest.useFakeTimers();
    
    const mockExecute = jest.fn(
      () => new Promise(resolve => setTimeout(() => resolve({ success: true }), 60000))
    );
    
    const resultPromise = executeActionWithRetry(
      { type: 'click', selector: 'button' },
      mockExecute,
      { timeoutMs: 30000 }
    );
    
    await jest.advanceTimersByTimeAsync(30000);
    
    const result = await resultPromise;
    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
    
    jest.useRealTimers();
  });

  it('stops retrying critical actions on first failure', async () => {
    const mockExecute = jest.fn().mockRejectedValue(new Error('API error'));
    
    const result = await executeActionWithRetry(
      { type: 'submit' }, // Critical action
      mockExecute
    );
    
    // Should NOT retry critical actions
    expect(result.attempts).toBe(1);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});
```

**Coverage target:** 100%  
**Effort:** 5-6 hours

---

### Category 4: Circuit Breaker

**File:** `tests/unit/circuit-breaker.test.ts`  
**Classes to test:** CircuitBreaker

#### Test: CircuitBreaker state transitions
```typescript
describe('CircuitBreaker', () => {
  it('starts in CLOSED state (normal operation)', async () => {
    const breaker = new CircuitBreaker();
    const mockFn = jest.fn().mockResolvedValue('success');
    
    const result = await breaker.executeWithBreaker(mockFn, 'test');
    expect(result).toBe('success');
  });

  it('opens after 3 consecutive 429 failures', async () => {
    const breaker = new CircuitBreaker();
    const mockFn = jest.fn().mockRejectedValue(
      Object.assign(new Error('Too many requests'), { name: 'RateLimitError' })
    );
    
    // First failure
    await expect(breaker.executeWithBreaker(mockFn, 'test')).rejects.toThrow();
    
    // Second failure
    await expect(breaker.executeWithBreaker(mockFn, 'test')).rejects.toThrow();
    
    // Third failure - circuit opens
    await expect(breaker.executeWithBreaker(mockFn, 'test')).rejects.toThrow();
    
    // Fourth call should fail immediately with circuit open error
    const fourthCall = breaker.executeWithBreaker(mockFn, 'test');
    await expect(fourthCall).rejects.toThrow('Circuit breaker OPEN');
    
    // Verify API was only called 3 times, not 4
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('transitions to HALF_OPEN after cooldown expires', async () => {
    jest.useFakeTimers();
    const breaker = new CircuitBreaker({ cooldownMs: 5000 });
    
    const mockFn = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('Rate limit'), { name: 'RateLimitError' }))
      .mockRejectedValueOnce(Object.assign(new Error('Rate limit'), { name: 'RateLimitError' }))
      .mockRejectedValueOnce(Object.assign(new Error('Rate limit'), { name: 'RateLimitError' }));
    
    // Trigger 3 failures to open circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.executeWithBreaker(mockFn, 'test')).rejects.toThrow();
    }
    
    // Circuit is OPEN; next call fails immediately
    await expect(breaker.executeWithBreaker(mockFn, 'test')).rejects.toThrow('Circuit breaker OPEN');
    expect(mockFn).toHaveBeenCalledTimes(3); // Not called again
    
    // Advance time past cooldown
    jest.advanceTimersByTime(5000);
    
    // Transition to HALF_OPEN; allow one test call
    const testCall = breaker.executeWithBreaker(mockFn, 'test');
    expect(mockFn).toHaveBeenCalledTimes(4); // Now called
    
    jest.useRealTimers();
  });

  it('closes circuit if HALF_OPEN test succeeds', async () => {
    jest.useFakeTimers();
    const breaker = new CircuitBreaker({ cooldownMs: 5000 });
    
    // Open the circuit
    const mockFn = jest.fn().mockRejectedValue(
      Object.assign(new Error('Rate limit'), { name: 'RateLimitError' })
    );
    for (let i = 0; i < 3; i++) {
      await expect(breaker.executeWithBreaker(mockFn, 'test')).rejects.toThrow();
    }
    
    jest.advanceTimersByTime(5000);
    
    // Now provide a successful response for HALF_OPEN test
    const mockSuccessFn = jest.fn().mockResolvedValue('recovered');
    
    const result = await breaker.executeWithBreaker(mockSuccessFn, 'test');
    expect(result).toBe('recovered');
    
    // Circuit should be CLOSED now; can execute normally
    const normalFn = jest.fn().mockResolvedValue('normal');
    const normalResult = await breaker.executeWithBreaker(normalFn, 'test');
    expect(normalResult).toBe('normal');
    
    jest.useRealTimers();
  });

  it('reopens and escalates cooldown if HALF_OPEN test fails', async () => {
    jest.useFakeTimers();
    const breaker = new CircuitBreaker({ cooldownMs: 5000 });
    
    // Open circuit
    const failFn = jest.fn().mockRejectedValue(
      Object.assign(new Error('Rate limit'), { name: 'RateLimitError' })
    );
    for (let i = 0; i < 3; i++) {
      await expect(breaker.executeWithBreaker(failFn, 'test')).rejects.toThrow();
    }
    
    jest.advanceTimersByTime(5000);
    
    // HALF_OPEN test fails
    await expect(breaker.executeWithBreaker(failFn, 'test')).rejects.toThrow();
    
    // Circuit should be OPEN again with longer cooldown (10s)
    await expect(breaker.executeWithBreaker(failFn, 'test')).rejects.toThrow('Circuit breaker OPEN');
    
    // Advance by original 5s - should still be open
    jest.advanceTimersByTime(5000);
    await expect(breaker.executeWithBreaker(failFn, 'test')).rejects.toThrow('Circuit breaker OPEN');
    
    // Advance by additional 5s (total 10s) - now try again
    jest.advanceTimersByTime(5000);
    // Should transition to HALF_OPEN again (next call will test recovery)
    
    jest.useRealTimers();
  });
});
```

**Coverage target:** 100%  
**Effort:** 4-5 hours

---

### Category 5: Message Routing

**File:** `tests/unit/message-dispatcher.test.ts`  
**Classes to test:** MessageDispatcher

#### Test: MessageDispatcher routing
```typescript
describe('MessageDispatcher', () => {
  it('routes messages to correct handler by type', async () => {
    const dispatcher = new MessageDispatcher();
    
    const configHandler = jest.fn().mockResolvedValue({ updated: true });
    const taskHandler = jest.fn().mockResolvedValue({ taskId: '123' });
    
    dispatcher.register('CONFIG_UPDATED', configHandler);
    dispatcher.register('START_TASK', taskHandler);
    
    const result1 = await dispatcher.dispatch(
      { type: 'CONFIG_UPDATED', payload: { key: 'vertex', value: { projectId: 'abc' } }, timestamp: Date.now() },
      { url: 'chrome://...' } as any
    );
    
    expect(configHandler).toHaveBeenCalled();
    expect(taskHandler).not.toHaveBeenCalled();
    
    const result2 = await dispatcher.dispatch(
      { type: 'START_TASK', payload: { task: 'Search Google' }, timestamp: Date.now() },
      { url: 'chrome://...' } as any
    );
    
    expect(taskHandler).toHaveBeenCalled();
  });

  it('throws error if no handler registered for message type', async () => {
    const dispatcher = new MessageDispatcher();
    
    const result = await dispatcher.dispatch(
      { type: 'UNKNOWN_TYPE', payload: {}, timestamp: Date.now() },
      {} as any
    );
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('No handler for message type: UNKNOWN_TYPE');
  });

  it('catches handler errors and returns error response', async () => {
    const dispatcher = new MessageDispatcher();
    const badHandler = jest.fn().mockRejectedValue(new Error('Handler crashed'));
    
    dispatcher.register('BAD_MESSAGE', badHandler);
    
    const result = await dispatcher.dispatch(
      { type: 'BAD_MESSAGE', payload: {}, timestamp: Date.now() },
      {} as any
    );
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Handler crashed');
  });
});
```

**Coverage target:** 100%  
**Effort:** 2-3 hours

---

### Category 6: DOM Snapshot Manager

**File:** `tests/unit/dom-snapshot-manager.test.ts`  
**Classes to test:** DOMSnapshotManager

#### Test: DOM debouncing and delta snapshots
```typescript
describe('DOMSnapshotManager', () => {
  it('debounces mutations (does not snapshot on every change)', async () => {
    jest.useFakeTimers();
    const manager = new DOMSnapshotManager();
    const mockAnalyze = jest.fn().mockResolvedValue({});
    
    manager.setAnalyzeFunction(mockAnalyze);
    
    // Simulate 100 mutations in quick succession
    for (let i = 0; i < 100; i++) {
      manager.recordMutation({ type: 'add', selector: 'div', timestamp: Date.now() });
    }
    
    // Snapshot should not be called yet (debounced)
    expect(mockAnalyze).not.toHaveBeenCalled();
    
    // Advance past debounce window (100ms)
    jest.advanceTimersByTime(100);
    
    // Now snapshot should be called once (not 100 times)
    expect(mockAnalyze).toHaveBeenCalledTimes(1);
    
    // Snapshot should include all mutations
    const call = mockAnalyze.mock.calls[0][0];
    expect(call.mutations).toBe(100);
    
    jest.useRealTimers();
  });

  it('uses delta snapshots for small changes', async () => {
    const manager = new DOMSnapshotManager();
    const mockAnalyze = jest.fn().mockResolvedValue({});
    
    manager.setFullSnapshot('<div id="root">...</div>'); // 100 bytes
    manager.setAnalyzeFunction(mockAnalyze);
    
    // Record small mutation
    manager.recordMutation({ type: 'update', selector: '#root', timestamp: Date.now() });
    
    await manager.generateSnapshot();
    
    // Should send delta (small)
    const call = mockAnalyze.mock.calls[0][0];
    expect(call.type).toBe('delta');
    expect(call.size).toBeLessThan(100 * 0.5); // <50% of full
  });

  it('falls back to full snapshot if delta is >50%', async () => {
    const manager = new DOMSnapshotManager();
    const mockAnalyze = jest.fn().mockResolvedValue({});
    
    manager.setFullSnapshot('X'.repeat(1000)); // 1000 bytes
    manager.setAnalyzeFunction(mockAnalyze);
    
    // Record many mutations
    for (let i = 0; i < 50; i++) {
      manager.recordMutation({ type: 'add', selector: `#elem${i}`, timestamp: Date.now() });
    }
    
    await manager.generateSnapshot();
    
    // Delta would be >500 bytes (>50%), so use full
    const call = mockAnalyze.mock.calls[0][0];
    expect(call.type).toBe('full');
  });
});
```

**Coverage target:** 95%  
**Effort:** 3-4 hours

---

## INTEGRATION TESTS (Target: 20 tests)

### Test Suite 1: Task Execution Flow

**File:** `tests/integration/task-execution.test.ts`

#### Test: Complete task execution with retries and circuit breaker
```typescript
describe('Task Execution Flow (Integration)', () => {
  it('executes task with multiple actions and retries on transient failures', async () => {
    // Setup mocks
    const mockVertexAI = jest.fn()
      .mockResolvedValueOnce({ actions: [{ type: 'click', selector: 'button' }] })
      .mockResolvedValueOnce({ actions: [{ type: 'type', text: 'search' }] })
      .mockResolvedValueOnce({ actions: [] }); // Done
    
    const mockContentScript = jest
      .fn()
      .mockRejectedValueOnce(new Error('timeout')) // First attempt fails
      .mockResolvedValueOnce({ success: true }) // Retry succeeds
      .mockResolvedValueOnce({ success: true });
    
    // Execute task
    const taskManager = new TaskManager();
    taskManager.setVertexAI(mockVertexAI);
    taskManager.setContentScriptExecutor(mockContentScript);
    
    const result = await taskManager.executeTask({
      userPrompt: 'Search Google for TypeScript',
      tabId: 123
    });
    
    // Verify success
    expect(result.success).toBe(true);
    expect(result.completedActions).toBe(2);
    
    // Verify retry happened
    expect(mockContentScript).toHaveBeenCalledTimes(3); // 1 failed + 2 retried
  });

  it('stops task immediately if critical action fails', async () => {
    const mockVertexAI = jest.fn().mockResolvedValue({
      actions: [{ type: 'submit' }] // Critical action
    });
    
    const mockContentScript = jest.fn().mockRejectedValue(new Error('Action failed'));
    
    const taskManager = new TaskManager();
    taskManager.setVertexAI(mockVertexAI);
    taskManager.setContentScriptExecutor(mockContentScript);
    
    const result = await taskManager.executeTask({
      userPrompt: 'Delete my account',
      tabId: 123
    });
    
    // Should fail immediately, not retry
    expect(result.success).toBe(false);
    expect(mockContentScript).toHaveBeenCalledTimes(1);
  });

  it('stops task and returns error when circuit breaker opens', async () => {
    const mockVertexAI = jest.fn()
      .mockRejectedValue(Object.assign(new Error('Rate limited'), { name: 'RateLimitError' }));
    
    const taskManager = new TaskManager();
    taskManager.setVertexAI(mockVertexAI);
    
    // Make 3 calls to trigger circuit breaker
    for (let i = 0; i < 3; i++) {
      await expect(
        taskManager.executeTask({ userPrompt: 'Task', tabId: 123 })
      ).rejects.toThrow();
    }
    
    // Fourth call should fail immediately with circuit breaker error
    const result = await taskManager.executeTask({ userPrompt: 'Task', tabId: 123 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('circuit breaker');
  });
});
```

**Coverage target:** 90%  
**Effort:** 4 hours

---

### Test Suite 2: Message Routing & State Consistency

**File:** `tests/integration/message-routing.test.ts`

#### Test: Messages don't race each other
```typescript
describe('Message Routing (Integration)', () => {
  it('config update and task start do not race', async () => {
    const dispatcher = new MessageDispatcher();
    const configManager = new ConfigManager();
    const taskManager = new TaskManager();
    
    dispatcher.register('CONFIG_UPDATED', async (msg) => {
      await configManager.set(msg.payload.key, msg.payload.value);
    });
    
    dispatcher.register('START_TASK', async (msg) => {
      const config = await configManager.get('vertex');
      // Should see the updated config, not stale config
      return taskManager.createTask(msg.payload.task);
    });
    
    // Send config update
    await dispatcher.dispatch({
      type: 'CONFIG_UPDATED',
      payload: { key: 'vertex', value: { projectId: 'new-project' } },
      timestamp: Date.now()
    }, {} as any);
    
    // Immediately send task start
    const result = await dispatcher.dispatch({
      type: 'START_TASK',
      payload: { task: 'Search' },
      timestamp: Date.now()
    }, {} as any);
    
    // Task should see new config (no race condition)
    expect(result.success).toBe(true);
  });
});
```

**Coverage target:** 90%  
**Effort:** 2-3 hours

---

### Test Suite 3: Token Refresh Coordination

**File:** `tests/integration/token-refresh.test.ts`

#### Test: Concurrent auth requests coordinate token refresh
```typescript
describe('Token Refresh (Integration)', () => {
  it('multiple concurrent requests share single token refresh', async () => {
    const mockExchange = jest.fn().mockResolvedValue({
      accessToken: 'new-token',
      expiresInSeconds: 3600
    });
    
    const vertexClient = new VertexAIClient();
    vertexClient.setTokenManager(tokenManager);
    
    // Simulate 5 concurrent requests (all see expired token)
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        vertexClient.analyzeDOM('<div>page</div>')
      );
    }
    
    const results = await Promise.all(promises);
    
    // All should succeed
    expect(results.every(r => r.success)).toBe(true);
    
    // Token refresh API should be called only once
    expect(mockExchange).toHaveBeenCalledTimes(1);
  });
});
```

**Coverage target:** 95%  
**Effort:** 2 hours

---

## E2E TESTS (Target: 5 tests)

**File:** `tests/e2e/workflows.test.ts`  
**Framework:** Puppeteer + Jest  
**Test environment:** Real Chrome browser with extension loaded

### E2E Test 1: Search & Navigate
```typescript
describe('E2E: Search & Navigate', () => {
  let browser: Browser;
  let page: Page;
  let extensionId: string;

  beforeAll(async () => {
    const extensionPath = path.resolve(__dirname, '../../dist');
    browser = await puppeteer.launch({
      headless: false,
      args: [
        `--load-extension=${extensionPath}`,
        '--disable-extensions-except=' + extensionPath,
      ],
    });
    
    // Get extension ID from background page
    const extensionPage = await browser.target().createCDPSession().send('Target.createTarget', {
      url: 'chrome://extensions'
    });
    extensionId = extensionPage.targetId.split('-')[0];
  });

  it('searches Google and clicks first result', async () => {
    page = await browser.newPage();
    await page.goto('https://google.com');
    
    // Open extension sidebar
    await page.evaluate(() => {
      window.postMessage({ type: 'OPEN_SIDEBAR' }, '*');
    });
    
    // Inject task via extension
    await page.evaluate((taskId: string) => {
      chrome.runtime.sendMessage({
        type: 'START_TASK',
        payload: {
          task: 'Search for TypeScript',
          tabId: chrome.devtools.inspectedWindowTabId
        }
      });
    }, extensionId);
    
    // Wait for task to complete
    await page.waitForTimeout(5000);
    
    // Verify we're on a results page
    const title = await page.title();
    expect(title).toContain('TypeScript');
  });

  afterAll(async () => {
    await browser.close();
  });
});
```

**Coverage target:** Happy path + common errors  
**Effort:** 4-5 hours

---

### E2E Test 2: Form Fill
```typescript
describe('E2E: Form Fill', () => {
  it('fills and submits a contact form', async () => {
    const page = await browser.newPage();
    
    // Navigate to test form
    await page.goto('https://example.com/contact');
    
    // Send form fill task
    await page.evaluate(() => {
      chrome.runtime.sendMessage({
        type: 'START_TASK',
        payload: {
          task: 'Fill form with name=John, email=john@example.com, message=Hello'
        }
      });
    });
    
    // Wait for form submission
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    
    // Verify success page
    const confirmationText = await page.$eval('.confirmation', el => el.textContent);
    expect(confirmationText).toContain('Thank you');
  });
});
```

**Effort:** 2-3 hours

---

### E2E Test 3-5: Additional workflows
- Test: Infinite scroll navigation (high-mutation page)
- Test: Multi-step workflow (search → click → type)
- Test: Error recovery (retry on content script disconnect)

**Effort:** 3-4 hours each

---

## SECURITY TESTS (Target: 8 tests)

**File:** `tests/security/injection.test.ts`

### Security Test 1: XSS Injection Prevention
```typescript
describe('Security: XSS Injection Prevention', () => {
  it('blocks onclick attribute in selectors', () => {
    const selector = 'img[src="x" onclick="alert(1)"]';
    expect(isValidSelector(selector)).toBe(false);
  });

  it('blocks onerror attribute in selectors', () => {
    const selector = 'img[onerror="alert(1)"]';
    expect(isValidSelector(selector)).toBe(false);
  });

  it('blocks script injection via selector', () => {
    const selector = '"><script>alert(1)</script><div class="';
    expect(isValidSelector(selector)).toBe(false);
  });

  it('blocks javascript: protocol', () => {
    const selector = '[onclick="javascript:alert(1)"]';
    expect(isValidSelector(selector)).toBe(false);
  });

  it('rejects Unicode escape sequences', () => {
    const selector = '[onclick="\\61 lert(1)"]'; // alert with escape
    expect(isValidSelector(selector)).toBe(false);
  });
});
```

**Effort:** 2-3 hours

---

### Security Test 2: CSRF Prevention
```typescript
describe('Security: CSRF Prevention', () => {
  it('includes CSRF token in API requests', async () => {
    const client = new VertexAIClient();
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    
    // Capture the request headers
    global.fetch = mockFetch;
    
    await client.analyzeDOM('<div>test</div>');
    
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['X-CSRF-Token']).toBeDefined();
    expect(headers['X-Requested-With']).toBe('XMLHttpRequest');
  });
});
```

**Effort:** 1-2 hours

---

### Security Test 3: Token Exposure
```typescript
describe('Security: Token Handling', () => {
  it('never logs tokens', () => {
    const mockLogger = jest.spyOn(console, 'log');
    
    const manager = new TokenManager();
    manager.setToken('secret-token-12345');
    
    // Trigger any logging
    manager.getAccessToken();
    
    const logs = mockLogger.mock.calls.map(c => c[0].toString());
    expect(logs.some(log => log.includes('secret-token'))).toBe(false);
    
    mockLogger.mockRestore();
  });

  it('clears tokens on logout', async () => {
    const manager = new TokenManager();
    manager.setToken('token');
    
    await manager.logout();
    
    expect(manager.getStoredToken()).toBeNull();
  });
});
```

**Effort:** 1-2 hours

---

## PERFORMANCE TESTS (Target: 5 tests)

**File:** `tests/performance/benchmarks.test.ts`

### Performance Test 1: Action Latency
```typescript
describe('Performance: Action Execution', () => {
  it('executes simple action in <500ms (p99)', async () => {
    const measurements: number[] = [];
    
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      await executeAction({ type: 'click', selector: 'button' });
      const end = performance.now();
      measurements.push(end - start);
    }
    
    measurements.sort((a, b) => a - b);
    const p99 = measurements[99]; // 99th percentile
    
    expect(p99).toBeLessThan(500); // Should be fast
  });
});
```

**Effort:** 1-2 hours

---

## Test Coverage Summary

| Category | Count | Coverage Target |
|----------|-------|-----------------|
| Unit Tests | 80+ | 95%+ |
| Integration Tests | 20 | 90%+ |
| E2E Tests | 5 | Critical paths |
| Security Tests | 8 | 100% |
| Performance Tests | 5 | Key metrics |
| **Total** | **118+** | **85%+ overall** |

---

## Implementation Roadmap

### Week 1: Unit Tests (Days 1-2)
Priority: Validators, TokenManager, CircuitBreaker
```bash
npm test -- tests/unit/
```

### Week 1: Integration Tests (Days 2-3)
Priority: Task execution, Message routing, Token refresh
```bash
npm test -- tests/integration/
```

### Week 1: E2E Tests (Days 3-5)
Priority: Real browser workflows
```bash
npm test -- tests/e2e/ -- --browser=chrome
```

### Week 2: Security + Performance (Day 5-6)
Priority: Injection, token handling, latency
```bash
npm test -- tests/security/ tests/performance/
```

---

## Test Infrastructure Setup

### Jest Configuration
```json
{
  "testEnvironment": "node",
  "collectCoverageFrom": [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/*.test.ts"
  ],
  "coverageThreshold": {
    "global": {
      "branches": 80,
      "functions": 85,
      "lines": 85,
      "statements": 85
    }
  }
}
```

### CI/CD Integration
```yaml
# .github/workflows/test.yml
- name: Run unit tests
  run: npm test -- tests/unit/ --coverage
  
- name: Run integration tests
  run: npm test -- tests/integration/
  
- name: Run E2E tests (Chrome only)
  run: npm test -- tests/e2e/
  
- name: Check coverage
  run: npm test -- --coverage --coverageReporters=text-summary
```

---

**Created:** PHASE-5-TEST-STRATEGY.md  
**Format:** Comprehensive testing strategy with 118+ test cases across 5 test layers  
**Next Step:** Phase 6 (Code Review Quality Gates) — Define code review standards and quality checkpoints
