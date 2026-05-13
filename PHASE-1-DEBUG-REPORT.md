# Phase 1: Comprehensive Debug Report
**Cometeor Extension Critical Issues**  
**Date:** May 2026 | **Status:** Under Investigation

---

## Debug Session: Issue #1 - Selector Injection XSS

### Reproduction
**Expected:** Extension safely validates all selectors; malicious input rejected  
**Actual:** Malicious selectors bypass validation; potential XSS execution  
**Steps to reproduce:**
1. User enters task: `"Click button with text: '); alert('XSS'); //"`
2. Vertex AI generates plan with selector containing injected code
3. ActionExecutor sends malicious selector to content script
4. Content script attempts to execute: `document.querySelector("...injection...")`
5. If selector passed to eval or innerHTML: arbitrary code execution

### Isolation
**Location:** `src/background/action-executor.ts:61-68`  
**Code path:** User prompt → AI planning → ActionExecutor → Content script message  
**Affected component:** ContentScript DOM query execution

**Reproduce code:**
```typescript
// Attacker controls prompt
const maliciousPrompt = "Click the button: '); console.log('pwned'); //";

// AI generates (no validation):
const action = {
  type: 'click',
  selector: "button:contains('); console.log('pwned'); //)"
};

// Executor sends to content script (no validation):
chrome.tabs.sendMessage(tabId, {
  type: 'EXECUTE_ACTION',
  action: {
    selector: action.selector  // ← DANGEROUS: User input passed directly
  }
});

// Content script executes (vulnerable):
document.querySelector(action.selector);
// If selector is invalid syntax, querySelector throws
// If selector is valid but contains event handler: XSS
```

### Diagnosis

**Root Cause:** No validation of selector before execution
- User prompt → AI generation → No checking if selector is safe CSS
- Selector passed directly to DOM query without whitelist validation
- No escape/sanitization of selector string

**Why it happens:**
```typescript
// Current code path (UNSAFE)
for (const action of plan.actions) {
  // plan.actions come from AI (untrusted source)
  // No validation of action.selector
  
  chrome.tabs.sendMessage(tabId, {
    action: {
      selector: action.selector  // ← Directly used
    }
  });
}
```

**Attack vectors:**
1. **Invalid CSS selector → throws error:**
   ```css
   button:contains('); throw 'pwned' //)
   ```

2. **Valid selector with event handler (browser parser dependent):**
   ```
   button onload="alert('pwned')"
   ```

3. **Selector with script context (if using eval instead of querySelector):**
   ```javascript
   "; alert('pwned'); //
   ```

### Fix

**Solution 1: Validate selector before execution (Recommended)**
```typescript
// ✅ SAFE - Whitelist validation
class ActionValidator {
  static isValidSelector(selector: string): boolean {
    // Check 1: Basic pattern validation
    const dangerousPatterns = [
      /[<>'"`;()]/,           // Script-like chars
      /javascript:/i,         // Protocol
      /on\w+=/i,              // Event handlers
      /script/i,              // Script tags
      /eval/i,                // Eval calls
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(selector)) return false;
    }
    
    // Check 2: Test if it's a valid CSS selector
    try {
      document.querySelector(selector);
      return true;
    } catch (e) {
      return false; // Invalid CSS syntax
    }
  }
  
  static validateAction(action: Action): boolean {
    switch (action.type) {
      case 'click':
        return this.isValidSelector(action.selector);
      case 'type':
        return typeof action.text === 'string' && 
               action.text.length <= 10000 &&
               !action.text.includes('\x00'); // Null byte
      // ... more validators
    }
  }
}

// ✅ SAFE - Use validator before execution
for (const action of plan.actions) {
  if (!ActionValidator.validateAction(action)) {
    throw new Error(`Invalid action: ${JSON.stringify(action)}`);
  }
  
  // Now safe to execute
  chrome.tabs.sendMessage(tabId, { action });
}
```

**Solution 2: Use XPath instead of CSS selectors (Alternative)**
```typescript
// XPath is safer for user-generated queries
// Use XPath evaluator instead of querySelector
const xpath = action.xpath; // "//*[@id='submit-button']"
const result = document.evaluate(xpath, document, null, 
  XPathResult.FIRST_ORDERED_NODE_TYPE, null);
