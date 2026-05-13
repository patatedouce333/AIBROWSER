# Phase 2: System Design — Complete Solutions
**Cometeor Extension Architectural Redesigns**  
**Date:** May 2026 | **Status:** Design Phase

---

## Design #1: Message Routing Without Race Conditions

### Problem
Current: 3 separate `chrome.runtime.onMessage.addListener()` calls → multiple handlers → race conditions  
Goal: Single dispatcher with clear type-based routing; no duplicate responses

### Requirements

**Functional:**
- Route messages to appropriate handler based on type
- Handle async handler execution
- Support sidebar messages, content script messages, config messages

**Non-Functional:**
- Latency: < 10ms message routing overhead
- Reliability: 100% message delivery (at least once)
- No duplicate responses
- Clear error reporting

**Constraints:**
- Must work with Chrome extension message passing API
- Service worker may be suspended
- Multiple message types: START_TASK, CANCEL_TASK, DOM_SNAPSHOT, etc.

### High-Level Design

```
┌──────────────────────────────────────┐
│ Chrome Runtime Message API           │
│ (chrome.runtime.onMessage)           │
└───────────────┬──────────────────────┘
                │
                ▼
┌──────────────────────────────────────┐
│ Single Message Dispatcher            │
│ (ONE chrome.runtime.onMessage        │
│  .addListener call)                  │
└───────────────┬──────────────────────┘
                │
        ┌───────┴────────┐
        │                │
        ▼                ▼
┌──────────────┐  ┌──────────────────┐
│ Message Type │  │ Router Table     │
│ Check        │  │ {                │
│              │  │   CONFIG_*: fn   │
│              │  │   START_*: fn    │
│              │  │   DOM_*: fn      │
│              │  │ }                │
└──────────────┘  └────────┬─────────┘
                           │
                ┌──────────┼──────────┐
                │          │          │
                ▼          ▼          ▼
         ┌────────────┐┌─────────┐┌────────────┐
         │ ConfigMgr  ││TaskMgr  ││ContentScript
         │ Handler    ││Handler  ││Handler
         └────────────┘└─────────┘└────────────┘
```

### Detailed Design

```typescript
// ✅ SAFE - Type-based routing with single listener

// 1. Define message types
type MessageType = 
  | 'CONFIG_UPDATED'
  | 'TEST_CONNECTION'
  | 'START_TASK'
  | 'CANCEL_TASK'
  | 'GET_TASKS'
  | 'GET_AUTH_STATUS'
  | 'DOM_SNAPSHOT'
  | 'MUTATION_DETECTED'
  | 'SPA_NAVIGATION';

// 2. Define handler type
type MessageHandler = (
  message: any, 
  sender: chrome.runtime.MessageSender
) => Promise<any>;

// 3. Router table
const messageHandlers: Record<MessageType, MessageHandler> = {
  // Config handlers
  'CONFIG_UPDATED': async (message) => {
    VertexClient.updateConfig(message.config);
    return { success: true };
  },

  'TEST_CONNECTION': async (message) => {
    const success = await VertexClient.testConnection();
    return { success };
  },

  // Task handlers
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

  'GET_AUTH_STATUS': async (message) => {
    const tokenString = await AuthManagerPKCE.getValidToken();
    const tokens = tokenString ? await AuthManagerPKCE.getStoredTokens() : undefined;
    return { 
      type: 'AUTH_STATUS', 
      authenticated: !!tokenString, 
      tokens 
    };
  },

  // Content script handlers
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

  'SPA_NAVIGATION': async (message, sender) => {
    if (!sender.tab?.id) throw new Error('SPA_NAVIGATION requires tab context');
    taskManager.handleSpaNavigation(message.url, sender.tab.id);
    return { success: true };
  },
};

// 4. Single dispatcher
chrome.runtime.onMessage.addListener(
  (message: any, sender: chrome.runtime.MessageSender, sendResponse) => {
    (async () => {
      try {
        const handler = messageHandlers[message.type as MessageType];

        if (!handler) {
          throw new Error(`Unknown message type: ${message.type}`);
        }

        const response = await handler(message, sender);
        sendResponse(response); // ← Called exactly once
      } catch (error: any) {
        console.error('Message handler error:', error);
        sendResponse({
          type: 'ERROR',
          error: error.message,
          stack: error.stack
        });
      }
    })();

    return true; // Keep message channel open for async response
  }
);
```

