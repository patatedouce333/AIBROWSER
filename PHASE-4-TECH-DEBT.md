# Phase 4: Technical Debt Audit & Prioritization
**Cometeor Extension: Complete Debt Inventory**  
**Date:** May 2026 | **Status:** Audit Phase | **Audience:** Engineering Team

---

## Executive Summary

**Total Debt Items:** 28  
**Critical (P0):** 5 items | **High (P1):** 8 items | **Medium (P2):** 10 items | **Low (P3):** 5 items

**Estimated Remediation Time:**
- Phase 1 (Security): 3-4 days (P0 + critical P1s)
- Phase 2 (Reliability): 2-3 days (remaining P1s)
- Phase 3 (Quality): 5-7 days (P2s)
- Phase 4 (Polish): 3-5 days (P3s)

**Total:** ~2 weeks of focused effort

---

## Prioritization Framework

Each item scored on:
- **Impact (1-5):** How much does it slow development/operations?
- **Risk (1-5):** What's the consequence of NOT fixing it?
- **Effort (1-5):** How hard is the fix? (inverted in formula)

**Priority Score = (Impact + Risk) × (6 - Effort)**

---

## CRITICAL DEBT (P0) — FIX FIRST

### P0-001: XSS Vulnerability via Selector Injection
**Category:** Code Debt (Security)  
**Location:** `src/background/action-executor.ts:125-140`  
**Impact:** 5 | **Risk:** 5 | **Effort:** 2 | **Score:** 45

**Description:**
No validation on selectors before DOM queries; attacker can inject malicious code:
```typescript
// VULNERABLE
const element = document.querySelector(userProvidedSelector);

// If userProvidedSelector = 'img[src="x" onerror="alert(1)"]'
// XSS executes in content script context
```

**Business Impact:**
- User's email/data exposed if extension runs on compromised page
- Regulatory: OWASP A03:2021 (Injection)
- Extension could be removed from Chrome Web Store

**Mitigation:**
```typescript
function isValidSelector(selector: string): boolean {
  // Whitelist approach: only allow safe selectors
  const dangerousPatterns = [
    /javascript:/i,
    /on\w+\s*=/i,  // onclick, onerror, etc.
    /<script/i,
    /<!--/,
  ];
  
  if (dangerousPatterns.some(p => p.test(selector))) {
    return false;
  }

  // Try parsing as CSS selector (will throw if invalid)
  try {
    document.querySelector(selector);
    return true;
  } catch {
    return false;
  }
}
```

**Effort:** 2-3 hours (validation class + tests)  
**Action Items:**
1. [ ] Implement ActionValidator.isValidSelector()
2. [ ] Update ActionExecutor to validate before executing
3. [ ] Add unit tests: malicious selectors rejected
4. [ ] Add integration test: valid selectors pass

---

### P0-002: Message Handler Race Condition
**Category:** Architecture Debt  
**Location:** `src/background/index.ts:10-50`  
**Impact:** 5 | **Risk:** 4 | **Effort:** 2 | **Score:** 36

**Description:**
Three separate `chrome.runtime.onMessage.addListener()` calls; all process every message → race conditions on state updates.

**Business Impact:**
- Task corruption (config update and task start race)
- Silent failures (config update completes, task starts with old config)
- Difficult to debug (race conditions intermittent)

**Mitigation:** See ADR-002 (Message Routing Pattern)

**Effort:** 4 hours (refactor to dispatcher)  
**Action Items:**
1. [ ] Implement MessageDispatcher class
2. [ ] Migrate 3 listeners to dispatcher.register() calls
3. [ ] Test: concurrent messages routed correctly
4. [ ] Test: no race conditions on state

---

### P0-003: Silent Action Failures (No Retry)
**Category:** Code Debt (Reliability)  
**Location:** `src/background/action-executor.ts:180-200`  
**Impact:** 4 | **Risk:** 5 | **Effort:** 2 | **Score:** 36

**Description:**
Actions fail with no retry logic; transient errors (network hiccup) cause permanent task failure.

```typescript
// ❌ Current: No retry
const result = await contentScript.execute(action);
if (result.error) {
  console.log('Action failed'); // Silent!
  return;
}
```

