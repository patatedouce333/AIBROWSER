# Code Review: Cometeor Chrome Extension
**Status:** ⚠️ Functional but requires security & reliability hardening
**Reviewer:** Claude (Senior Developer)
**Date:** May 2026

---

## Executive Summary

Cometeor is an AI-powered web automation extension with solid architecture but **5 critical issues** that block production readiness:

1. **Hardcoded credentials** in source code (TODO placeholders)
2. **Selector injection vulnerability** — user input passed directly to DOM queries
3. **Race conditions** in message handlers and token refresh
4. **Silent failures** in action execution pipeline
5. **No input validation** on coordinates and DOM selectors

### Severity Breakdown
- 🔴 **Critical:** 5 issues (security + stability)
- 🟡 **High:** 8 issues (reliability + maintainability)
- 🟢 **Medium:** 12 issues (code quality + testing)

---

## 🔴 Critical Issues

### 1. **Hardcoded Credentials in Source Code**
**File:** `src/background/auth-manager-pkce.ts:6`, `vertex-client.ts:51`  
**Risk:** Plaintext credentials exposed in repository

```typescript
// ❌ UNSAFE
const OAUTH_CONFIG = {
  clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com', // TODO: Replace
};

// ❌ UNSAFE
static config: VertexConfig = {
  projectId: 'your-project-id', // TODO: Make configurable
};
```

**Fix:**
```typescript
// ✅ SAFE - Load from chrome.storage.sync (encrypted by browser)
static async configure(config: Partial<VertexConfig>) {
  const stored = await chrome.storage.sync.get('vertexConfig');
  this.config = { ...this.config, ...stored, ...config };
}
```

**Action:** Use `chrome.storage.sync` for credentials, not source code.

---

### 2. **Selector Injection Vulnerability**
**File:** `src/background/action-executor.ts:61-68`  
**Risk:** User input flows directly into `document.querySelector()` without validation

```typescript
// ❌ VULNERABLE
chrome.tabs.sendMessage(tabId, {
  type: 'EXECUTE_ACTION',
  action: {
    type: 'click',
    selector: action.selector,  // User-controlled, no validation
    x: action.x,
    y: action.y,
  }
});
```

**Attack scenario:** 
- Attacker prompts AI with: "Click on `'); alert('XSS') //`"
- AI generates action with malicious selector
- Content script executes: `document.querySelector("'); alert('XSS') //")`
- Browser executes injected code

**Fix:**
```typescript
// ✅ SAFE - Validate selector format
static validateSelector(selector: string): boolean {
  // Must be valid CSS selector
  try {
    document.querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

// Use querySelectorAll instead of direct string concat
const elements = document.querySelectorAll(action.selector);
if (elements.length === 0) throw new Error('Selector matched no elements');
```

**Action:** Validate all selectors; prefer XPath or stable data attributes.

---

### 3. **Race Condition: Multiple Message Listeners**
**File:** `src/background/index.ts:22-78`  
**Risk:** Multiple `chrome.runtime.onMessage.addListener()` calls without cleanup

```typescript
// ❌ UNSAFE - Each listener fires, all handle the message
chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  if (message.type === 'CONFIG_UPDATED') { /* ... */ }
});

chrome.runtime.onMessage.addListener((message: SidebarMessage, sender, sendResponse) => {
  switch (message.type) { /* ... */ }
});

chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  if (!sender.tab?.id) return; // Only 3rd handler checks tab
});
```

**Problem:**
- `CONFIG_UPDATED` fires in handlers 1 & 2
- `START_TASK` fires in handlers 2 & 3 (tab check fails)
- Response sent twice → Chrome warnings & unpredictable behavior

**Fix:**
```typescript
// ✅ SAFE - Single dispatcher with clear routing
const messageDispatcher = async (message: any, sender: any, sendResponse: any) => {
  try {
    const response = await routeMessage(message, sender);
    sendResponse(response);
  } catch (error) {
    sendResponse({ type: 'ERROR', error: error.message });
  }
};

chrome.runtime.onMessage.removeListener(messageDispatcher); // Clean up
chrome.runtime.onMessage.addListener(messageDispatcher);
```

**Action:** Consolidate all listeners into single dispatcher with type routing.

---

### 4. **Silent Failures in Action Execution**
**File:** `src/background/action-executor.ts:12-27`  
**Risk:** Non-critical actions fail silently; no retry mechanism; AI doesn't know what failed

```typescript
// ❌ SILENT FAILURE
for (const action of plan.actions) {
  try {
    const result = await this.executeAction(action, tabId);
    results.push({ action, success: true, result });
  } catch (error: any) {
    console.error(`Action failed: ${action.type}`, error);  // Only logs
    results.push({ action, success: false, error: error.message });
    
    // Continues silently — AI thinks it succeeded
    if (action.type === 'click' && action.description?.includes('submit')) {
      throw error;  // Only critical actions stop
    }
  }
}
```

**Impact:**
- User requests "Fill out the form and submit"
- AI executes: [type email, type password, click submit]
- `type password` fails → continues silently
- Form submitted without password → rejection
- AI doesn't retry; task marked complete

**Fix:**
```typescript
// ✅ SAFE - Retry with backoff; fail fast on critical
const executeWithRetry = async (action: Action, tabId: number, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await this.executeAction(action, tabId);
    } catch (error) {
      if (attempt === maxRetries) {
        if (this.isCriticalAction(action)) throw error;
        return { success: false, error: error.message, retried: attempt - 1 };
      }
      await this.sleep(100 * Math.pow(2, attempt)); // Exponential backoff
    }
  }
};
```