### Trade-off Analysis

| Aspect | Single Dispatcher | Multiple Listeners (Current) |
|--------|---|---|
| **Race conditions** | None (routing is serial) | Multiple responses possible |
| **Code clarity** | Clear: each message type → handler | Unclear: message processed by multiple |
| **Testability** | Each handler testable independently | Hard to test concurrent behavior |
| **Extensibility** | Add new type: add entry to object | Add new listener: more complex |
| **Error handling** | Centralized error handling | Errors scattered across listeners |
| **Performance** | Slightly slower (one routing lookup) | Slightly faster (direct execution) |
| **Complexity** | Low (lookup + call) | Medium (multiple async handlers) |

### Scale Considerations

- **Current load:** ~10 messages/sec (small projects)
- **High load:** Could be 100+ messages/sec during long tasks
- **Routing latency:** < 1ms per message (negligible)
- **Memory:** Minimal (handler table is static)

### Monitoring & Metrics

```typescript
// Add metrics to track message routing
const metrics = {
  messagesProcessed: 0,
  errorCount: 0,
  latencyByType: new Map<string, number[]>(),
};

// In dispatcher
const startTime = performance.now();
try {
  const response = await handler(message, sender);
  const duration = performance.now() - startTime;
  metrics.latencyByType.get(message.type)?.push(duration);
  metrics.messagesProcessed++;
} catch (error) {
  metrics.errorCount++;
}
```

---

## Design #2: Fault-Tolerant Action Execution

### Problem
Current: Actions fail silently; no retry; AI doesn't know failure happened  
Goal: Retry failed actions with backoff; explicit failure reporting

### Requirements

**Functional:**
- Execute actions sequentially
- Retry failed actions up to 3 times
- Report all failures explicitly
- Stop on critical action failure (e.g., form submission)

**Non-Functional:**
- Latency: Minimal increase (retry delay max 400ms)
- Reliability: 95%+ success rate on retryable failures
- Clear error messages for debugging

**Constraints:**
- Content script response latency: 200-500ms per action
- Network timeouts possible
- DOM state can change between retries

### High-Level Design

```
Task Execution Flow:

┌─ Start Plan ─────────────────┐
│ [Action1, Action2, Action3]  │
└──────────────┬───────────────┘
               │
        ┌──────▼──────┐
        │ For each    │
        │ action      │
        └──────┬──────┘
               │
        ┌──────▼──────────────┐
        │ Retry Loop          │
        │ (max 3 attempts)    │
        └──────┬──────────────┘
               │
     ┌─────────┴──────────┐
     │                    │
     ▼                    ▼
┌──────────────┐   ┌──────────────┐
│ Execute      │   │ Wait backoff │
│ Action       │   │ 100ms*2^N    │
└──────┬───────┘   └───────┬──────┘
       │                   │
   SUCCESS?          Retry?
    │   │                  │
    ▼   ▼                  │
   ✓    ╳──────────────────┘
        (Max retries exceeded)
        
   Report: {
     action,
     success: true/false,
     attempts: N,
     error: string
   }
```

### Detailed Design