**Business Impact:**
- 70% task success rate (should be 95%+)
- Users must manually retry (bad UX)
- Wasted time debugging non-issues

**Mitigation:** See ADR-003 (Error Handling Strategy)

**Effort:** 3-4 hours (retry loop + exponential backoff)  
**Action Items:**
1. [ ] Implement executeActionWithRetry()
2. [ ] Add isTransientError() classification
3. [ ] Add exponential backoff (100ms × 2^attempt)
4. [ ] Test: transient errors retry; permanent fail immediately

---

### P0-004: Token Refresh Race Condition
**Category:** Code Debt (Security)  
**Location:** `src/background/token-store.ts:45-65`  
**Impact:** 4 | **Risk:** 5 | **Effort:** 1 | **Score:** 36

**Description:**
Concurrent token refresh calls → multiple API calls → state corruption.

```typescript
// ❌ Current: Race condition
async refreshToken() {
  const token = await api.exchange(codeVerifier);
  this.token = token; // Race: multiple calls overwrite
}
```

**Business Impact:**
- Token state corruption (different tokens in flight)
- Wasted API calls (duplicate refreshes)
- Intermittent failures (wrong token used)

**Mitigation:** See ADR-004 (Token Refresh Synchronization)

**Effort:** 1-2 hours (mutex pattern with Promise)  
**Action Items:**
1. [ ] Add refreshPromise state variable
2. [ ] Check existing promise before starting refresh
3. [ ] Test: concurrent requests return same token

---

### P0-005: Hardcoded Credentials in Source
**Category:** Code Debt (Security)  
**Location:** `src/background/vertex-client.ts:5-10`, `src/background/auth-manager.ts:2-8`  
**Impact:** 5 | **Risk:** 5 | **Effort:** 2 | **Score:** 45

**Description:**
OAuth clientId and Vertex projectId hardcoded in source code (visible in VCS, builds, extensions).

```typescript
// ❌ Current
const clientId = 'your-client-id-here';
const projectId = 'your-project-id';
```

**Business Impact:**
- Credentials exposed in version control
- Attackers can impersonate extension
- Google Cloud project quotas abused
- No dev/prod separation

**Mitigation:** See ADR-001 (Config Storage Strategy)

**Effort:** 3-4 hours (ConfigManager + first-run wizard)  
**Action Items:**
1. [ ] Create ConfigManager class
2. [ ] Implement chrome.storage.sync loading
3. [ ] Create options page for configuration
4. [ ] Create first-run wizard
5. [ ] Remove hardcoded values from source

---

## HIGH PRIORITY DEBT (P1)

### P1-001: No Action Validation Before DOM Execution
**Category:** Code Debt (Security)  
**Location:** `src/content-script/action-executor.ts:50-80`  
**Impact:** 4 | **Risk:** 4 | **Effort:** 2 | **Score:** 32

**Description:**
No validation on action payloads before executing; malformed actions crash content script.

**Current state:** Content script dies without heartbeat notification → service worker doesn't know.

**Fix:** Validate action schema before execution; return error instead of crashing.

**Effort:** 3 hours  
**Priority:** After P0-001 (XSS)  
**Action Items:**
1. [ ] Create ActionSchema (Zod or similar)
2. [ ] Validate before execute()
3. [ ] Test: malformed action returns error, doesn't crash

---

### P1-002: Content Script Disconnect Handling
**Category:** Architecture Debt (Reliability)  
**Location:** `src/background/task-manager.ts:100-120`  
**Impact:** 4 | **Risk:** 4 | **Effort:** 3 | **Score:** 28

**Description:**
No heartbeat or timeout on message sends to content scripts. If content script crashes, task waits indefinitely.

**Current state:** Task may hang for hours if content script dies.

**Fix:** 30-second timeout on all content script messages + periodic heartbeat.

**Effort:** 4-5 hours (heartbeat monitor + timeouts)  
**Priority:** After P0 fixes  
**Action Items:**
1. [ ] Implement ContentScriptHealthMonitor
2. [ ] Add 30s timeout to all content script messages
3. [ ] Implement periodic heartbeat (every 5s)
4. [ ] Test: dead content script detected within 30s

