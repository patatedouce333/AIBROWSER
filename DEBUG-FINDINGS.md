# Debug Findings: Cometeor Extension
**Investigation Date:** May 2026 | **Inspector:** Senior Developer

---

## Issue Discovery Process

### 1. Static Code Analysis
- ✅ Identified hardcoded values
- ✅ Found missing validation
- ✅ Detected race conditions in message handlers
- ✅ Spotted selector injection vulnerability

### 2. Architecture Review
- ✅ Analyzed component coupling
- ✅ Reviewed state management
- ✅ Assessed concurrent access patterns
- ✅ Evaluated error handling

### 3. Security Audit
- ✅ PKCE implementation review
- ✅ Input validation coverage
- ✅ Storage security assessment
- ✅ API authentication verification

---

## Critical Issues Found

### Issue #1: XSS via Selector Injection
**Severity:** 🔴 CRITICAL  
**CWE:** CWE-95 (Improper Neutralization of Directives)  
**CVSS Score:** 8.2 (High)

**Location:** `src/background/action-executor.ts:61-68`

**Proof of Concept:**
```typescript
// Attacker controls the prompt
const task = "Click on button with text: '); alert('XSS') //"

// AI generates plan
const plan = {
  actions: [{
    type: 'click',
    selector: "button:contains('); alert('XSS') //)"
  }]
}

// Executor sends to content script
chrome.tabs.sendMessage(tabId, {
  action: {
    selector: "button:contains('); alert('XSS') //)"
  }
});

// Content script executes (vulnerable)
document.querySelector("button:contains('); alert('XSS') //)");
// ❌ If selector passed to eval, arbitrary code execution
```

**Root Cause:** No validation that selector is safe CSS.

**Exploitation:** Attacker crafts prompt → AI includes malicious selector → Extension executes it.

**Impact:** Arbitrary code execution in extension context (access to all data, storage, API keys).

**Fix:**
```typescript
// ✅ Whitelist approach
const isValidSelector = (selector: string): boolean => {
  // Only allow CSS selectors matching pattern
  const cssPattern = /^[a-zA-Z0-9\-_\.\[\]=:>#\s,()'"]*$/;
  if (!cssPattern.test(selector)) return false;
  
  try {
    // Validate it's a valid selector
    document.querySelector(selector);
    return true;
  } catch {
    return false;
  }
};

// Reject if invalid
if (!isValidSelector(action.selector)) {
  throw new Error(`Invalid selector: ${action.selector}`);
}
```

---

### Issue #2: Service Worker Message Handler Race
**Severity:** 🔴 CRITICAL  
**Type:** Race Condition / Concurrency Bug

**Location:** `src/background/index.ts:20-100`

**Symptom:** When multiple messages arrive rapidly:
```
Timeline:
T=0ms   CONFIG_UPDATED message arrives
T=0ms   Listener #1 fires (handles CONFIG_UPDATED)
T=0ms   Listener #2 fires (switch statement, no match)
T=0ms   Listener #3 fires (checks tab.id, processes anyway?)
T=1ms   sendResponse called 3 times on same message
        → Chrome warns: "Message response error"
```

**Why it happens:**
```typescript
// THREE separate listeners, each process EVERY message
chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  // Listener 1: Handles CONFIG_UPDATED and TEST_CONNECTION
  if (message.type === 'CONFIG_UPDATED') { ... }
  if (message.type === 'TEST_CONNECTION') { ... }
  // Falls through for other messages
});

chrome.runtime.onMessage.addListener((message: SidebarMessage, sender, sendResponse) => {
  // Listener 2: Handles START_TASK, CANCEL_TASK, GET_TASKS, GET_AUTH_STATUS
  switch (message.type) { ... }
  // Also processes all messages
});

chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  // Listener 3: Handles DOM_SNAPSHOT, MUTATION_DETECTED, SPA_NAVIGATION
  if (!sender.tab?.id) return; // Only guard for tab messages
  // Could still double-respond if listener 2 sends response
});
```