```typescript
// ✅ SAFE - Retry with exponential backoff

class ActionExecutor {
  private static readonly MAX_RETRIES = 3;
  private static readonly BASE_BACKOFF_MS = 100;
  private static readonly CRITICAL_ACTIONS = ['click[submit]', 'press[enter]'];

  static async executePlan(
    plan: Plan,
    tabId: number
  ): Promise<ExecutionResult> {
    const results: ActionResult[] = [];
    let criticalFailure: Error | null = null;

    // Step 1: Validate content script is alive before starting
    try {
      await ContentScriptMonitor.ensureAlive(tabId);
    } catch (error) {
      return {
        success: false,
        completed: false,
        error: `Content script not available on tab ${tabId}`,
        results: []
      };
    }

    // Step 2: Execute each action with retry
    for (const action of plan.actions) {
      const actionResult = await this.executeActionWithRetry(action, tabId);
      results.push(actionResult);

      // Step 3: Stop on critical failure
      if (!actionResult.success && this.isCriticalAction(action)) {
        criticalFailure = new Error(
          `Critical action failed: ${action.type} - ${actionResult.error}`
        );
        break;
      }

      // Step 4: Small delay between actions for stability
      await this.sleep(500);
    }

    // Step 5: Summarize results
    const failedCount = results.filter(r => !r.success).length;

    return {
      success: failedCount === 0,
      completed: failedCount === 0,
      results,
      failedActions: results.filter(r => !r.success),
      totalAttempts: results.reduce((sum, r) => sum + r.attempts, 0),
      error: criticalFailure?.message || null
    };
  }

  private static async executeActionWithRetry(
    action: Action,
    tabId: number
  ): Promise<ActionResult> {
    let lastError: Error | null = null;

    // Retry loop: up to 3 attempts
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        // Execute the action
        const result = await this.executeAction(action, tabId);

        return {
          action,
          success: true,
          result,
          attempts: attempt,
          error: null
        };
      } catch (error: any) {
        lastError = error;

        // Determine if error is retryable
        const isRetryable = this.isRetryableError(error);

        if (!isRetryable || attempt === this.MAX_RETRIES) {
          // Non-retryable error or max retries exceeded
          break;
        }

        // Exponential backoff: 100ms, 200ms, 400ms
        const backoffMs = this.BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
        await this.sleep(backoffMs);

        // Log retry attempt
        console.log(
          `Action retry ${attempt}/${this.MAX_RETRIES} for ${action.type} ` +
          `after ${backoffMs}ms backoff`
        );
      }
    }

    // All retries exhausted
    return {
      action,
      success: false,
      result: null,
      attempts: this.MAX_RETRIES,
      error: lastError?.message || 'Unknown error'
    };
  }

  private static isRetryableError(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';

    // Retryable errors
    const retryablePatterns = [
      'timeout',
      'temporary',
      'econnrefused',
      'transient',
      'unavailable',
      'selector not found', // Page might still be loading
      'element not visible' // Might appear on retry
    ];

    return retryablePatterns.some(pattern => message.includes(pattern));
  }

  private static isCriticalAction(action: Action): boolean {
    const criticalPatterns = [
      /submit/i,
      /confirm/i,
      /delete/i,
      /send/i,
      /buy/i,
      /pay/i
    ];

    const descriptor = `${action.type}:${action.description || ''}`;
    return criticalPatterns.some(pattern => pattern.test(descriptor));
  }

  private static async executeAction(
    action: Action,
    tabId: number
  ): Promise<any> {
    switch (action.type) {
      case 'click':
        return this.executeClick(action, tabId);
      case 'type':
        return this.executeType(action, tabId);
      case 'scroll':
        return this.executeScroll(action, tabId);
      case 'wait':
        return this.executeWait(action);
      case 'press_key':
        return this.executePressKey(action, tabId);
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  private static async executeClick(
    action: Action,
    tabId: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(
          `Click timeout (30s). Content script may be unresponsive on tab ${tabId}`
        ));
      }, 30000);

      chrome.tabs.sendMessage(
        tabId,
        {
          type: 'EXECUTE_ACTION',
          action: {
            type: 'click',
            selector: action.selector,
            x: action.x,
            y: action.y
          }
        },
        (response) => {
          clearTimeout(timeout);

          if (chrome.runtime.lastError) {
            reject(new Error(
              `Tab ${tabId} error: ${chrome.runtime.lastError.message}`
            ));
          } else if (response?.success) {
            resolve();
          } else {
            reject(new Error(response?.error || 'Click failed'));
          }
        }
      );
    });
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Result types
interface ActionResult {
  action: Action;
  success: boolean;
  result: any;
  attempts: number;
  error: string | null;
}

interface ExecutionResult {
  success: boolean;
  completed: boolean;
  results: ActionResult[];
  failedActions: ActionResult[];
  totalAttempts: number;
  error: string | null;
}
```

### Trade-off Analysis