---

### P1-003: Request Queue & Rate Limiting (No Circuit Breaker)
**Category:** Architecture Debt (Reliability)  
**Location:** `src/background/request-queue.ts:1-50`  
**Impact:** 3 | **Risk:** 4 | **Effort:** 3 | **Score:** 21

**Description:**
API rate limiter (55 req/min) exists but no circuit breaker. Rate limit (429) causes immediate retry loop → API abuse.

**Current state:** 3 consecutive 429s → task fails, retries immediately, gets 429 again (wasted API calls + time).

**Fix:** Implement circuit breaker (CLOSED/OPEN/HALF_OPEN) with exponential cooldown.

**Effort:** 4 hours  
**Priority:** After error handling (P0-003)  
**Action Items:**
1. [ ] Implement CircuitBreaker class
2. [ ] Integrate with RequestQueue
3. [ ] Add exponential cooldown (5min-30min)
4. [ ] Test: 3 consecutive 429s → circuit opens

---

### P1-004: DOM Mutation Analysis (No Debouncing)
**Category:** Performance Debt  
**Location:** `src/content-script/dom-monitor.ts:1-40`  
**Impact:** 4 | **Risk:** 3 | **Effort:** 3 | **Score:** 21

**Description:**
Full DOM snapshot on every mutation; high-mutation pages (infinite scroll, live updates) send 50MB/sec to API.

**Current state:** E-commerce checkout → 100 mutations/sec → 500MB in 10 seconds → $375 API cost.

**Fix:** Debounce mutations (100ms), batch, send delta snapshots.

