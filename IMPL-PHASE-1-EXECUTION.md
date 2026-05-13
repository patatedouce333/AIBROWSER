# IMPL-PHASE-1: Execution Plan & Code Implementation
**Phase 1 of 8 - Security & Reliability Fixes | Status: IN PROGRESS**  
**Start Date:** May 11, 2026 | **Target Completion:** May 14, 2026  
**Effort:** 14-18 hours developer time

---

## EXECUTIVE SUMMARY

**Objective:** Implement 5 critical security and reliability fixes identified in Phase 1 Debug Report

**Risk Mitigation:** High-impact security vulnerabilities must be patched before any production release

**Success Criteria:**
- ✓ All 5 implementations complete with tests passing
- ✓ Code review approved (security + quality gates)
- ✓ 100% test coverage for security-critical code
- ✓ No regression in existing functionality

---

## 5 CRITICAL IMPLEMENTATIONS

### IMPL-1.1: XSS Validator (ActionValidator Class)
**Priority:** CRITICAL | **Effort:** 2-3 hours  
**Status:** READY TO IMPLEMENT

**File to Create:** `src/shared/validators.ts`

**Requirements:**
```typescript
export class ActionValidator {
  static isValidSelector(selector: string): boolean
  static isValidAction(action: Action): boolean
  static isValidPayload(payload: any): boolean
}

// Must prevent:
// - onclick="alert(1)"
// - onerror="alert(1)"
// - javascript:void(0)
// - <script> tags
// - Unicode escapes
// - Data URIs with executable content
```