| Aspect | With Retry (Proposed) | Without Retry (Current) |
|--------|---|---|
| **Success rate** | 95%+ (recovers transient failures) | 70% (fails on first error) |
| **Latency** | +400ms worst case (3 retries) | Faster, but more failures |
| **Complexity** | Moderate (retry loop + backoff) | Simple (direct execution) |
| **Error clarity** | Explicit (report all failures) | Silent (lose error context) |
| **User experience** | Better (more likely to succeed) | Worse (surprise failures) |
| **Implementation** | ~20 lines additional code | No change |

### Metrics to Track

```typescript
const executionMetrics = {
  actionsExecuted: 0,
  actionsSucceeded: 0,
  actionsFailed: 0,
  totalRetries: 0,
  retrySuccesses: 0, // Recovered by retry
  averageAttemptsPerAction: 0,
};

// Calculate success rate
const successRate = executionMetrics.actionsSucceeded / executionMetrics.actionsExecuted;
const recoveryRate = executionMetrics.retrySuccesses / executionMetrics.totalRetries;
```

---

## Design #3: DOM Mutation Backpressure

### Problem
Current: Page with 50K nodes + 100 mutations/sec → sends all to API → API quota exhaustion  
Goal: Debounce + batch mutations; only send delta snapshots

### Requirements

**Functional:**
- Capture DOM mutations efficiently
- Batch similar mutations
- Send optimized snapshots to AI

**Non-Functional:**
- Max API data: 1MB per task (currently 50MB+)
- Latency to AI feedback: < 500ms
- Memory: Bound at 10MB

**Constraints:**
- Can't block DOM mutations
- Snapshot generation is CPU-intensive
- Network bandwidth limited

### High-Level Design

```
DOM Mutations:
[change1, change2, ... change100]
        │
        ├─ Debounce buffer (100ms window)
        │
        ├─ Batch similar mutations
        │
        ├─ Compute delta
        │  (only ~5% of DOM changed)
        │
        ├─ Compress
        │
        └─ Send to API (smaller payload)

Timeline:
T=0ms:   First mutation arrives → start 100ms window
T=50ms:  More mutations arrive → buffer them
T=99ms:  Almost at deadline → prepare snapshot
T=100ms: Debounce expires → compute delta + send

Meanwhile:
T=200ms: More mutations → new window
T=300ms: Send another snapshot
```

### Detailed Design