const element = result.singleNodeValue;
```

### Prevention

**Test to add:**
```typescript
describe('ActionValidator - Security', () => {
  it('rejects selectors with event handlers', () => {
    expect(ActionValidator.isValidSelector(
      'button onclick="alert(1)"'
    )).toBe(false);
  });
  
  it('rejects selectors with script context', () => {
    expect(ActionValidator.isValidSelector(
      'button"); alert("pwned"); //'
    )).toBe(false);
  });
  
  it('rejects protocol-based selectors', () => {
    expect(ActionValidator.isValidSelector(
      'button[href="javascript:alert(1)"]'
    )).toBe(false);
  });
  
  it('accepts valid CSS selectors', () => {
    expect(ActionValidator.isValidSelector('button.submit')).toBe(true);
    expect(ActionValidator.isValidSelector('input[type="email"]')).toBe(true);
    expect(ActionValidator.isValidSelector('#login-btn')).toBe(true);
  });
});
```

**Guard to put in place:**
- Validate ALL user-controlled input before DOM operations
- Never pass user input directly to `eval`, `innerHTML`, `querySelector`
- Use content security policy (CSP) headers to block inline scripts
- Log rejected selectors for security monitoring

---

## Debug Session: Issue #2 - Message Handler Race Condition

### Reproduction
**Expected:** Each message processed once; sendResponse called once per message  
**Actual:** Multiple handlers process same message; sendResponse called multiple times  
**Steps to reproduce:**
1. Send CONFIG_UPDATED message to service worker
2. Three chrome.runtime.onMessage.addListener callbacks registered
3. Watch Chrome DevTools console
4. Warning appears: "Message response already sent (or finished) for tab X"

### Isolation
**Location:** `src/background/index.ts:20-100`  
**Code path:** Runtime message → 3 separate listeners → multiple handlers → dual sendResponse  

**Current implementation (UNSAFE):**
```typescript
// Listener #1
chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  if (message.type === 'CONFIG_UPDATED') {
    VertexClient.updateConfig(message.config);
    sendResponse({ success: true });  // ← Response #1
    return true;
  }
  // Falls through for other message types
});

// Listener #2 (ALSO PROCESSES ALL MESSAGES)
chrome.runtime.onMessage.addListener((message: SidebarMessage, sender, sendResponse) => {
  (async () => {
    let response: BackgroundResponse;
    
    switch (message.type) {
      case 'START_TASK':
        // ... handle
        break;
      case 'CANCEL_TASK':
        // ... handle
        break;
      default:
        response = { type: 'TASK_FAILED', task: null as any };
    }
    
    sendResponse(response);  // ← Response #2 (even if message not matched)
  })();
  return true;
});

// Listener #3 (ALSO PROCESSES ALL MESSAGES)
chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  if (!sender.tab?.id) return;
  
  (async () => {
    switch (message.type) {
      case 'DOM_SNAPSHOT':
        // ... handle
        sendResponse({ success: true });  // ← Response #3
        break;
      // ...
    }
  })();
  return true;
});
```

### Diagnosis

**Root Cause:** Multiple listeners registered for same event without routing logic
- Each `chrome.runtime.onMessage.addListener()` adds ANOTHER listener
- All listeners process EVERY message (not filtered)
- Multiple handlers can call sendResponse on same message
- Chrome throws warning when response sent twice

**Timeline of execution:**
```
T=0ms    CONFIG_UPDATED message arrives
T=0ms    Listener #1 fires:
         ├─ message.type === 'CONFIG_UPDATED' ✓
         ├─ Update config
         └─ sendResponse({ success: true }) [First response]

T=0ms    Listener #2 fires (async):
         ├─ message.type is 'CONFIG_UPDATED'
         ├─ No case in switch matches
         ├─ Falls to default case
         ├─ response = { type: 'TASK_FAILED', ... }
         └─ schedules sendResponse() in microtask

T=0ms    Listener #3 fires:
         ├─ Check sender.tab.id ✓
         ├─ message.type is 'CONFIG_UPDATED'
         ├─ No case matches
         ├─ Falls through (no sendResponse)
         └─ Returns

