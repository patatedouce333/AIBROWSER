# Architecture Review: Cometeor Extension
**Date:** May 2026 | **Status:** Design Review | **Audience:** Engineering Team

---

## Current Architecture

### Component Overview
```
┌─────────────────────────────────────────────┐
│         Chrome Extension (MV3)              │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────┐      ┌──────────────┐   │
│  │  Sidebar UI  │      │ Options Page │   │
│  └────────┬─────┘      └──────┬───────┘   │
│           │                    │           │
│  ┌────────▼────────────────────▼─────┐    │
│  │   Background Service Worker       │    │
│  │  ┌──────────────────────────────┐ │    │
│  │  │ Message Router               │ │    │
│  │  │  - Task messages             │ │    │
│  │  │  - Config updates            │ │    │
│  │  │  - DOM snapshots             │ │    │
│  │  └──────┬───────────────────────┘ │    │
│  │         │                         │    │
│  │  ┌──────▼──────────────────────┐ │    │
│  │  │ TaskManager                 │ │    │
│  │  │  - Plan creation            │ │    │
│  │  │  - Action orchestration     │ │    │
│  │  │  - Progress tracking        │ │    │
│  │  └──────┬───────────────────────┘ │    │
│  │         │                         │    │
│  │  ┌──────▼──────┐  ┌────────────┐ │    │
│  │  │ActionPlanner│  │ActionExec  │ │    │
│  │  │ - AI prompts│  │ - DOM ops  │ │    │
│  │  │ - Plans     │  │ - Retry    │ │    │
│  │  └──────┬──────┘  └──────┬─────┘ │    │
│  │         │                │       │    │
│  │  ┌──────▼────────────────▼──┐   │    │
│  │  │ Vertex AI Client         │   │    │
│  │  │ - Streaming requests     │   │    │
│  │  │ - Rate limiting          │   │    │
│  │  │ - Token refresh          │   │    │
│  │  └──────┬───────────────────┘   │    │
│  │         │                       │    │
│  │  ┌──────▼──────────────────┐   │    │
│  │  │ Auth Manager (PKCE)     │   │    │
│  │  │ - OAuth flow            │   │    │
│  │  │ - Token storage         │   │    │
│  │  └─────────────────────────┘   │    │
│  └──────────────────────────────────┘   │
│           │                             │
│  ┌────────▼──────────────────────┐     │
│  │ Content Scripts (Per Tab)      │     │
│  │  - DOM extraction              │     │
│  │  - Humanized input simulation  │     │
│  │  - Mutation watching           │     │
│  │  - Action execution            │     │
│  └────────────────────────────────┘     │
│                                         │
└─────────────────────────────────────────┘
         │                │
         ▼                ▼
    Google Cloud      DOM/User
    (Vertex AI)       Input
```

---

## Architecture Patterns & Decisions

### 1. **Service Worker + Content Scripts**
**Pattern:** Message-passing architecture (not shared memory)

**Pros:**
- Isolated contexts (security)
- Service worker can span multiple tabs
- Easy to reload content scripts

**Cons:**
- Message passing overhead (latency)
- No shared state (must serialize)
- Async-only communication (no blocking calls)

**Trade-off:** Security > performance ✅ Correct choice for extension

---

### 2. **Task Manager as Orchestrator**
**Role:** Central state machine for task lifecycle

**Current flow:**
```
User Input
   ▼
TaskManager.createTask()
   ▼
ActionPlanner.generatePlan() [calls Vertex AI]
   ▼
ActionExecutor.executePlan() [sequential actions]
   ▼
DOM Snapshot ◄──┐
   ▼            │
AI Analysis ────┘ (feedback loop)
   ▼
Task Complete
```

**Issue:** Single-threaded; can't handle multiple concurrent tasks well.

**Recommendation:** Task parallelism matrix:
- Same tab: serialize (avoid conflicting DOM ops)
- Different tabs: parallelize (independent)
- Task priorities: high (user-triggered) > low (background)

---

### 3. **OAuth2 PKCE Flow**
**Security Model:** Valid — PKCE protects extension from token interception