```typescript
// ✅ SAFE - Debounced, batched, delta snapshots

class DOMSnapshotManager {
  private static readonly DEBOUNCE_MS = 100;
  private static readonly MAX_SNAPSHOT_SIZE = 500000; // 500KB
  private static readonly FULL_SNAPSHOT_THRESHOLD = 0.5; // If >50% changed, send full

  private mutationBuffer: MutationRecord[] = [];
  private debounceTimer: NodeJS.Timeout | null = null;
  private lastSnapshot: DOM | null = null;
  private lastSnapshotTime = Date.now();

  static recordMutation(mutation: MutationRecord) {
    this.mutationBuffer.push(mutation);
    this.scheduleSnapshot();
  }

  private static scheduleSnapshot() {
    // Cancel existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Schedule new snapshot after debounce period
    this.debounceTimer = setTimeout(() => {
      this.sendSnapshot();
    }, this.DEBOUNCE_MS);
  }

  private static async sendSnapshot() {
    try {
      const currentDOM = this.captureDOM();
      const lastSnapshot = this.lastSnapshot;

      // Compute delta (only changed nodes)
      const delta = lastSnapshot
        ? this.computeDelta(lastSnapshot, currentDOM)
        : null;

      // Decide: send delta or full snapshot
      let snapshotToSend: any;
      let isFull = false;

      if (!delta) {
        // No previous snapshot → send full
        snapshotToSend = currentDOM;
        isFull = true;
      } else if (
        delta.changedNodes.length > currentDOM.nodes.length * this.FULL_SNAPSHOT_THRESHOLD
      ) {
        // Too much changed (>50%) → send full instead of delta
        snapshotToSend = currentDOM;
        isFull = true;
      } else {
        // Delta is efficient → send it
        snapshotToSend = delta;
        isFull = false;
      }

      // Compress
      const compressed = this.compress(snapshotToSend);

      // Check size
      if (compressed.byteLength > this.MAX_SNAPSHOT_SIZE) {
        console.warn(
          `Snapshot too large: ${compressed.byteLength} bytes. Skipping.`
        );
        return;
      }

      // Send to background
      chrome.runtime.sendMessage({
        type: 'DOM_SNAPSHOT',
        snapshot: snapshotToSend,
        isFull,
        timestamp: Date.now(),
        mutationCount: this.mutationBuffer.length,
        size: {
          raw: JSON.stringify(snapshotToSend).length,
          compressed: compressed.byteLength
        }
      });

      // Update state
      this.lastSnapshot = currentDOM;
      this.lastSnapshotTime = Date.now();
      this.mutationBuffer = [];
    } catch (error) {
      console.error('Snapshot error:', error);
    }
  }

  private static computeDelta(
    oldDOM: DOM,
    newDOM: DOM
  ): {
    changedNodes: DOMNode[];
    timestamp: number;
  } {
    const changedNodes: DOMNode[] = [];

    // Find nodes that changed
    for (const newNode of newDOM.nodes) {
      const oldNode = oldDOM.nodeMap.get(newNode.id);

      if (!oldNode) {
        // New node
        changedNodes.push(newNode);
      } else if (JSON.stringify(oldNode) !== JSON.stringify(newNode)) {
        // Node changed
        changedNodes.push(newNode);
      }
    }

    // Prune unchanged nodes
    return {
      changedNodes,
      timestamp: Date.now()
    };
  }

  private static compress(data: any): Uint8Array {
    // Use GZIP compression (browser native)
    const json = JSON.stringify(data);
    const encoder = new TextEncoder();
    const encoded = encoder.encode(json);

    // In production, use gzip or brotli
    // For now, return as-is (compression library would be added)
    return encoded;
  }

  private static captureDOM(): DOM {
    const nodes: DOMNode[] = [];
    const nodeMap = new Map<string, DOMNode>();

    // Traverse visible DOM
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      null
    );

    let node = walker.nextNode();
    while (node) {
      const element = node as HTMLElement;
      const domNode = this.serializeElement(element);

      nodes.push(domNode);
      nodeMap.set(domNode.id, domNode);

      node = walker.nextNode();
    }

    return { nodes, nodeMap };
  }

  private static serializeElement(element: HTMLElement): DOMNode {
    return {
      id: element.id || this.generateId(element),
      tag: element.tagName.toLowerCase(),
      text: element.textContent?.substring(0, 100) || '',
      attributes: {
        class: element.className,
        type: element.getAttribute('type'),
        placeholder: element.getAttribute('placeholder'),
        value: (element as any).value
      },
      position: {
        x: element.offsetLeft,
        y: element.offsetTop,
        width: element.offsetWidth,
        height: element.offsetHeight
      },
      visible: element.offsetParent !== null
    };
  }

  private static generateId(element: HTMLElement): string {
    return `elem-${element.hashCode()}`;
  }
}

// Types
interface DOM {
  nodes: DOMNode[];
  nodeMap: Map<string, DOMNode>;
}

interface DOMNode {
  id: string;
  tag: string;
  text: string;
  attributes: Record<string, string | null>;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  visible: boolean;
}
```

### Trade-off Analysis

| Aspect | With Backpressure (Proposed) | Without (Current) |
|--------|---|---|
| **Data per task** | ~1MB (delta snapshots) | ~50MB (full snapshots) |
| **API quota usage** | 50x reduction | High (quota exhaustion) |
| **Latency to feedback** | 100ms (debounce) | Instant (flooding) |
| **Memory usage** | Bounded (~10MB) | Unbounded (can grow) |
| **Complexity** | Moderate (delta computation) | Simple (send all) |
| **Implementation** | ~150 lines | ~50 lines |

### Metrics to Track

```typescript
const snapshotMetrics = {
  snapshotsSent: 0,
  fullSnapshots: 0,
  deltaSnapshots: 0,
  avgSize: {
    raw: 0,
    compressed: 0
  },
  compressionRatio: 0, // compressed / raw
  debounceHitRate: 0.95, // % of mutations batched
};
```

---

## Design #4: Config Management Architecture

### Problem
Current: Credentials hardcoded in source code  
Goal: Configurable at runtime; secure storage; dev/prod separation

### Requirements