T=1ms    Listener #2's microtask executes:
         └─ sendResponse() [Second response - WARNING!]

Result: Chrome logs "Message response already sent"
```

**Why it's bad:**
- Unclear which handler actually processes message
- Sidebar UI might get wrong response (from listener #2 instead of #1)
- Error logging confused (which handler failed?)
- Race between async handlers unpredictable
- Hard to debug message routing issues

### Fix

**Solution: Single dispatcher with type-based routing (Recommended)**
```typescript
// ✅ SAFE - Single dispatcher routes all messages
type MessageHandler = (message: any, sender: any) => Promise<any>;

const messageRoutes: Record<string, MessageHandler> = {
  // Config messages
  'CONFIG_UPDATED': async (message) => {
    VertexClient.updateConfig(message.config);
    return { success: true };
  },
  
  'TEST_CONNECTION': async (message) => {
    const success = await VertexClient.testConnection();
    return { success };
  },
  
  // Task messages
  'START_TASK': async (message) => {
    const task = await taskManager.createTask(message.description);
    return { type: 'TASK_STARTED', task };
  },
  
  'CANCEL_TASK': async (message) => {
    await taskManager.cancelTask(message.taskId);
    return { type: 'TASK_CANCELLED', taskId: message.taskId };
  },
  
  'GET_TASKS': async (message) => {
    const tasks = taskManager.getTasks();
    return { type: 'TASKS_LIST', tasks };
  },
  
  // Content script messages (require tab context)
  'DOM_SNAPSHOT': async (message, sender) => {
    if (!sender.tab?.id) throw new Error('DOM_SNAPSHOT requires tab context');
    taskManager.handleDomSnapshot(message.snapshot, sender.tab.id);
    return { success: true };
  },
  
  'MUTATION_DETECTED': async (message, sender) => {
    if (!sender.tab?.id) throw new Error('MUTATION_DETECTED requires tab context');
    taskManager.handleMutation(message.url, message.significant, sender.tab.id);
    return { success: true };
  },
};

// ✅ ONE dispatcher registered
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      const handler = messageRoutes[message.type];
      
      if (!handler) {
        throw new Error(`Unknown message type: ${message.type}`);
      }
      
      const response = await handler(message, sender);
      sendResponse(response);  // ← sendResponse called exactly once
    } catch (error: any) {
      console.error('Message handler error:', error);
      sendResponse({
        type: 'ERROR',
        error: error.message
      });
    }
  })();
  
  return true; // Will respond async
});
```

### Prevention

**Test to add:**
```typescript
describe('MessageDispatcher - No Race Conditions', () => {
  it('sends response exactly once per message', async () => {
    const sendResponseMock = jest.fn();
    
    await messageDispatcher(
      { type: 'CONFIG_UPDATED', config: {} },
      { tabId: 1 },
      sendResponseMock
    );
    
    expect(sendResponseMock).toHaveBeenCalledTimes(1);
  });
  
  it('handles concurrent messages without cross-talk', async () => {
    const responses: any[] = [];
    const capture = (response: any) => responses.push(response);
    
    await Promise.all([
      messageDispatcher({ type: 'START_TASK', description: 'Task 1' }, {}, capture),
      messageDispatcher({ type: 'START_TASK', description: 'Task 2' }, {}, capture),
    ]);
    
    // Each message gets unique response
    expect(responses[0].task.id).not.toBe(responses[1].task.id);
  });
});
```

**Guard to put in place:**
- Use single dispatcher pattern
- TypeScript type guards for each message type
- Unit tests for concurrent message handling
- Logging of message route for debugging

---

## Debug Session: Issue #3 - Token Refresh Race

### Reproduction
**Expected:** Token refreshed once; one API call to exchange refresh token  
**Actual:** Token refreshed twice concurrently; two API calls made  
**Steps to reproduce:**
1. Create two API requests simultaneously when token expired
2. Both call `AuthManagerPKCE.getValidToken()`
3. Both detect token expired
4. Both call `refreshToken()` async
5. Both fetch new token
6. Both store result
7. Verify: two API calls made instead of one

### Isolation
**Location:** `src/background/auth-manager-pkce.ts:77-82`  
**Code path:** Request #1 → getValidToken() → refreshToken()  
**Concurrent path:** Request #2 → getValidToken() → refreshToken() [overlaps]

### Diagnosis

**Root Cause:** No synchronization primitive for token refresh
```typescript
// ❌ NOT IDEMPOTENT - Multiple calls can execute concurrently
static async refreshToken(): Promise<string | null> {
  const tokens = await TokenStore.get();
  if (!tokens?.refreshToken) return null;
  
  try {
    // Both Request #1 and #2 reach here
    const response = await this.exchangeRefreshToken(tokens.refreshToken);
    
    // Both write the new token (duplicate work)
    await TokenStore.save(response);
    
    return response.accessToken;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return null;
  }
}
```

**Timeline:**
```
Request #1:
  T=0ms   getValidToken() called
  T=0ms   Token found but expired
  T=0ms   Call refreshToken() [starts async]
  