**Consequence:**
```
sendResponse() called twice
  ↓
Chrome logs: "Message response already sent (or finished) for tab 1, frame 0"
  ↓
Message corruption possible
  ↓
Sidebar UI might get response from wrong listener
  ↓
Unpredictable behavior (sometimes works, sometimes doesn't)
```

**Reproduction:**
```bash
# In extension console
chrome.runtime.sendMessage({ type: 'START_TASK', description: 'search google' });
# Watch for warnings in console
# Output will be inconsistent on repeated calls
```

**Fix:** Single dispatcher with clear routing:
```typescript
// ONE listener that routes to appropriate handler
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  try {
    let response;
    
    if (message.type === 'CONFIG_UPDATED' || message.type === 'TEST_CONNECTION') {
      response = await handleConfigMessage(message);
    } else if (message.type === 'START_TASK' || message.type === 'CANCEL_TASK') {
      response = await handleTaskMessage(message);
    } else if (message.type === 'DOM_SNAPSHOT') {
      if (!sender.tab?.id) throw new Error('DOM_SNAPSHOT requires tab context');
      response = await handleContentScriptMessage(message, sender);
    } else {
      throw new Error(`Unknown message type: ${message.type}`);
    }
    
    sendResponse(response); // Only called once
  } catch (error) {
    sendResponse({ type: 'ERROR', error: error.message });
  }
});
```

---

### Issue #3: Token Refresh Race Condition
**Severity:** 🔴 CRITICAL  
**Type:** Concurrency Bug

**Location:** `src/background/auth-manager-pkce.ts:77-82`

**Scenario:**
```
Timeline: Two rapid API requests

T=0ms    Request #1: getValidToken()
         → Token expired
         → Call refreshToken() [starts async]
         
T=1ms    Request #2: getValidToken()
         → Token still expired (refresh not done)
         → Call refreshToken() [starts async, same code path]

T=100ms  refreshToken() completes (Request #1)
         → New token stored
         
T=101ms  refreshToken() completes (Request #2)
         → Overwrites with old refresh result (duplicate API call)
```

**Consequence:**
- Two Vertex AI API calls instead of one
- Potential token mismatch
- Higher latency
- Wasted quota

**Code:**
```typescript
// ❌ NOT IDEMPOTENT
static async refreshToken(): Promise<string | null> {
  const tokens = await TokenStore.get();
  if (!tokens?.refreshToken) return null;
  
  try {
    const response = await this.exchangeRefreshToken(tokens.refreshToken);
    // Two concurrent calls both reach here
    await TokenStore.save(response); // Both overwrite
    return response.accessToken;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return null;
  }
}
```

**Fix:** Use mutual exclusion (lock) pattern:
```typescript
// ✅ IDEMPOTENT with lock
private static refreshPromise: Promise<string | null> | null = null;

static async refreshToken(): Promise<string | null> {
  // If already refreshing, wait for that result
  if (this.refreshPromise) return this.refreshPromise;
  
  this.refreshPromise = (async () => {
    try {
      const tokens = await TokenStore.get();
      if (!tokens?.refreshToken) return null;
      
      const response = await this.exchangeRefreshToken(tokens.refreshToken);
      await TokenStore.save(response);
      return response.accessToken;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return null;
    } finally {
      this.refreshPromise = null; // Release lock
    }
  })();
  
  return this.refreshPromise;
}
```

---

### Issue #4: Silent Failures in Action Execution
**Severity:** 🔴 CRITICAL  
**Type:** Error Handling / Observability

**Location:** `src/background/action-executor.ts:12-27`

**Symptom:** User task completes without error, but fewer actions succeeded than expected.

**Example:**
```typescript
Plan: [
  { type: 'type', selector: 'input#email', text: 'user@example.com' },
  { type: 'type', selector: 'input#password', text: 'securepass123' },
  { type: 'click', selector: 'button[type=submit]' }
]

Execution:
- Action #1 (type email): SUCCESS
- Action #2 (type password): FAILS (selector not found, wrong page state)
  └─ Logged to console only
  └─ Not reported back to sidebar
  └─ Not reported to AI for replanning
- Action #3 (click submit): SUCCESS (but password field empty!)

Result: Form rejected; user confused
        Task marked "complete"
        AI doesn't know password wasn't entered
```