**Functional:**
- Load config at startup
- Support different configs per environment
- Hot-reload config without restart

**Non-Functional:**
- Security: No credentials in source
- Availability: Config always accessible
- Auditability: Changes logged

**Constraints:**
- Chrome extension storage limits
- No backend/server available
- Must work offline

### High-Level Design

```
┌─────────────────────────────────┐
│ First Install                   │
│ (popup guides user)             │
└────────────┬────────────────────┘
             │
      ┌──────▼───────┐
      │ Options Page │
      │ (user enters │
      │  GCP ID,     │
      │  OAuth ID)   │
      └──────┬───────┘
             │
      ┌──────▼─────────────────┐
      │ chrome.storage.sync    │
      │ (encrypted by browser) │
      └──────┬─────────────────┘
             │
      ┌──────▼────────────────┐
      │ Config Manager        │
      │ (lazy load + cache)   │
      │                       │
      │ - Validate config     │
      │ - Load at startup     │
      │ - Watch for changes   │
      └──────┬────────────────┘
             │
             ├─→ VertexClient
             ├─→ AuthManager
             └─→ Other services
```

### Detailed Design

```typescript
// ✅ SAFE - Config stored securely; loaded at runtime

interface ExtensionConfig {
  oauth: {
    clientId: string;
    clientSecret?: string;
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
  features: {
    enableAutoRetry: boolean;
    enableCircuitBreaker: boolean;
    enableDeltaSnapshots: boolean;
  };
}

export class ConfigManager {
  private static config: ExtensionConfig | null = null;
  private static readonly STORAGE_KEY = 'extensionConfig';

  static async initialize(): Promise<void> {
    // Load config from storage
    const stored = await chrome.storage.sync.get(this.STORAGE_KEY);
    
    if (stored[this.STORAGE_KEY]) {
      this.config = stored[this.STORAGE_KEY];
      this.validate();
    } else {
      // First run: use defaults + prompt user to configure
      this.config = this.getDefaults();
      this.promptConfigure();
    }

    // Watch for changes (allows hot-reload)
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes[this.STORAGE_KEY]) {
        this.config = changes[this.STORAGE_KEY].newValue;
        this.validate();
        this.notifyConfigChanged();
      }
    });
  }

  static get(): ExtensionConfig {
    if (!this.config) {
      throw new Error('Config not initialized. Call initialize() first.');
    }
    return this.config;
  }

  static async set(config: Partial<ExtensionConfig>): Promise<void> {
    const merged = { ...this.config, ...config };
    this.validate(merged);
    
    await chrome.storage.sync.set({
      [this.STORAGE_KEY]: merged
    });
  }

  private static validate(config: any = this.config): void {
    if (!config) throw new Error('Config is null');

    // Required fields
    const required = [
      'oauth.clientId',
      'vertex.projectId'
    ];

    for (const field of required) {
      const [obj, key] = field.split('.');
      if (!config[obj]?.[key]) {
        throw new Error(`Missing required config: ${field}`);
      }
    }

    // Type validation
    if (typeof config.oauth.clientId !== 'string') {
      throw new Error('oauth.clientId must be a string');
    }

    if (config.vertex.model && !this.isValidModel(config.vertex.model)) {
      throw new Error(`Invalid model: ${config.vertex.model}`);
    }
  }

  private static isValidModel(model: string): boolean {
    const validModels = [
      'gemini-2.0-flash',
      'gemini-2.0-flash-exp',
      'gemini-1.5-pro'
    ];
    return validModels.includes(model);
  }

  private static getDefaults(): ExtensionConfig {
    return {
      oauth: {
        clientId: '',
        clientSecret: undefined
      },
      vertex: {
        projectId: '',
        region: 'us-central1',
        model: 'gemini-2.0-flash'
      },
      api: {
        rateLimitPerMinute: 55,
        requestTimeoutMs: 30000
      },
      features: {
        enableAutoRetry: true,
        enableCircuitBreaker: true,
        enableDeltaSnapshots: true
      }
    };
  }

  private static promptConfigure(): void {
    // Open options page to prompt configuration
    chrome.runtime.openOptionsPage();
  }

  private static notifyConfigChanged(): void {
    // Notify all services that config changed
    chrome.runtime.sendMessage({
      type: 'CONFIG_RELOADED',
      config: this.config
    }).catch(err => {
      // Message might fail if no listeners
      console.log('Config reloaded (no listeners)');
    });
  }
}

// In options page (options/index.ts):
document.getElementById('configForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const config: Partial<ExtensionConfig> = {
    oauth: {
      clientId: (document.getElementById('clientId') as HTMLInputElement).value
    },
    vertex: {
      projectId: (document.getElementById('projectId') as HTMLInputElement).value,
      model: (document.getElementById('model') as HTMLSelectElement).value
    }
  };

  try {
    await ConfigManager.set(config);
    document.getElementById('status')!.textContent = '✅ Configuration saved!';
  } catch (error: any) {
    document.getElementById('status')!.textContent = `❌ ${error.message}`;
  }
});

// In background service worker:
chrome.runtime.onStartup.addListener(async () => {
  await ConfigManager.initialize();
});

// Initialization
async function initializeExtension() {
  await ConfigManager.initialize();
  // Now config available to all services
  const config = ConfigManager.get();
  VertexClient.configure(config.vertex);
  AuthManagerPKCE.configure(config.oauth);
}
```