Request #2:
  T=1ms   getValidToken() called [while #1 refreshing)
  T=1ms   Token still expired (refresh not done yet)
  T=1ms   Call refreshToken() [starts async, duplicate!]

Request #1:
  T=100ms refreshToken() completes
  T=100ms Store new token

Request #2:
  T=101ms refreshToken() completes
  T=101ms Overwrite token with same value (wasted call)
  
Result: 2 API calls for 1 token refresh
```

**Why it's bad:**
- Wastes API quota (50% extra calls in concurrent scenario)
- Potential token mismatch if responses differ
- Higher latency (user waits for slower refresh)
- On expensive API (Vertex AI): significant cost increase

### Fix

**Solution: Mutex/Lock pattern (Recommended)**
```typescript
// ✅ SAFE - Only one refresh in flight at a time
export class AuthManagerPKCE {
  private static refreshPromise: Promise<string | null> | null = null;
  
  static async getValidToken(): Promise<string | null> {
    const tokens = await TokenStore.get();
    
    if (!tokens?.accessToken || this.isTokenExpired(tokens.accessToken)) {
      return this.refreshToken();
    }
    
    return tokens.accessToken;
  }
  
  static async refreshToken(): Promise<string | null> {
    // If refresh already in progress, wait for it
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    
    // Start new refresh (only happens once)
    this.refreshPromise = (async () => {
      try {
        const tokens = await TokenStore.get();
        if (!tokens?.refreshToken) return null;
        
        const response = await this.exchangeRefreshToken(
          tokens.refreshToken
        );
        
        await TokenStore.save(response);
        return response.accessToken;
      } catch (error) {
        console.error('Token refresh failed:', error);
        return null;
      } finally {
        // Release lock
        this.refreshPromise = null;
      }
    })();
    
    return this.refreshPromise;
  }
}
```

**New timeline:**
```
Request #1:
  T=0ms   getValidToken() called
  T=0ms   Token expired
  T=0ms   Call refreshToken()
  T=0ms   refreshPromise is null, start new refresh
  T=0ms   Set refreshPromise = (async refresh code)

Request #2:
  T=1ms   getValidToken() called
  T=1ms   Token expired
  T=1ms   Call refreshToken()
  T=1ms   refreshPromise is NOT null, return existing promise
  T=1ms   Waits for Request #1's refresh to complete

Request #1:
  T=100ms refreshToken() completes
  T=100ms Store token
  T=100ms refreshPromise = null (release lock)

Request #2:
  T=100ms Gets result from same promise
  T=100ms Returns same token (no duplicate API call)

Result: 1 API call for 2 concurrent requests ✓
```

### Prevention

**Test to add:**
```typescript
describe('TokenManager - Concurrency', () => {
  it('prevents concurrent token refreshes', async () => {
    let refreshCount = 0;
    jest.spyOn(AuthManagerPKCE, 'exchangeRefreshToken').mockImplementation(
      async () => {
        refreshCount++;
        await new Promise(r => setTimeout(r, 50));
        return { accessToken: 'new-token', refreshToken: 'refresh' };
      }
    );
    
    // Simulate concurrent getValidToken calls
    const tokens = await Promise.all([
      AuthManagerPKCE.getValidToken(),
      AuthManagerPKCE.getValidToken(),
      AuthManagerPKCE.getValidToken(),
    ]);
    
    // All return same token
    expect(tokens).toEqual(['new-token', 'new-token', 'new-token']);
    
    // But only called API once
    expect(refreshCount).toBe(1);
  });
});
```

---

## Debug Session: Issue #4 - Silent Action Failures

### Reproduction
**Expected:** Failed actions reported; task paused; AI prompted to replan  
**Actual:** Actions fail silently; task continues as if succeeded; AI unaware  
**Steps to reproduce:**
1. User: "Fill out contact form and submit"
2. AI generates: [type email, type password, click submit]
3. type email: SUCCESS
4. type password: FAILS (wrong page state) → logged to console only
5. click submit: SUCCESS (but password field empty!)
6. Task marked "completed"
7. Form rejected by server
8. User confused; AI doesn't retry

### Isolation
**Location:** `src/background/action-executor.ts:11-32`  
**Code path:** executePlan() → for each action → try/catch → catch logs only

### Diagnosis

**Root Cause:** Failures swallowed; not reported back to TaskManager/AI

```typescript
// ❌ SILENT FAILURES
static async executePlan(plan: Plan, tabId: number): Promise<any> {
  const results = [];
  
  for (const action of plan.actions) {
    try {
      const result = await this.executeAction(action, tabId);
      results.push({ action, success: true, result });
      await this.sleep(500);
    } catch (error: any) {
      console.error(`Action failed: ${action.type}`, error); // ← Only logs!
      results.push({ action, success: false, error: error.message });
      
      // Silently continues (no retry, no alert)
      if (action.type === 'click' && action.description?.includes('submit')) {
        throw error; // Only submit clicks are critical
      }
    }
  }
  
  return { results, completed: true }; // ← Claims completed!
}
```

**Flow in TaskManager:**
```typescript
// TaskManager doesn't know what failed
const planResult = await ActionExecutor.executePlan(plan, tabId);
return {
  status: 'completed',  // ← FALSE! Some actions failed
  progress: 100,
  results: planResult.results
};
```

**Sidebar sees:**
```typescript
if (result.status === 'completed') {
  updateUI({
    icon: '✅',
    text: 'Task complete!',
    progress: 100
  });
}
```

**Why it's bad:**
- User thinks task succeeded when it failed
- AI never knows failures happened
- No retry mechanism triggered
- Error logs in console (users don't check)
- Silent failures hide bugs

### Fix

**Solution: Explicit failure reporting + retry**
```typescript
// ✅ SAFE - Failures reported explicitly
static async executePlan(plan: Plan, tabId: number) {
  const results = [];
  let criticalFailure: Error | null = null;
  
  for (const action of plan.actions) {
    let succeeded = false;
    let lastError: Error | null = null;
    
    // Retry loop with exponential backoff
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await this.executeAction(action, tabId);
        results.push({
          action,
          success: true,
          result,
          attempts: attempt
        });
        succeeded = true;
        break; // Success, stop retrying
      } catch (error: any) {
        lastError = error;
        
        if (attempt < 3) {
          // Exponential backoff
          const backoff = 100 * Math.pow(2, attempt - 1);
          await this.sleep(backoff);
        }
      }
    }
    
    if (!succeeded) {
      results.push({
        action,
        success: false,
        error: lastError!.message,
        attempts: 3
      });
      
      // Mark critical actions as failures
      if (this.isCriticalAction(action)) {
        criticalFailure = lastError;
        break; // Stop processing
      }
    }
    
    // Small delay between actions
    await this.sleep(500);
  }
  
  // ✅ EXPLICIT REPORTING
  const failedCount = results.filter(r => !r.success).length;
  
  return {
    results,
    completed: failedCount === 0,  // ← True only if ALL succeeded
    failed: failedCount,
    failedActions: results.filter(r => !r.success),
    lastError: criticalFailure,
    totalAttempts: results.reduce((sum, r) => sum + (r.attempts || 1), 0)
  };
}
```

**TaskManager knows failure:**
```typescript
const planResult = await ActionExecutor.executePlan(plan, tabId);