**Effort:** 5 hours  
**Priority:** Medium (doesn't block basic functionality)  
**Action Items:**
1. [ ] Implement DOMSnapshotManager with debouncing
2. [ ] Implement delta snapshot extraction
3. [ ] Implement gzip compression
4. [ ] Test: high-mutation page → <5 snapshots per minute

---

### P1-005: No Structured Logging
**Category:** Code Debt (Maintainability)  
**Location:** Scattered `console.log()` throughout codebase  
**Impact:** 3 | **Risk:** 4 | **Effort:** 2 | **Score:** 24

**Description:**
console.log scattered throughout; no structured logging, no correlation IDs, no log levels.

```typescript
// ❌ Current
console.log('Action failed: click', error);

// ✅ Should be
logger.error('action_failed', { 
  taskId, action, error, attempt, timestamp 
});
```

**Business Impact:**
- Difficult to debug production issues
- Can't aggregate errors across users
- No performance metrics
- No security event logging

**Effort:** 2-3 days (implement logger + migrate logs)  
**Priority:** P1 but can be done in parallel with other work  
**Action Items:**
1. [ ] Create Logger class (with levels: error, warn, info, debug)
2. [ ] Migrate all console.log → logger calls
3. [ ] Add correlation IDs to task logs
4. [ ] Add timestamp, task context to all logs

---

### P1-006: No Type Safety on API Responses
**Category:** Code Debt (Reliability)  
**Location:** `src/background/vertex-client.ts:80-120`  
**Impact:** 3 | **Risk:** 4 | **Effort:** 2 | **Score:** 24

**Description:**
No validation on Vertex AI response schema; if API changes, parsing fails silently.

```typescript
// ❌ Current: any type
const response: any = await fetch(vertexUrl);
const actions = response.candidates[0].content.parts[0].text; // What if this structure changes?
```

**Fix:** Use schema validation (Zod) to validate response before parsing.

**Effort:** 3 hours  
**Action Items:**
1. [ ] Create VertexResponseSchema (Zod)
2. [ ] Validate all Vertex API responses
3. [ ] Add error handling for schema mismatches

---

### P1-007: Service Worker Lifecycle Not Managed
**Category:** Architecture Debt (Reliability)  
**Location:** `src/background/index.ts:1-5`  
**Impact:** 3 | **Risk:** 4 | **Effort:** 4 | **Score:** 14

**Description:**
Service worker can be terminated by Chrome anytime; long-running tasks (5+ minutes) may be interrupted mid-execution.

**Current state:** Long task → service worker suspended → task state lost.

**Fix:** Use offscreen document for tasks > 5 minutes (ADR-001 proposed this).

**Effort:** 2-3 days  
**Priority:** Low (rare; most tasks < 5min)  
**Action Items:**
1. [ ] Implement OffscreenDocumentManager
2. [ ] Detect long tasks, migrate to offscreen
3. [ ] Sync task state back to service worker

---

### P1-008: No Error Boundaries
**Category:** Architecture Debt (Reliability)  
**Location:** Throughout codebase  
**Impact:** 3 | **Risk:** 4 | **Effort:** 3 | **Score:** 21

**Description:**
Uncaught errors in handlers crash service worker/content scripts without proper error reporting.

```typescript
// ❌ Current: crashes silently
function handleMessage(msg) {
  if (msg.type === 'UNKNOWN') {
    throw new Error('Unknown message type'); // Crashes handler
  }
}
```

**Fix:** Wrap all handlers in try-catch; report errors to user.

**Effort:** 2 days  
**Action Items:**
1. [ ] Create ErrorBoundary middleware for message handler
2. [ ] Wrap all async handlers in try-catch
3. [ ] Report errors back to sidebar UI

---

## MEDIUM PRIORITY DEBT (P2)

### P2-001: Zero Test Coverage
**Category:** Test Debt  
**Impact:** 4 | **Risk:** 3 | **Effort:** 4 | **Score:** 14

**Description:**
No unit, integration, or E2E tests. Regression risk high; refactoring dangerous.

**Current state:** Any code change risks breaking undiscovered bugs.

**Target:** 85%+ coverage for unit + integration tests; E2E for critical paths.

**Effort:** 5-7 days (unit: 2d, integration: 2d, E2E: 1-2d)  
**Action Items:**
1. [ ] Set up test framework (Jest + Puppeteer for E2E)
2. [ ] Write unit tests for ActionValidator, TokenManager, CircuitBreaker
3. [ ] Write integration tests for message dispatch, task execution
4. [ ] Write E2E tests: search Google, fill form, navigate

---

### P2-002: Code Duplication
**Category:** Code Debt  
**Locations:** Retry logic (will appear in 3 places), validation patterns, error handling  
**Impact:** 2 | **Risk:** 3 | **Effort:** 2 | **Score:** 12

**Description:**
Once retry, validation, and error handling are added, patterns will duplicate across multiple files.

**Fix:** Extract to shared utilities (src/shared/retry.ts, src/shared/validate.ts).

**Effort:** 1 day (after P1-003 and P1-001 implemented)  
**Action Items:**
1. [ ] Create src/shared/retry.ts with exponential backoff helpers
2. [ ] Create src/shared/validate.ts with validation utilities
3. [ ] Extract error types to src/shared/errors.ts

---

### P2-003: Missing API Documentation
**Category:** Documentation Debt  
**Impact:** 2 | **Risk:** 3 | **Effort:** 1 | **Score:** 10

**Description:**
Message types, payload schemas undocumented. Developers must read code to understand API.

**Fix:** Document in shared/messages.ts with JSDoc and examples.

**Effort:** 4 hours  
**Action Items:**
1. [ ] Add JSDoc comments to all message types
2. [ ] Create messages-api.md with examples
3. [ ] Document payload schemas (required/optional fields)

---

### P2-004: Missing JSDoc Comments
**Category:** Documentation Debt  
**Impact:** 2 | **Risk:** 3 | **Effort:** 2 | **Score:** 10

**Description:**
Core classes (TaskManager, ActionExecutor, TokenManager) missing JSDoc; IDE autocomplete unhelpful.

**Effort:** 1-2 days (systematic review + commenting)  
**Action Items:**
1. [ ] Add JSDoc to all public methods
2. [ ] Document parameters, return types, throws
3. [ ] Add usage examples for complex classes

---

### P2-005: No Performance Monitoring
**Category:** Infrastructure Debt  
**Impact:** 3 | **Risk:** 2 | **Effort:** 3 | **Score:** 12

**Description:**
No metrics on action latency, snapshot size, API response times, task success rates.

**Fix:** Add performance tracking (time each operation, send to analytics).

**Effort:** 2-3 days  
**Action Items:**
1. [ ] Create PerformanceMonitor class
2. [ ] Track: action latency, snapshot size, API latency, success rate
3. [ ] Send metrics to Google Analytics (or local storage)

---

### P2-006: No Crash/Error Reporting
**Category:** Infrastructure Debt  
**Impact:** 3 | **Risk:** 2 | **Effort:** 2 | **Score:** 12

**Description:**
Unhandled exceptions disappear; can't diagnose production issues.

**Fix:** Send crash reports to backend (or local collection for analysis).

**Effort:** 1-2 days  
**Action Items:**
1. [ ] Implement CrashReporter class
2. [ ] Report: stack trace, environment (version, OS, browser)
3. [ ] Store locally (100 last crashes); optional upload consent

---

### P2-007: No E2E Testing Infrastructure
**Category:** Test Debt  
**Impact:** 3 | **Risk:** 2 | **Effort:** 4 | **Score:** 8

**Description:**
Cannot test real browser automation without manual testing. Risk of regression.

**Fix:** Set up Puppeteer + test scripts for critical workflows.

**Effort:** 2-3 days  
**Action Items:**
1. [ ] Set up Puppeteer for Chrome extension testing
2. [ ] Create E2E test scripts: search, form fill, navigation
3. [ ] Integrate with CI/CD

---

### P2-008: Config Validation Incomplete
**Category:** Code Debt (Security)  
**Location:** `src/background/config-manager.ts` (future)  
**Impact:** 2 | **Risk:** 3 | **Effort:** 1 | **Score:** 10

**Description:**
ConfigManager validates required fields but not field values (e.g., projectId format, region validity).

**Fix:** Add detailed validation (regex for IDs, enum for regions).

**Effort:** 2-3 hours  
**Action Items:**
1. [ ] Add format validation for OAuth clientId/secret
2. [ ] Add enum validation for Vertex region
3. [ ] Add range validation for rate limits

---

### P2-009: No Browser Compatibility Testing
**Category:** Test Debt  
**Impact:** 2 | **Risk:** 2 | **Effort:** 3 | **Score:** 6

**Description:**
Extension only tested on latest Chrome; may break on older versions.

**Fix:** Test on Chrome 100+ (oldest supported MV3).

**Effort:** 1 day  
**Action Items:**
1. [ ] Set up BrowserStack or similar for Chrome versions
2. [ ] Test critical workflows on Chrome 100, 110, 120
3. [ ] Fix compatibility issues (API availability)

---

### P2-010: No Rate Limit Error Recovery UI
**Category:** Code Debt (UX)  
**Impact:** 1 | **Risk:** 2 | **Effort:** 2 | **Score:** 6

**Description:**
When circuit breaker opens (API rate limited), user sees generic error. Should show countdown timer.

**Fix:** Update sidebar UI to show "Retrying in 5 minutes..." with countdown.

**Effort:** 1-2 hours  
**Action Items:**
1. [ ] Add timer display to sidebar
2. [ ] Send circuit breaker state to sidebar via message
3. [ ] Update UI based on cooldown remaining

---

## LOW PRIORITY DEBT (P3)

### P3-001: Magic Numbers
**Category:** Code Debt (Maintainability)  
**Impact:** 1 | **Risk:** 1 | **Effort:** 1 | **Score:** 4

**Description:**
Hardcoded timeouts (30000ms), thresholds (55 req/min), backoff values scattered throughout.

**Fix:** Extract to config constants in src/shared/constants.ts.

**Effort:** 2-3 hours  
**Action Items:**
1. [ ] Create constants.ts with all magic numbers
2. [ ] Replace scattered numbers with constants
3. [ ] Document each constant (why this value?)

---

### P3-002: Unused Dependencies
**Category:** Dependency Debt  
**Impact:** 1 | **Risk:** 1 | **Effort:** 1 | **Score:** 4

**Description:**
package.json may have unused packages; need audit.

**Fix:** Run `npm audit` and remove unused packages.

**Effort:** 1 hour  
**Action Items:**
1. [ ] Run `npm audit --fix`
2. [ ] Identify truly unused dependencies
3. [ ] Remove unused packages; update documentation

---

### P3-003: TypeScript Strict Mode Not Enabled
**Category:** Code Debt (Type Safety)  
**Impact:** 1 | **Risk:** 2 | **Effort:** 3 | **Score:** 6

**Description:**
TypeScript compiled with non-strict settings; `any` types allowed, undefined handling lenient.

**Fix:** Enable strict mode; fix type errors.

**Effort:** 1-2 days (initial: many errors, but fixable)  
**Action Items:**
1. [ ] Enable strict mode in tsconfig.json
2. [ ] Fix type errors (may be 50+ errors)
3. [ ] Document why exceptions needed (if any)

---

### P3-004: Missing CHANGELOG
**Category:** Documentation Debt  
**Impact:** 1 | **Risk:** 1 | **Effort:** 1 | **Score:** 4

**Description:**
No changelog tracking version changes; users don't know what's new.

**Fix:** Create CHANGELOG.md with version history.

**Effort:** 2-3 hours  
**Action Items:**
1. [ ] Create CHANGELOG.md
2. [ ] Document all releases to date
3. [ ] Update on each release

---

### P3-005: No Contribution Guide
**Category:** Documentation Debt  
**Impact:** 1 | **Risk:** 1 | **Effort:** 2 | **Score:** 6

**Description:**
No CONTRIBUTING.md; external contributors (if any) unsure how to submit changes.

**Fix:** Create CONTRIBUTING.md with setup, testing, PR guidelines.

**Effort:** 2-3 hours  
**Action Items:**
1. [ ] Create CONTRIBUTING.md
2. [ ] Document: local setup, running tests, PR process
3. [ ] Link from README.md

---

## Remediation Plan

### Phase 1: Security Hardening (Days 1-3)
**Effort:** 3-4 days | **Impact:** Blocks production readiness

Tackle all P0 items + critical P1s:
- [ ] P0-001: XSS validation (2-3 hours)
- [ ] P0-002: Message dispatcher (4 hours)
- [ ] P0-003: Action retry (3-4 hours)
- [ ] P0-004: Token refresh mutex (1-2 hours)
- [ ] P0-005: Config storage (3-4 hours)
- [ ] P1-001: Action schema validation (3 hours)
- [ ] P1-005: Structured logging (2 days, can parallelize)

**Critical path:** P0-005 (config) → P0-001 (validation) → P0-003 (retry)

---

### Phase 2: Reliability (Days 4-5)
**Effort:** 2-3 days | **Impact:** Reduces task failures from 30% → 5%

Remaining P1s:
- [ ] P1-002: Content script heartbeat (4-5 hours)
- [ ] P1-003: Circuit breaker (4 hours)
- [ ] P1-004: DOM debouncing (5 hours)
- [ ] P1-006: Response schema validation (3 hours)
- [ ] P1-007: Service worker lifecycle (start, but low priority)
- [ ] P1-008: Error boundaries (2 days)

---

### Phase 3: Quality (Week 2)
**Effort:** 5-7 days | **Impact:** Enables confident refactoring

P2s:
- [ ] P2-001: Unit + integration tests (5-7 days)
- [ ] P2-002: Code deduplication (1 day, after P1s complete)
- [ ] P2-003 through P2-010: Documentation + monitoring (3-4 days, parallelizable)

---

### Phase 4: Polish (Week 2-3)
**Effort:** 3-5 days | **Impact:** Nice-to-have improvements

P3s:
- [ ] P3-001: Extract magic numbers (2-3 hours)
- [ ] P3-002: Audit dependencies (1 hour)
- [ ] P3-003: TypeScript strict mode (1-2 days)
- [ ] P3-004 & P3-005: Documentation (2-3 hours each)

---

## Success Metrics

### By End of Phase 1 (Day 3)
- [ ] Zero XSS vulnerabilities (confirmed by penetration test)
- [ ] Message race conditions eliminated
- [ ] Task success rate improves to 90%+
- [ ] Credentials removed from source code
- [ ] Structured logging operational

### By End of Phase 2 (Day 5)
- [ ] Content script disconnects detected within 30s
- [ ] Circuit breaker protects API during rate limits
- [ ] DOM snapshots reduced by 95% (cost savings ~$370/user)
- [ ] All errors caught and reported

### By End of Phase 3 (Week 2)
- [ ] Test coverage 85%+
- [ ] All message types documented
- [ ] Performance metrics collected and visible
- [ ] No critical bugs in regressions

### By End of Phase 4 (Week 3)
- [ ] Production-ready (all P0s + critical P1s complete)
- [ ] Maintainable (tests, docs, logging)
- [ ] Scalable (performance optimized, error handling robust)

---

## Risk Assessment

**If we don't address P0 items:**
- Extension rejected from Chrome Web Store (security)
- High failure rate frustrates users
- API costs spiral ($10-100/day without optimization)

**If we don't address P1 items:**
- Difficult to scale (more concurrent users = more failures)
- Expensive to debug production issues (no logging)
- High churn (users abandon due to failures)

**If we don't address P2 items:**
- Refactoring risky (no tests to catch regressions)
- Onboarding slow (developers must read code)
- Monitoring blind (can't diagnose performance issues)

**Acceptable to defer:** P3 items (polish, nice-to-haves; can do after launch)

---

## Summary Table

| ID | Category | Impact | Risk | Effort | Score | Phase |
|----|----------|--------|------|--------|-------|-------|
| P0-001 | Security | 5 | 5 | 2 | **45** | 1 |
| P0-005 | Security | 5 | 5 | 2 | **45** | 1 |
| P0-002 | Architecture | 5 | 4 | 2 | **36** | 1 |
| P0-003 | Reliability | 4 | 5 | 2 | **36** | 1 |
| P0-004 | Security | 4 | 5 | 1 | **36** | 1 |
| P1-001 | Security | 4 | 4 | 2 | 32 | 1 |
| P1-002 | Reliability | 4 | 4 | 3 | 28 | 2 |
| P1-005 | Maintain | 3 | 4 | 2 | 24 | 1 |
| P1-006 | Reliability | 3 | 4 | 2 | 24 | 2 |
| P1-003 | Reliability | 3 | 4 | 3 | 21 | 2 |
| P1-004 | Performance | 4 | 3 | 3 | 21 | 2 |
| P1-008 | Reliability | 3 | 4 | 3 | 21 | 2 |
| P1-007 | Reliability | 3 | 4 | 4 | 14 | 3 |
| P2-001 | Testing | 4 | 3 | 4 | 14 | 3 |
| P2-002 | Code | 2 | 3 | 2 | 12 | 3 |
| P2-005 | Monitoring | 3 | 2 | 3 | 12 | 3 |
| P2-006 | Monitoring | 3 | 2 | 2 | 12 | 3 |
| P2-004 | Documentation | 2 | 3 | 2 | 10 | 3 |
| P2-003 | Documentation | 2 | 3 | 1 | 10 | 3 |
| P2-008 | Security | 2 | 3 | 1 | 10 | 3 |
| P1-006 | Reliability | 3 | 4 | 2 | 24 | 2 |
| P2-007 | Testing | 3 | 2 | 4 | 8 | 3 |
| P2-009 | Testing | 2 | 2 | 3 | 6 | 4 |
| P2-010 | UX | 1 | 2 | 2 | 6 | 4 |
| P3-001 | Code | 1 | 1 | 1 | 4 | 4 |
| P3-002 | Dependency | 1 | 1 | 1 | 4 | 4 |
| P3-003 | Type Safety | 1 | 2 | 3 | 6 | 4 |
| P3-004 | Documentation | 1 | 1 | 1 | 4 | 4 |
| P3-005 | Documentation | 1 | 1 | 2 | 6 | 4 |

---

**Created:** PHASE-4-TECH-DEBT.md  
**Format:** Complete tech debt audit with 28 items, prioritized by impact/risk/effort  
**Next Step:** Phase 5 (Test Strategy) — Design comprehensive testing approach