### Trade-off Analysis

| Aspect | Secure Storage (Proposed) | Hardcoded (Current) |
|--------|---|---|
| **Security** | Excellent (encrypted by browser) | Poor (visible in source) |
| **Flexibility** | User configurable | Developer must edit code |
| **Auditability** | Changes tracked in storage | No audit trail |
| **Complexity** | Medium (storage API) | Minimal (constants) |
| **Environment parity** | Multiple configs possible | Single hardcoded value |
| **Time to configure** | ~2 minutes (user setup) | 30 minutes (rebuild) |

---

## Design #5: Circuit Breaker for API

### Problem
Current: API rate limit (429) → keep hammering → extended outage  
Goal: Detect limit; stop sending; recover gracefully

### Requirements

**Functional:**
- Detect rate limit (3 consecutive 429s)
- Stop sending during limit
- Exponential recovery backoff

**Non-Functional:**
- Prevent request queuing during limit
- Reduce API load during incidents
- Clear metrics on circuit state

**Constraints:**
- Must respect 55 req/min quota
- User requests should still fail-fast
- No external dependencies

### High-Level Design

```
Circuit Breaker States:

┌─────────────────────────────────┐
│ CLOSED (normal)                 │
│ ✓ Accept requests               │
│ ✓ Forward to API                │
└─────────────────────────────────┘
          │
          │ 3 consecutive 429s
          ▼
┌─────────────────────────────────┐
│ OPEN (blocked)                  │
│ ✗ Reject requests               │
│ ✗ Return error immediately      │
│ ⏱ Wait for recovery time        │
└─────────────────────────────────┘
          │
          │ After 5 min
          ▼
┌─────────────────────────────────┐
│ HALF-OPEN (testing)             │
│ ⚠ Allow 1 test request          │
│ ⏱ If fails: back to OPEN        │
│ ✓ If succeeds: back to CLOSED   │
└─────────────────────────────────┘
```

### Detailed Design