if (!planResult.completed) {
  // Failure is explicit
  task.status = 'FAILED';
  task.failedActions = planResult.failedActions;
  
  // Can now decide: retry plan? replan with AI? abort?
  if (planResult.totalAttempts < 9) {  // 3 retries × 3 actions
    // Replan with context about what failed
    return await this.replan(task, planResult);
  }
}
```

### Prevention

**Test to add:**
```typescript
describe('ActionExecutor - Failure Reporting', () => {
  it('reports failed actions explicitly', async () => {
    jest.spyOn(executor, 'executeAction')
      .mockResolvedValueOnce({ success: true }) // email
      .mockRejectedValueOnce(new Error('Selector not found')) // password
      .mockResolvedValueOnce({ success: true }); // submit
    
    const result = await executor.executePlan(plan, tabId);
    
    expect(result.completed).toBe(false);
    expect(result.failed).toBe(1);
    expect(result.failedActions).toHaveLength(1);
    expect(result.failedActions[0].action.type).toBe('type');
  });
  
  it('retries failed actions with backoff', async () => {
    const mock = jest.fn();
    jest.spyOn(executor, 'executeAction')
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce({ success: true }); // Succeeds on retry
    
    const result = await executor.executePlan(plan, tabId);
    
    expect(result.completed).toBe(true);
    expect(mock).toHaveBeenCalledTimes(2); // Called twice (1 fail + 1 success)
  });
  
  it('stops on critical action failure', async () => {
    jest.spyOn(executor, 'executeAction')
      .mockResolvedValueOnce({}) // step 1
      .mockRejectedValue(new Error('Submit failed')); // step 2 critical
    
    const result = await executor.executePlan(plan, tabId);
    
    expect(result.completed).toBe(false);
    expect(result.lastError.message).toContain('Submit failed');
  });
});
```

---

## Debug Session: Issue #5 - Content Script Disconnect

### Reproduction
**Expected:** Service worker detects dead content script; reloads tab or cancels task  
**Actual:** Service worker keeps sending messages to dead script; task hangs forever  
**Steps to reproduce:**
1. Task starts; content script injected into tab
2. Page navigates or tab closes
3. Content script dies
4. Service worker doesn't know it's dead
5. Sends message: `chrome.tabs.sendMessage(deadTabId, ...)`
6. Message times out or fails silently
7. Task stuck in "In Progress"
8. Sidebar shows spinner forever

### Isolation
**Location:** `src/background/action-executor.ts` (message sending)  
**Code path:** executeAction() → chrome.tabs.sendMessage() → no response detection

### Diagnosis

**Root Cause:** No heartbeat; no detection of dead content scripts

```typescript
// ❌ NO HEARTBEAT
private static async executeClick(action: Action, tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, {
      type: 'EXECUTE_ACTION',
      action: {
        type: 'click',
        selector: action.selector,
        x: action.x,
        y: action.y,
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        // Error might be: "Could not establish connection. Receiving end does not exist."
        // OR it might just be missing (tab closed, content script died)
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.success) {
        resolve();
      } else {
        reject(new Error(response?.error || 'Click failed'));
      }
    });
    
    // ❌ NO TIMEOUT - If content script dead, callback never fires!
    // Message waits forever
  });
}
```

**Scenario:**
```
T=0ms    Task sends: "Click button"
T=0ms    Message: { type: 'EXECUTE_ACTION', action: { type: 'click' } }
         sent to chrome.tabs.sendMessage(tabId=5, ...)