**Current implementation:**
```
Extension                    Google OAuth
    │
    ├─ Generate PKCE         ┌─────────┐
    │  code_verifier         │ Browser │
    │  code_challenge        │  Opens  │
    │                        │ Auth    │
    │  Launch OAuth flow     │ Dialog  │
    ├────────────────────────▶         │
    │                        │ User    │
    │                        │ Consent │
    │  Intercept callback    │         │
    │◄────────────────────────         │
    │  with auth code        └─────────┘
    │
    ├─ Exchange code
    │  (send code_verifier)
    ├────────────────────────▶ Validate PKCE
    │                         Return: access_token
    │◄────────────────────────  refresh_token
    │
    └─ Store securely
       (chrome.storage.session)
```

**Issue:** `codeVerifier` stored in memory; lost if service worker killed.

**Fix:** Store `codeVerifier` in session storage, not memory.

---

### 4. **Rate Limiting Strategy**
**Current:** RequestQueue with fixed limits

```
Queue (max 55 req/min)
  │
  ├─ Batch requests
  ├─ Exponential backoff on 429
  ├─ Retry up to 3x
  └─ Circuit breaker? (missing)
```

**Missing:** Circuit breaker pattern
- If 3 consecutive 429s, stop sending for 5min
- Prevents overwhelming API during incidents

---

### 5. **DOM Snapshot Strategy**
**Current:** Full DOM tree on every mutation

**Problem:** Exponential cost
- Page with 10K DOM nodes
- 100 mutations/sec
- AI analysis on every one
- = 1M nodes analyzed/sec

**Better approach:**
```
Fast path: Debounce mutations (100ms window)
          Batch similar mutations
          Only analyze changed subtrees
          
Slow path: Full page analysis every 10s (for major changes)
```

---

## Key Architectural Decisions (ADRs)

### ADR-001: Service Worker Lifecycle Management
**Decision:** Use offscreen document for long-running tasks  
**Rationale:** Service worker can be terminated; offscreen document persists  
**Status:** PROPOSED (implement if tasks > 5 minutes)

### ADR-002: Message Routing Pattern
**Decision:** Single dispatcher vs. multiple listeners  
**Current:** Multiple listeners (race condition risk)  
**Recommended:** Single dispatcher with type-based routing  
**Status:** NEEDS IMPLEMENTATION

### ADR-003: State Persistence
**Decision:** Which data lives where  
```
├─ chrome.storage.session (token — cleared on browser close)
├─ chrome.storage.local (task history — persists)
├─ chrome.storage.sync (config — syncs across devices)
└─ Memory (codeVerifier, temp state — cleared on SW unload)
```
**Current:** codeVerifier in memory (wrong place)  
**Status:** NEEDS FIX

### ADR-004: Action Retry Strategy
**Decision:** Exponential backoff vs. fixed delay vs. no retry  
**Current:** No retry at all  
**Recommended:** Exponential backoff (100ms, 200ms, 400ms)  
**Status:** NEEDS IMPLEMENTATION

---

## Dataflow: Task Execution

```
Sidebar:
"Search Google for 'TypeScript'"
         │
         ▼
Browser Message API
         │
         ▼
Background Service Worker
  TaskManager.createTask()
         │
         ├─ Generate contextual prompt
         │  "Current URL: https://google.com"
         │  "User task: Search..."
         │
         ├─ Content Script: DOM snapshot
         │  └─ Send to Vertex AI
         │
         ▼
Vertex AI (Gemini 2.0 Flash)
  "I should click the search box and type..."
         │
         ▼
ActionPlanner
  Generates: [
    { type: 'click', selector: 'input[name="q"]' },
    { type: 'type', text: 'TypeScript' },
    { type: 'press_key', key: 'Enter' }
  ]
         │
         ▼
ActionExecutor
  For each action:
    ├─ Validate selector/input
    ├─ Send to content script
    ├─ Wait for DOM update
    └─ Snapshot for feedback
         │
         ▼
  (If all done: done)
  (If error: replan with new context)
```

---

## Performance Analysis