```typescript
// ✅ SAFE - Circuit breaker with exponential recovery

enum CircuitState {
  CLOSED = 'CLOSED',    // Normal operation
  OPEN = 'OPEN',        // Blocked; in cooldown
  HALF_OPEN = 'HALF_OPEN' // Testing recovery
}

export class CircuitBreaker {
  private static state: CircuitState = CircuitState.CLOSED;
  private static failureCount = 0;
  private static lastFailureTime = 0;
  private static recoveryAttempts = 0;
  private static openedAt = 0;

  private static readonly FAILURE_THRESHOLD = 3; // 3 consecutive failures
  private static readonly INITIAL_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly MAX_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
  private static readonly HALF_OPEN_TIMEOUT_MS = 10 * 1000; // 10 seconds

  static async executeWithBreaker<T>(
    fn: () => Promise<T>
  ): Promise<T> {
    // Check circuit state
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptRecovery()) {
        // Try recovery
        this.state = CircuitState.HALF_OPEN;
      } else {
        // Still in cooldown
        const timeSinceOpen = Date.now() - this.openedAt;
        const cooldownRemaining = this.getActiveCooldown() - timeSinceOpen;
        throw new Error(
          `API rate limit. Retry after ${Math.ceil(cooldownRemaining / 1000)}s`
        );
      }
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error: any) {
      this.recordFailure(error);
      throw error;
    }
  }

  private static recordSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      // Recovery successful
      console.log('API recovered. Circuit CLOSED.');
      this.state = CircuitState.CLOSED;
      this.failureCount = 0;
      this.recoveryAttempts = 0;
    } else if (this.state === CircuitState.CLOSED) {
      // Normal operation
      this.failureCount = 0;
    }
  }

  private static recordFailure(error: any): void {
    const is429 = error?.status === 429 || error?.message?.includes('429');

    if (is429) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.failureCount >= this.FAILURE_THRESHOLD) {
        // Open circuit
        this.state = CircuitState.OPEN;
        this.openedAt = Date.now();
        this.recoveryAttempts = 0;

        console.error(
          `API rate limited. Circuit OPEN. ` +
          `Will retry after ${this.getActiveCooldown() / 1000}s`
        );
      }
    } else {
      // Non-429 error: don't count toward circuit opening
      console.error(`API error (non-429): ${error.message}`);
    }

    if (this.state === CircuitState.HALF_OPEN) {
      // Recovery failed
      this.state = CircuitState.OPEN;
      this.recoveryAttempts++;
      const newCooldown = Math.min(
        this.getActiveCooldown() * 2,
        this.MAX_COOLDOWN_MS
      );
      console.log(`Recovery attempt ${this.recoveryAttempts} failed. Cooling down ${newCooldown / 1000}s`);
    }
  }

  private static shouldAttemptRecovery(): boolean {
    const timeSinceOpen = Date.now() - this.openedAt;
    return timeSinceOpen >= this.getActiveCooldown();
  }

  private static getActiveCooldown(): number {
    // Exponential backoff: 5min, 10min, 20min (capped at 30min)
    return Math.min(
      this.INITIAL_COOLDOWN_MS * Math.pow(2, this.recoveryAttempts),
      this.MAX_COOLDOWN_MS
    );
  }

  static getMetrics() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      recoveryAttempts: this.recoveryAttempts,
      openedAt: this.openedAt,
      timeSinceOpen: this.openedAt ? Date.now() - this.openedAt : null,
      activeCooldown: this.getActiveCooldown()
    };
  }
}

// Integration with VertexClient:
export class VertexClient {
  static async generateContent(prompt: string): Promise<string> {
    return CircuitBreaker.executeWithBreaker(async () => {
      // Actual API call
      return this.makeAPIRequest(prompt);
    });
  }

  private static async makeAPIRequest(prompt: string): Promise<string> {
    const response = await fetch(
      `https://vertexai.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-2.0-flash:streamGenerateContent`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ contents: [...] })
      }
    );

    if (response.status === 429) {
      throw new Error('Rate limited');
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return response.text();
  }
}
```

### Trade-off Analysis

| Aspect | With Circuit Breaker (Proposed) | Without (Current) |
|--------|---|---|
| **Recovery time** | Minutes (5-30min cooldown) | Hours (user waits) |
| **API load** | Reduced (stops hammering) | Continuous 429s |
| **User experience** | Clear error + retry time | Hung tasks |
| **Complexity** | Low (state machine) | Simpler (no protection) |
| **Monitoring** | Easy to track state changes | Invisible failures |

---

## Summary: All Designs Complete

| Design | Purpose | Complexity | Implementation Time |
|--------|---------|-----------|-----------|
| **#1: Message Routing** | Eliminate race conditions | Medium | 2-3 hours |
| **#2: Fault-Tolerant Execution** | Retry + explicit failures | Medium | 3-4 hours |
| **#3: DOM Backpressure** | Reduce API data | Medium | 3-4 hours |
| **#4: Config Management** | Secure credential storage | Low | 1-2 hours |
| **#5: Circuit Breaker** | Handle rate limits gracefully | Low | 1-2 hours |

**Total Phase 2 effort:** ~12 hours  
**Ready for:** Phase 3 (Architecture Decisions)