T=5ms    Content script (tabId=5) is dead (crashed, tab closed, etc.)
T=5ms    Chrome can't deliver message

T=1000ms Still waiting for response...
T=2000ms Still waiting...
T=5000ms User gets frustrated, no response from sidebar

Task never completes.
```

### Fix

**Solution: Timeout + heartbeat**
```typescript
// ✅ SAFE - Timeout on message; heartbeat check
private static async executeClick(action: Action, tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(
        `Content script on tab ${tabId} did not respond (30s timeout). ` +
        `Tab may be closed or script crashed.`
      ));
    }, 30000); // 30 second timeout
    
    chrome.tabs.sendMessage(tabId, {
      type: 'EXECUTE_ACTION',
      action: {
        type: 'click',
        selector: action.selector,
        x: action.x,
        y: action.y,
      }
    }, (response) => {
      clearTimeout(timeout);
      
      if (chrome.runtime.lastError) {
        reject(new Error(
          `Content script error on tab ${tabId}: ${chrome.runtime.lastError.message}`
        ));
      } else if (response?.success) {
        resolve();
      } else {
        reject(new Error(response?.error || 'Click failed'));
      }
    });
  });
}

// ✅ HEARTBEAT - Periodic check that content script is alive
class ContentScriptHealthMonitor {
  private static lastHeartbeat: Map<number, number> = new Map();
  