### Latency Budget for "Search Google"
```
Sidebar UI → Message          1ms
Message → Service Worker      2ms
GeneratePrompt               10ms
ContentScript.snapshot      200ms (DOM parsing)
Send to Vertex AI             5ms
Vertex AI response           2000ms (network + inference)
Plan execution (3 actions)   1500ms (each 500ms + DOM waits)
─────────────────────────────────
Total: ~3.7 seconds (acceptable for web automation)
```

### Scalability Issues
1. **DOM snapshots at scale**
   - Page: 50K nodes
   - Snapshot: 5MB gzipped
   - 10 snapshots/task = 50MB
   - Solution: Delta snapshots (only send changed nodes)

2. **Concurrent tasks**
   - Current: 1 task at a time
   - Need: 10+ concurrent (different tabs)
   - Solution: Task queue with priority + parallelism limits

3. **Token limits**
   - Gemini 2.0 Flash: 1M tokens/min
   - Long task: 100K tokens
   - Max 10 concurrent long tasks
   - Solution: Queue with admission control

---

## Recommendations: What to Fix First

### Phase 1 (Days 1-3): Security Hardening
- [ ] Move credentials to chrome.storage.sync
- [ ] Validate all DOM selectors
- [ ] Consolidate message handlers
- [ ] Add input validation

### Phase 2 (Days 4-5): Reliability
- [ ] Add action retry with backoff
- [ ] Implement timeout on API calls
- [ ] Add heartbeat for content script health
- [ ] Debounce DOM mutations

### Phase 3 (Week 2): Architecture Evolution
- [ ] Extract domain models (Task, Action, Plan)
- [ ] Implement proper error boundaries
- [ ] Add structured logging
- [ ] Build test suite (unit + integration)

### Phase 4 (Week 3): Performance
- [ ] Delta snapshots (don't send whole DOM)
- [ ] Parallel task execution
- [ ] Circuit breaker for API
- [ ] Metrics & observability

---

## Testing Strategy

### Unit Tests (Priority: HIGH)
```typescript
describe('ActionValidator', () => {
  it('rejects malicious selectors', () => {
    expect(validate({ type: 'click', selector: 'x"); DROP TABLE--' })).toBe(false);
  });
  it('accepts valid CSS selectors', () => {
    expect(validate({ type: 'click', selector: 'button.submit' })).toBe(true);
  });
});

describe('TokenManager', () => {
  it('prevents concurrent refreshes', async () => {
    const p1 = refreshToken();
    const p2 = refreshToken();
    expect(await Promise.all([p1, p2])).toEqual([token, token]);
  });
});
```

### Integration Tests (Priority: HIGH)
```typescript
describe('Task Execution', () => {
  it('executes click → screenshot → replan on failure', async () => {
    // Start task
    // Mock content script failure
    // Verify TaskManager requests new plan
    // Verify next action differs
  });
});
```

### E2E Tests (Priority: MEDIUM)
```typescript
describe('User Workflows', () => {
  it('searches Google, clicks first result, reads title', async () => {
    // Real browser test
    // Open extension, enter task
    // Verify final state matches expectation
  });
});
```

---

## Monitoring & Observability

### Key Metrics to Track
- Task success rate (target: >95%)
- Mean time to complete (target: <5s)
- API latency p99 (target: <1s)
- Token refresh rate (should be <5% of requests)
- Error rate by type (selector not found, timeout, etc.)

### Logging
```typescript
// ❌ Current
console.log('Action failed: click', error);

// ✅ Recommended (structured)
logger.error('action_failed', {
  taskId: 'task-123',
  action: { type: 'click', selector: '...' },
  error: 'selector_not_found',
  attempt: 2,
  timestamp: '2026-05-10T14:30:00Z'
});
```

---

## Conclusion

**Maturity Level:** MVP (Minimum Viable Product)
- **Strengths:** Clean separation of concerns, PKCE auth, streaming API support
- **Weaknesses:** Race conditions, no retry logic, security gaps, no tests
- **Path to Production:** 2-3 weeks of focused hardening + testing

**Risk Assessment:** 🟡 Moderate
- Use only on trusted websites (no untrusted input)
- No financial transactions
- No sensitive data entry until selector validation fixed