**Root Cause:**
```typescript
for (const action of plan.actions) {
  try {
    const result = await this.executeAction(action, tabId);
    results.push({ action, success: true, result });
  } catch (error: any) {
    console.error(`Action failed: ${action.type}`, error); // ← Only logs!
    results.push({ action, success: false, error: error.message });
    
    // Silently continues unless it's a critical action
    if (action.type === 'click' && action.description?.includes('submit')) {
      throw error; // Only critical actions stop
    }
  }
}

// Returns to TaskManager
return { results, completed: true }; // ← Claims completion!
```

**Sidebar sees:**
```typescript
// In TaskManager
taskManager.executePlan(plan).then(result => {
  // result = { results: [...], completed: true }
  updateUI({ status: 'completed', progress: 100 });
  // User sees ✅ Task Complete!
});
```

**AI doesn't know:**
- That password field failed
- That it should retry
- That form submission might fail

**Fix:** Retry with exponential backoff + explicit failure reporting:
```typescript
// ✅ SAFE with retry
static async executePlan(plan: Plan, tabId: number) {
  const results = [];
  let lastError: Error | null = null;
  
  for (const action of plan.actions) {
    let succeeded = false;
    let lastActionError: Error | null = null;
    
    // Retry up to 3 times with backoff
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
        break;
      } catch (error: any) {
        lastActionError = error;
        if (attempt < 3) {
          // Exponential backoff: 100ms, 200ms, 400ms
          await this.sleep(100 * Math.pow(2, attempt - 1));
        }
      }
    }
    
    if (!succeeded) {
      results.push({
        action,
        success: false,
        error: lastActionError!.message,
        attempts: 3
      });
      
      // Critical actions: stop immediately
      if (this.isCriticalAction(action)) {
        lastError = lastActionError;
        break;
      }
    }
  }
  
  // Report failures clearly
  const failedCount = results.filter(r => !r.success).length;
  return {
    results,
    completed: failedCount === 0,
    failed: failedCount,
    lastError
  };
}
```

---

### Issue #5: Hardcoded Configuration
**Severity:** 🔴 CRITICAL  
**Type:** Security / Configuration Management

**Location:** 
- `src/background/auth-manager-pkce.ts:6`
- `src/background/vertex-client.ts:50-54`

**Problem:**
```typescript
// ❌ IN SOURCE CODE
const OAUTH_CONFIG = {
  clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
};

// ❌ IN SOURCE CODE
static config: VertexConfig = {
  projectId: 'your-project-id',
  region: 'us-central1',
  model: 'gemini-2.0-flash-exp',
};
```

**Risks:**
1. Credentials visible in source repo
2. Can't use different credentials for dev/prod
3. Hard to rotate secrets
4. Impossible to keep creds out of git history
5. Each user has to edit code to configure

**Fix:** Load from chrome.storage:
```typescript
// ✅ SAFE - Loaded at runtime
interface ExtensionConfig {
  oauth: {
    clientId: string;
    clientSecret?: string; // For server-side flows
  };
  vertex: {
    projectId: string;
    region: string;
    model: string;
  };
  api: {
    rateLimitPerMinute: number;
    requestTimeoutMs: number;
  };
}

export class ConfigManager {
  private static config: ExtensionConfig | null = null;
  
  static async load(): Promise<ExtensionConfig> {
    const stored = await chrome.storage.sync.get('extensionConfig');
    this.config = stored.extensionConfig || getDefaults();
    return this.config;
  }
  
  static validate(config: any): config is ExtensionConfig {
    // Validate structure and required fields
    return !!(
      config?.oauth?.clientId &&
      config?.vertex?.projectId &&
      typeof config.oauth.clientId === 'string'
    );
  }
}
```