**Test Cases:**
- ✓ Accept valid CSS selectors (button.submit, #id, [attr="value"])
- ✓ Reject onclick/onerror attributes
- ✓ Reject script injection attempts
- ✓ Reject javascript: protocol
- ✓ Reject Unicode escape sequences

---

### IMPL-1.2: Message Dispatcher (Consolidation)
**Priority:** CRITICAL | **Effort:** 4 hours  
**Status:** READY TO IMPLEMENT

**File to Modify:** `src/background/index.ts`  
**File to Create:** `src/background/message-dispatcher.ts`

**Current Problem:**
```typescript
// ❌ Three separate listeners = race conditions
chrome.runtime.onMessage.addListener((msg: ConfigMsg) => { ... });
chrome.runtime.onMessage.addListener((msg: TaskMsg) => { ... });
chrome.runtime.onMessage.addListener((msg: SnapshotMsg) => { ... });
```

**Solution:**
```typescript
type MessageType = 'CONFIG_UPDATED' | 'START_TASK' | 'CANCEL_TASK' | 'DOM_SNAPSHOT' | 'HEARTBEAT_CHECK';
type MessageHandler = (msg: Message, sender: chrome.runtime.MessageSender) => Promise<any>;

class MessageDispatcher {
  private handlers: Record<MessageType, MessageHandler> = {};
  
  register(type: MessageType, handler: MessageHandler): void
  async dispatch(msg: Message, sender: chrome.runtime.MessageSender): Promise<any>
  start(): void // Single chrome.runtime.onMessage.addListener call
}
```

**Test Cases:**
- ✓ Routes CONFIG_UPDATED to correct handler
- ✓ Routes START_TASK to correct handler
- ✓ Returns error if no handler registered
- ✓ Catches handler exceptions and returns error response
- ✓ Only ONE listener registered (verify via mock)

---

### IMPL-1.3: Action Retry with Exponential Backoff
**Priority:** CRITICAL | **Effort:** 3-4 hours  
**Status:** READY TO IMPLEMENT

**File to Create:** `src/shared/retry.ts`  
**File to Modify:** `src/background/action-executor.ts`

**Function Signature:**
```typescript
interface ActionResult {
  action: Action;
  success: boolean;
  attempts: number;
  error?: string;
}

async function executeActionWithRetry(
  action: Action,
  executor: (action: Action) => Promise<ExecutionResult>,
  options?: {
    maxAttempts?: number;
    baseBackoffMs?: number;
    timeoutMs?: number;
  }
): Promise<ActionResult>
```

**Logic:**
```
For attempt 1 to 3:
  Try: executor(action)
  If success: return { success: true, attempts }
  If transientError && attempt < 3:
    backoffMs = 100 * 2^(attempt-1)
    sleep(backoffMs)
    retry
  Else:
    return { success: false, attempts, error }
```

**Transient Errors:**
- timeout
- ECONNRESET, ENOTFOUND, EHOSTUNREACH
- "element not found" (may load on retry)
- "content script dead" (may reconnect)

**Test Cases:**
- ✓ Success on first attempt (no retry)
- ✓ Retry transient errors with 100ms, 200ms, 400ms backoff
- ✓ Fail immediately on permanent errors
- ✓ Respect 30-second timeout
- ✓ Don't retry critical actions (submit, delete, pay)

---

### IMPL-1.4: Token Refresh Mutex (Shared Promise Pattern)
**Priority:** CRITICAL | **Effort:** 1-2 hours  
**Status:** READY TO IMPLEMENT

**File to Modify:** `src/background/token-store.ts`

**Problem:**
```typescript
// ❌ Concurrent calls both call API
const token1 = await manager.refreshToken();
const token2 = await manager.refreshToken();
// Two separate API calls, potential token inconsistency
```

**Solution:**
```typescript
class TokenManager {
  private refreshPromise: Promise<string> | null = null;
  
  async getAccessToken(): Promise<string> {
    if (this.isTokenValid()) return this.accessToken;
    
    // KEY: Return existing promise if refresh in-flight
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    
    // Start refresh, store promise
    this.refreshPromise = this.performRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }
  
  private async performRefresh(): Promise<string> {
    const response = await this.oauth.exchange(this.codeVerifier);
    this.accessToken = response.accessToken;
    this.expiresAt = Date.now() + response.expiresInSeconds * 1000;
    return this.accessToken;
  }
}
```

**Test Cases:**
- ✓ Concurrent requests return same token
- ✓ API called only once (not twice)
- ✓ Both callers see same token
- ✓ Token expiry buffer (5 minutes) works
- ✓ Refresh failures propagate to all callers

---

### IMPL-1.5: Content Script Heartbeat Monitor
**Priority:** HIGH | **Effort:** 4-5 hours  
**Status:** READY TO IMPLEMENT

**Files to Create:**
- `src/background/content-script-monitor.ts`
- `src/content-script/heartbeat.ts`

**Service Worker Side:**
```typescript
class ContentScriptHealthMonitor {
  private lastHeartbeat: Map<number, number> = new Map(); // tabId -> timestamp
  
  async ensureContentScriptAlive(tabId: number): Promise<void>
  private async checkContentScript(tabId: number): Promise<boolean>
  startPeriodicCheck(intervalMs: number = 5000): void
}

// Periodic check: every 5 seconds
// If no heartbeat for 30 seconds: content script is dead
```

**Content Script Side:**
```typescript
// Every 5 seconds, send heartbeat
setInterval(() => {
  chrome.runtime.sendMessage({
    type: 'HEARTBEAT_CHECK',
    payload: {},
    timestamp: Date.now()
  });
}, 5000);
```

**Test Cases:**
- ✓ Heartbeat received every 5 seconds
- ✓ Dead content script detected within 30 seconds
- ✓ Timeout on message send triggers retry
- ✓ Multiple tabs tracked independently
- ✓ Re-injection on crash works

---

## IMPLEMENTATION SEQUENCE

### Day 1: IMPL-1.1 + IMPL-1.2
```
Morning:
- IMPL-1.1: ActionValidator (2-3 hours)
  ├─ Write src/shared/validators.ts
  ├─ Write tests/unit/validators.test.ts
  └─ Integrate with ActionExecutor

Afternoon:
- IMPL-1.2: MessageDispatcher (4 hours)
  ├─ Write src/background/message-dispatcher.ts
  ├─ Refactor src/background/index.ts
  ├─ Write tests/unit/message-dispatcher.test.ts
  └─ Verify single listener (mock test)
```

### Day 2: IMPL-1.3 + IMPL-1.4
```
Morning:
- IMPL-1.3: Action Retry (3-4 hours)
  ├─ Write src/shared/retry.ts
  ├─ Refactor src/background/action-executor.ts
  ├─ Write tests/unit/action-executor.test.ts
  └─ Test with fake timeouts

Afternoon:
- IMPL-1.4: Token Mutex (1-2 hours)
  ├─ Modify src/background/token-store.ts
  ├─ Write tests/unit/token-manager.test.ts
  └─ Verify concurrent requests
```

### Day 3: IMPL-1.5 + Integration Testing
```
Morning:
- IMPL-1.5: Heartbeat Monitor (4-5 hours)
  ├─ Write src/background/content-script-monitor.ts
  ├─ Write src/content-script/heartbeat.ts
  ├─ Write tests/unit/heartbeat.test.ts
  └─ Write tests/integration/heartbeat.test.ts

Afternoon:
- Integration Testing & Code Review
  ├─ Run all unit tests
  ├─ Run integration tests
  ├─ Verify test coverage >85%
  ├─ Code review (security gates)
  └─ Fix any issues
```

---

## FILE CHANGES SUMMARY

### New Files (5 Created)
```
src/shared/validators.ts              (150 lines)
src/background/message-dispatcher.ts  (100 lines)
src/shared/retry.ts                   (120 lines)
src/background/content-script-monitor.ts (200 lines)
src/content-script/heartbeat.ts       (50 lines)
```

### Modified Files (3 Updated)
```
src/background/index.ts               (consolidate listeners)
src/background/action-executor.ts     (use retry + validate)
src/background/token-store.ts         (implement mutex)
```

### Test Files (5 Created)
```
tests/unit/validators.test.ts
tests/unit/message-dispatcher.test.ts
tests/unit/action-executor.test.ts
tests/unit/token-manager.test.ts
tests/integration/heartbeat.test.ts
```

---

## BUILD & TEST VERIFICATION

```bash
# Day 1 EOD
npm run build:dev
npm test -- tests/unit/validators.test.ts
npm test -- tests/unit/message-dispatcher.test.ts

# Day 2 EOD
npm test -- tests/unit/action-executor.test.ts
npm test -- tests/unit/token-manager.test.ts

# Day 3 EOD
npm test -- tests/unit/ tests/integration/
npm run test:coverage
# Expected: >85% coverage overall, 100% for security-critical

# Final Check
npm run lint
npm run typecheck
# Expected: 0 errors
```

---

## QUALITY GATES (Before Merge)

- [ ] All unit tests passing (100%)
- [ ] All integration tests passing (100%)
- [ ] Code coverage ≥85%
- [ ] Security validators working correctly
- [ ] No race conditions (verified with tests)
- [ ] TypeScript strict mode passing
- [ ] ESLint 0 warnings
- [ ] Code review approved
- [ ] Changelog updated

---

## ROLLBACK PLAN

If critical bug found during testing:

```bash
# Revert all Phase 1 changes
git reset --hard HEAD~5  # Adjust based on number of commits

# Or manually revert specific files
git checkout main -- src/background/index.ts
git checkout main -- src/background/action-executor.ts
```

---

## EXECUTION STATUS

**Current Time:** May 11, 2026  
**Phase 1 Started:** YES ✅  
**Estimated Completion:** May 14, 2026

**Progress Tracking:**
- [ ] Day 1: IMPL-1.1 + IMPL-1.2 (6-7 hours)
- [ ] Day 2: IMPL-1.3 + IMPL-1.4 (5-6 hours)
- [ ] Day 3: IMPL-1.5 + Integration (4-5 hours)

---

**Next: Begin IMPL-1.1 implementation → Write ActionValidator class**