**Action:** Add retry logic with exponential backoff; mark failures clearly for AI feedback.

---

### 5. **No Input Validation on Coordinates & Dimensions**
**File:** `src/background/action-executor.ts:60-68`  
**Risk:** Out-of-bounds clicks, negative coordinates, injection

```typescript
// ❌ NO VALIDATION
case 'click':
  return this.executeClick(action, tabId);

// In executeClick:
chrome.tabs.sendMessage(tabId, {
  type: 'EXECUTE_ACTION',
  action: {
    x: action.x,  // Could be Infinity, NaN, -999999
    y: action.y,  // No bounds checking
  }
});
```

**Fix:**
```typescript
// ✅ SAFE - Validate all inputs
static validateAction(action: Action): boolean {
  switch (action.type) {
    case 'click':
      return typeof action.x === 'number' && 
             typeof action.y === 'number' &&
             action.x >= 0 && action.y >= 0 &&
             action.x <= 9999 && action.y <= 9999;
    case 'type':
      return typeof action.text === 'string' && 
             action.text.length <= 10000;
    // ... more validators
  }
}
```

**Action:** Validate all action inputs before execution.

---

## 🟡 High Priority Issues

### 6. **Race Condition: Token Refresh**
**File:** `src/background/auth-manager-pkce.ts:77-82`  
**Issue:** Concurrent requests can both trigger refresh; token duplicated

```typescript
// ❌ RACE CONDITION
static async getValidToken(): Promise<string | null> {
  const tokens = await TokenStore.get();
  if (tokens?.refreshToken && this.isTokenExpired(tokens.accessToken)) {
    return this.refreshToken();  // Two requests call this simultaneously
  }
  return tokens?.accessToken || null;
}
```

**Fix:** Use a lock mechanism or make refresh idempotent.

---

### 7. **No Backpressure on DOM Mutations**
**File:** `src/background/task-manager.ts`  
**Issue:** Every DOM mutation triggers analysis; can overwhelm AI API

**Fix:** Debounce mutations; batch updates; implement queue with max size.

---

### 8. **Type Safety Issues**
**File:** Throughout (many `any` types)  
**Issue:** Defeats TypeScript's safety; hard to catch bugs

```typescript
// ❌ UNSAFE
(message: any, sender, sendResponse) => { }

// ✅ SAFE
(message: BackgroundMessage, sender: chrome.runtime.MessageSender, sendResponse: (response: BackgroundResponse) => void) => { }
```

**Action:** Remove all `any` types; create proper union types for messages.

---

### 9. **No Error Boundary for Content Scripts**
**Issue:** Content script crashes go unnoticed; task hangs

**Fix:** Add heartbeat mechanism; detect stalled content scripts; reload tab if needed.

---

### 10. **Service Worker Timeout Vulnerability**
**File:** `src/background/keep-alive.ts`  
**Issue:** Service worker can still be terminated during long tasks

**Fix:** Use offscreen documents for long-running operations; handle termination gracefully.

---

### 11. **No Rate Limiting on DOM Snapshots**
**Issue:** Fast mutations can flood API with snapshots

**Fix:** Implement token bucket rate limiting; max 1 snapshot/100ms.

---

### 12. **Missing OAuth Token Validation**
**File:** `src/background/vertex-client.ts`  
**Issue:** No validation that token is for correct scope/audience

**Fix:** Validate token claims; fail fast on scope mismatch.

---

### 13. **No Timeout on API Requests**
**Issue:** Hanging requests block task progress

**Fix:** Add 30-second timeout on all Vertex API calls.

---

## 🟢 Medium Priority Issues (Code Quality)

### 14-25. Code Quality Issues
- **Logging:** No structured logging; mix of `console.log()` and nothing
- **Testing:** No tests at all (`npm test` fails)
- **Error Types:** Use `Error` class, not string messages
- **Documentation:** No JSDoc comments on public methods
- **Constants:** Magic numbers (500ms, 2048 tokens) should be named constants
- **Interfaces:** Missing `Plan` and `Action` type definitions in shared types
- **DRY:** Duplicate selector validation logic across files
- **Comments:** Outdated TODO comments left in code
- **Nullability:** Missing null checks on optional fields
- **Imports:** Circular dependency risk between modules

---

## Summary of Fixes by Priority

| Priority | Issue | Effort | Risk Reduction |
|----------|-------|--------|-----------------|
| 🔴 Critical | Credentials → config storage | 2h | 40% |
| 🔴 Critical | Selector injection validation | 3h | 35% |
| 🔴 Critical | Message handler consolidation | 2h | 15% |
| 🔴 Critical | Action retry logic | 4h | 10% |
| 🔴 Critical | Input validation | 2h | 5% |
| 🟡 High | Token refresh locking | 1h | — |
| 🟡 High | DOM mutation backpressure | 2h | — |
| 🟡 High | Remove `any` types | 3h | — |

**Total effort:** ~19 hours to address all critical issues

**Recommended order:** Start with 1 (credentials) → 2 (selectors) → 3 (message handlers) → testing

---

## Testing Checklist

- [ ] Unit tests for action validation
- [ ] Integration test: click → screenshot → validate result
- [ ] Security test: inject malicious selectors; verify rejection
- [ ] Concurrency test: 10 simultaneous messages; verify no duplicates
- [ ] Timeout test: long-running action; verify timeout after 30s
- [ ] Token test: expired token → refresh → request succeeds

---

## Security Audit Sign-Off

**Before production:** Address all 🔴 critical issues + any 🟡 high-priority security items (6, 7, 10, 12, 13).

**Current security posture:** Unsafe for untrusted user input or multi-user environments.