  static async checkContentScript(tabId: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false); // Content script dead
      }, 5000);
      
      chrome.tabs.sendMessage(tabId, {
        type: 'HEARTBEAT'
      }, (response) => {
        clearTimeout(timeout);
        
        if (chrome.runtime.lastError) {
          resolve(false); // Script dead
        } else {
          this.lastHeartbeat.set(tabId, Date.now());
          resolve(true); // Script alive
        }
      });
    });
  }
  
  static async ensureContentScriptAlive(tabId: number): Promise<void> {
    if (!await this.checkContentScript(tabId)) {
      // Reload content script
      await chrome.tabs.executeScript(tabId, {
        file: '/dist/content.js'
      });
    }
  }
}

// ✅ USE IN ACTION EXECUTION
static async executePlan(plan: Plan, tabId: number) {
  // Check content script is alive before starting
  await ContentScriptHealthMonitor.ensureContentScriptAlive(tabId);
  
  // Monitor health during execution
  for (const action of plan.actions) {
    // Check again before each action
    if (!await ContentScriptHealthMonitor.checkContentScript(tabId)) {
      throw new Error(
        `Content script died on tab ${tabId}. Cannot continue.`
      );
    }
    
    // Execute with timeout protection
    try {
      await this.executeActionWithTimeout(action, tabId, 30000);
    } catch (error) {
      // Timeout or error → content script likely dead
      throw new Error(
        `Action failed on tab ${tabId}: ${error.message}`
      );
    }
  }
}
```

### Prevention

**Test to add:**
```typescript
describe('ContentScriptHealthMonitor', () => {
  it('detects dead content script', async () => {
    jest.spyOn(chrome.tabs, 'sendMessage').mockImplementation(
      (tabId, msg, callback) => {
        // Simulate dead script (no callback)
        setTimeout(() => callback(), 5100); // Timeout
      }
    );
    
    const alive = await monitor.checkContentScript(5);
    expect(alive).toBe(false);
  });
  
  it('detects alive content script', async () => {
    jest.spyOn(chrome.tabs, 'sendMessage').mockImplementation(
      (tabId, msg, callback) => {
        // Simulate alive script (responds quickly)
        callback({ status: 'alive' });
      }
    );
    
    const alive = await monitor.checkContentScript(5);
    expect(alive).toBe(true);
  });
  
  it('reloads content script if dead', async () => {
    let isAlive = false;
    
    jest.spyOn(chrome.tabs, 'sendMessage').mockImplementation(
      (tabId, msg, callback) => {
        if (msg.type === 'HEARTBEAT') {
          if (isAlive) callback({ status: 'alive' });
          else callback(); // Dead
        }
      }
    );
    
    jest.spyOn(chrome.tabs, 'executeScript').mockImplementation(
      async () => {
        isAlive = true; // Reload succeeds
        return [{}];
      }
    );
    
    await monitor.ensureContentScriptAlive(5);
    expect(isAlive).toBe(true);
  });
});
```

---

## Summary: All 5 Issues Diagnosed

| Issue | Root Cause | Fix Effort | Priority |
|-------|-----------|-----------|----------|
| **#1: XSS** | No selector validation | 3h | 🔴 Critical |
| **#2: Message race** | Multiple listeners | 2h | 🔴 Critical |
| **#3: Token race** | No refresh locking | 1h | 🔴 Critical |
| **#4: Silent failures** | No error reporting | 4h | 🔴 Critical |
| **#5: Content script disconnect** | No heartbeat/timeout | 2h | 🔴 Critical |

**Total effort to fix:** ~12 hours  
**Critical fixes unlocking:** Phase 2 (Design), Phase 3 (Architecture decisions), Phase 5 (Tests)

**Next phase:** Design solutions for each issue