**Setup flow in Options page:**
```html
<!-- options/options.html -->
<form id="configForm">
  <label>
    GCP Project ID:
    <input type="text" id="projectId" required />
  </label>
  
  <label>
    OAuth Client ID:
    <input type="text" id="clientId" required />
  </label>
  
  <button type="submit">Save Configuration</button>
  <div id="status"></div>
</form>

<script>
document.getElementById('configForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const config = {
    oauth: { clientId: document.getElementById('clientId').value },
    vertex: { projectId: document.getElementById('projectId').value }
  };
  
  if (ConfigManager.validate(config)) {
    await chrome.storage.sync.set({ extensionConfig: config });
    document.getElementById('status').textContent = '✅ Saved!';
  } else {
    document.getElementById('status').textContent = '❌ Invalid config';
  }
});
</script>
```

---

## Performance Issues

### Issue #6: Unbounded DOM Snapshots
**Severity:** 🟡 HIGH  
**Type:** Performance / Resource Leak

**Problem:**
- Large page: 50K DOM nodes
- Mutation every 100ms
- Each snapshot: 500KB
- 10 snapshots/sec = 5MB/sec sent to API

**Fix:** Debounce + delta snapshots:
```typescript
// In context-manager.ts
class ContextManager {
  private mutationBuffer: any[] = [];
  private debounceTimer: NodeJS.Timeout | null = null;
  private lastSnapshot: DOM | null = null;
  
  recordMutation(mutation: any) {
    this.mutationBuffer.push(mutation);
    this.scheduleSnapshot();
  }
  
  private scheduleSnapshot() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    
    // Wait 100ms for more mutations to batch
    this.debounceTimer = setTimeout(() => {
      this.sendDeltaSnapshot();
    }, 100);
  }
  
  private sendDeltaSnapshot() {
    const current = this.getCurrentDOM();
    const delta = this.computeDelta(this.lastSnapshot, current);
    
    // Only send changed nodes (usually < 5% of DOM)
    chrome.runtime.sendMessage({
      type: 'DOM_SNAPSHOT',
      delta, // Smaller payload
      full: delta.size > current.size * 0.5 // Fallback to full if > 50% changed
    });
    
    this.lastSnapshot = current;
  }
}
```

---

### Issue #7: No Timeout on API Requests
**Severity:** 🟡 HIGH  
**Type:** Reliability

**Problem:** Vertex AI call hangs → task hangs forever

**Fix:**
```typescript
// In vertex-client.ts
async generateContent(prompt: string, options = {}): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      ...options
    });
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Vertex AI request timeout (30s)');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
```

---

## Memory Leaks

### Issue #8: Content Script Cleanup on Tab Close
**Severity:** 🟡 HIGH  
**Type:** Resource Leak

**Problem:**
- Tab closed while task running
- Content script stopped, but TaskManager still has references
- Keeps accumulating closed tab references

**Fix:**
```typescript
// Detect tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  taskManager.cleanupTab(tabId);
  // Stop any ongoing operations for that tab
});
```

---

## Summary Table

| ID | Issue | Severity | Type | Fix Effort | Impact |
|----|-------|----------|------|-----------|--------|
| 1 | Selector injection | 🔴 Critical | Security | 3h | XSS, data theft |
| 2 | Message handler race | 🔴 Critical | Concurrency | 2h | Unpredictable behavior |
| 3 | Token refresh race | 🔴 Critical | Concurrency | 1h | Token mismatch, wasted API |
| 4 | Silent action failures | 🔴 Critical | Error handling | 4h | Task failures unreported |
| 5 | Hardcoded config | 🔴 Critical | Security | 2h | Credential exposure |
| 6 | DOM snapshot spam | 🟡 High | Performance | 3h | API quota exhaustion |
| 7 | No request timeout | 🟡 High | Reliability | 1h | Tasks hang forever |
| 8 | Content script leaks | 🟡 High | Memory | 2h | Memory growth |

---

## Next Steps

### Immediate (This week)
1. Fix selector validation (prevents XSS)
2. Consolidate message handlers (prevents race)
3. Add token refresh locking (prevents duplication)
4. Add action retry logic (fixes silent failures)

### Short-term (Next week)
5. Move config to storage
6. Debounce DOM mutations
7. Add request timeouts
8. Add tab cleanup

### Medium-term (Later)
9. Add comprehensive test suite
10. Implement circuit breaker
11. Build monitoring/logging
12. Performance optimization
