# Phase 6: Code Review Quality Gates & Standards
**Cometeor Extension: Pre-Merge Review Framework**  
**Date:** May 2026 | **Status:** Standards | **Audience:** Engineering Team

---

## Executive Summary

**Purpose:** Define mandatory code review gates to prevent regressions, security issues, and maintain code quality.

**Three-Tier Review Process:**
1. **Automated** (linting, type checking, test coverage)
2. **Manual** (security, performance, architecture)
3. **Approval** (owner sign-off + LGTM from reviewer)

**Quality Gates:**
- ✅ TypeScript strict mode passes
- ✅ All tests pass (unit + integration + E2E)
- ✅ Test coverage >85%
- ✅ No security vulnerabilities
- ✅ No performance regressions
- ✅ Code review approved
- ✅ Changelog updated

---

## TIER 1: AUTOMATED GATES (CI/CD)

### Gate 1.1: TypeScript Strict Mode

**Rule:** All code must compile with TypeScript strict mode enabled.

**Configuration:**
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true
  }
}
```

**Gate Check:**
```bash
npx tsc --noEmit
# Must exit with code 0
```

**What fails:**
```typescript
// ❌ Fails: any type
function process(data: any) { }

// ❌ Fails: implicit any
function handle(x) { return x + 1; }

// ❌ Fails: potential null dereference
function getName(user: { name?: string }) {
  return user.name.toUpperCase(); // name could be undefined
}

// ✅ Passes: explicit types, null checks
function getName(user: { name?: string }): string {
  if (!user.name) throw new Error('Name required');
  return user.name.toUpperCase();
}
```

**Impact:** Catches type errors at compile time (prevents 30% of bugs).

---

### Gate 1.2: ESLint & Prettier Formatting

**Rule:** All code must pass linting and match project formatting.

**Configuration:**
```json
{
  "extends": ["eslint:recommended", "prettier"],
  "rules": {
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "no-debugger": "error",
    "no-unused-vars": "off", // Let TypeScript handle it
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/explicit-function-return-types": "warn",
    "@typescript-eslint/no-explicit-any": "error"
  }
}
```

**Gate Check:**
```bash
npx eslint src/ --max-warnings 0
npx prettier --check src/
# Both must exit with code 0
```

**Failures trigger automatic fix:**
```bash
npx eslint src/ --fix
npx prettier --write src/
# Then PR must be updated
```

---

### Gate 1.3: Unit & Integration Test Pass Rate

**Rule:** All tests must pass; no flaky tests allowed.

**Gate Check:**
```bash
npm test -- tests/unit/ tests/integration/ --verbose
# Must pass 100% of tests, 3x in a row (no flakiness)
```

**What fails:**
```typescript
// ❌ Fails: flaky timing
it('event fires', async () => {
  fireEvent();
  await new Promise(r => setTimeout(r, 100)); // Too short
  expect(eventFired).toBe(true);
});

// ✅ Passes: waits for completion
it('event fires', async () => {
  const promise = waitForEvent();
  fireEvent();
  await expect(promise).resolves.toBe(true);
});
```

---

### Gate 1.4: Code Coverage Threshold

**Rule:** New code must maintain 85%+ coverage; no decrease.

**Gate Check:**
```bash
npm test -- --coverage --coverageThreshold='{
  "global": {
    "branches": 85,
    "functions": 85,
    "lines": 85,
    "statements": 85
  }
}'
```

**Reporting:**
```
File            | Statements | Branches | Functions | Lines
──────────────────────────────────────────────────────────
All files       |    87.2%   |  85.1%   |   88.0%   | 87.5%
 ActionValidator|   100%     |  100%    |   100%    | 100%
 TokenManager   |    92%     |   90%    |    95%    | 92%
```

**What happens if coverage drops:**
```
ERROR: Coverage thresholds not met:
  Statements: 84.5% < 85% (FAIL)
  Functions: 82% < 85% (FAIL)
```

---

### Gate 1.5: Security Scan (npm audit)

**Rule:** No unpatched security vulnerabilities in dependencies.

**Gate Check:**
```bash
npm audit --audit-level=moderate
# Must have 0 vulnerabilities at "moderate" level or higher
```

**What fails:**
```
found 2 vulnerabilities (1 moderate, 1 high)
  - lodash@4.17.20: Prototype Pollution
  - axios@0.19.2: SSRF
```

**Resolution:** Update vulnerable packages or document waiver.

---

## TIER 2: MANUAL CODE REVIEW GATES

### Gate 2.1: Security Review

**Checklist:**

- [ ] **No hardcoded secrets**
  ```typescript
  // ❌ FAIL: Hardcoded credentials
  const clientId = 'abc123xyz789';
  const apiKey = 'secret-key-here';
  
  // ✅ PASS: Loaded from config
  const clientId = await configManager.get('oauth.clientId');
  ```

- [ ] **All user input validated**
  ```typescript
  // ❌ FAIL: No validation before DOM query
  const element = document.querySelector(userProvidedSelector);
  
  // ✅ PASS: Validate before use
  if (!isValidSelector(userProvidedSelector)) throw new Error('Invalid selector');
  ```

- [ ] **No XSS vulnerabilities**
  ```typescript
  // ❌ FAIL: innerHTML from untrusted source
  div.innerHTML = apiResponse.html; // Could be malicious
  
  // ✅ PASS: textContent for user data
  div.textContent = apiResponse.text; // Safe, no HTML parsing
  ```

- [ ] **Secure error handling**
  ```typescript
  // ❌ FAIL: Leaks sensitive info
  catch (error) {
    console.log('Failed:', error.stack, 'Token:', token);
  }
  
  // ✅ PASS: Sanitized error messages
  catch (error) {
    logger.error('operation_failed', {
      errorType: error.name,
      // Never log token, password, PII
    });
  }
  ```

- [ ] **No CSRF vulnerabilities**
  - All state-changing requests include CSRF token
  - No blind redirects to user-provided URLs

- [ ] **Authentication properly validated**
  ```typescript
  // ❌ FAIL: No token check
  async function executeAction(action) {
    await vertexClient.analyzeDOM(action);
  }
  
  // ✅ PASS: Verify auth before use
  async function executeAction(action) {
    const token = await tokenManager.getAccessToken();
    if (!token) throw new Error('Not authenticated');
    return await vertexClient.analyzeDOM(action);
  }
  ```

**Review template:**
```markdown
## Security Review

- [ ] No hardcoded credentials ✓
- [ ] User input validated ✓
- [ ] No XSS opportunities ✓
- [ ] Error messages sanitized ✓
- [ ] CSRF protection present ✓
- [ ] Auth checked before sensitive ops ✓

**Verdict:** ✅ APPROVED
```

---

### Gate 2.2: Performance Review

**Checklist:**

- [ ] **No N+1 query patterns**
  ```typescript
  // ❌ FAIL: N+1 (loop with API call inside)
  for (const task of tasks) {
    const details = await api.getTaskDetails(task.id); // Called N times
  }
  
  // ✅ PASS: Batch operation
  const allDetails = await api.getTaskDetailsInBatch(tasks.map(t => t.id));
  ```

- [ ] **No unbounded loops or queries**
  ```typescript
  // ❌ FAIL: No limit
  const allRecords = await db.query('SELECT * FROM tasks');
  
  // ✅ PASS: Paginated
  const page1 = await db.query('SELECT * FROM tasks LIMIT 100 OFFSET 0');
  ```

- [ ] **No memory leaks**
  ```typescript
  // ❌ FAIL: Event listener never removed
  element.addEventListener('click', handler);
  // element removed but listener still in memory
  
  // ✅ PASS: Cleanup on unmount
  element.addEventListener('click', handler);
  element.addEventListener('dispose', () => {
    element.removeEventListener('click', handler);
  });
  ```

- [ ] **Algorithmic complexity acceptable**
  ```typescript
  // ❌ FAIL: O(n²) on 50K DOM nodes
  function findElements(selectors) {
    const results = [];
    for (const selector of selectors) { // O(n)
      for (const element of document.querySelectorAll('*')) { // O(n)
        // ...
      }
    }
    return results;
  }
  
  // ✅ PASS: O(n) or O(n log n)
  function findElements(selectors) {
    const selector = selectors.join(',');
    return document.querySelectorAll(selector); // Single O(n) query
  }
  ```

- [ ] **No excessive object creation**
  ```typescript
  // ❌ FAIL: Creates 1000 objects in loop
  const array = [];
  for (let i = 0; i < 1000; i++) {
    array.push(new Action({ type: 'click' })); // Allocation overhead
  }
  
  // ✅ PASS: Reuse objects or use plain objects
  const array = Array.from({ length: 1000 }, (_, i) => ({
    type: 'click', index: i
  }));
  ```

**Performance metrics baseline:**
```
Baseline (before changes):
- Action execution: 200ms p99
- Token refresh: 500ms p99
- Snapshot generation: 100ms for 50K DOM

After changes must not exceed baseline by >10%
```

**Review template:**
```markdown
## Performance Review

Latency impact:
- Action execution: 195ms p99 (-2.5%) ✓
- Token refresh: 510ms p99 (+2%) ✓
- Snapshot: 102ms p99 (+2%) ✓

- [ ] No N+1 patterns ✓
- [ ] No unbounded queries ✓
- [ ] No memory leaks ✓
- [ ] Complexity acceptable ✓
- [ ] Metrics within baseline ✓

**Verdict:** ✅ APPROVED
```

---

### Gate 2.3: Correctness Review

**Checklist:**

- [ ] **All error paths handled**
  ```typescript
  // ❌ FAIL: Silent failure
  async function executeAction(action) {
    const result = await contentScript.execute(action);
    if (result.error) {
      console.log('Failed'); // Error ignored!
      return; // No error thrown
    }
  }
  
  // ✅ PASS: Explicit error handling
  async function executeAction(action) {
    const result = await contentScript.execute(action);
    if (result.error) {
      throw new ActionError(result.error, { action, attempt });
    }
    return result;
  }
  ```

- [ ] **No race conditions**
  ```typescript
  // ❌ FAIL: Race between check and use
  if (this.token) { // Token valid?
    // ... async operation ...
    // token might expire here!
    const result = await api.request(this.token);
  }
  
  // ✅ PASS: Atomic token handling
  const token = await this.getAccessToken(); // Refresh if needed
  const result = await api.request(token);
  ```

- [ ] **Null/undefined handled**
  ```typescript
  // ❌ FAIL: Potential null dereference
  function getFirstResult(results) {
    return results[0].id; // What if results is empty?
  }
  
  // ✅ PASS: Null checks
  function getFirstResult(results) {
    if (!results || results.length === 0) return null;
    return results[0].id;
  }
  ```

- [ ] **Edge cases considered**
  ```typescript
  // ❌ FAIL: Off-by-one error
  for (let i = 0; i <= array.length; i++) { // i = length is out of bounds
    process(array[i]);
  }
  
  // ✅ PASS: Correct bounds
  for (let i = 0; i < array.length; i++) {
    process(array[i]);
  }
  ```

- [ ] **Tests cover happy path + error paths**
  ```typescript
  // ❌ FAIL: Only tests success
  it('executes action', async () => {
    const result = await executeAction({ type: 'click' });
    expect(result.success).toBe(true);
  });
  
  // ✅ PASS: Tests both paths
  it('executes action successfully', async () => { ... });
  it('fails gracefully on error', async () => { ... });
  it('retries on transient error', async () => { ... });
  ```

**Review template:**
```markdown
## Correctness Review

- [ ] All error paths handled ✓
- [ ] No race conditions ✓
- [ ] Null/undefined handled ✓
- [ ] Edge cases tested ✓
- [ ] Tests cover happy + error paths ✓

**Verdict:** ✅ APPROVED
```

---

### Gate 2.4: Maintainability Review

**Checklist:**

- [ ] **Clear, descriptive naming**
  ```typescript
  // ❌ FAIL: Cryptic names
  const d = new Date();
  const s = dom.querySelectorAll('[data-x]');
  function p(a, b) { return a > b; }
  
  // ✅ PASS: Clear intent
  const taskCreatedAt = new Date();
  const selectableElements = dom.querySelectorAll('[data-selectable]');
  function isGreaterThan(a, b) { return a > b; }
  ```

- [ ] **Single responsibility principle**
  ```typescript
  // ❌ FAIL: Does too much
  async function runTask(task) {
    // 1. Validates input
    // 2. Fetches config
    // 3. Creates plan
    // 4. Executes actions
    // 5. Logs results
    // 6. Sends analytics
  }
  
  // ✅ PASS: Focused responsibility
  async function runTask(task) {
    const validTask = validateTask(task);
    const plan = await planTask(validTask);
    const results = await executeTask(plan);
    await reportTaskCompletion(results);
  }
  ```

- [ ] **No code duplication**
  ```typescript
  // ❌ FAIL: Retry logic duplicated in 3 places
  // In actionExecutor.ts
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { ... } catch { await sleep(...); }
  }
  
  // In messageDispatcher.ts
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { ... } catch { await sleep(...); }
  }
  
  // ✅ PASS: Extracted to utility
  // In shared/retry.ts
  export async function withRetry<T>(fn, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try { return await fn(); }
      catch (e) { if (attempt === maxAttempts) throw e; }
    }
  }
  
  // Used everywhere
  await withRetry(() => actionExecutor.execute(action));
  ```

- [ ] **Comments explain WHY, not WHAT**
  ```typescript
  // ❌ FAIL: Comment states obvious
  // Increment i by 1
  i++;
  
  // ❌ FAIL: Over-commented
  // Loop through tokens
  for (const token of tokens) {
    // Check if token is valid
    if (token.isValid()) {
      // Add to results
      results.push(token);
    }
  }
  
  // ✅ PASS: Explains non-obvious logic
  // 5-minute buffer: refresh early to avoid mid-operation token expiry
  const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
  
  // Avoid cache stampede: multiple concurrent refreshes -> single API call
  if (this.refreshPromise) return this.refreshPromise;
  ```

- [ ] **TypeScript types document intent**
  ```typescript
  // ❌ FAIL: Types hide intent
  function process(data: any): any {
    return data.map((x: any) => x + 1);
  }
  
  // ✅ PASS: Types clarify
  function incrementValues(numbers: number[]): number[] {
    return numbers.map(n => n + 1);
  }
  ```

**Review template:**
```markdown
## Maintainability Review

- [ ] Naming clear and descriptive ✓
- [ ] Single responsibility ✓
- [ ] No duplication ✓
- [ ] Comments explain WHY ✓
- [ ] TypeScript types helpful ✓

**Verdict:** ✅ APPROVED
```

---

## TIER 3: APPROVAL GATES

### Gate 3.1: Code Review Approval

**Requirements:**
- [ ] At least 1 approved review from team member
- [ ] No "Request Changes" reviews remaining
- [ ] All conversations resolved
- [ ] Author has responded to feedback

**Template response to review:**
```markdown
@reviewer Thanks for the feedback!

- ✓ Fixed the N+1 query (now uses batch operation)
- ✓ Updated error handling to propagate failures
- ? For the "consider caching": depends on usage patterns; I'll add a TODO and create a ticket

Pushed 2 new commits. Ready for another look!
```

---

### Gate 3.2: Automated CI/CD Checks Pass

**Required Checks:**
```
✅ TypeScript compilation
✅ ESLint (0 warnings)
✅ Unit tests (100%)
✅ Integration tests (100%)
✅ E2E tests (on main branches)
✅ Coverage (85%+)
✅ npm audit (no moderate/high vulns)
✅ Code review approved
```

**All must pass before merge button enabled.**

---

### Gate 3.3: Changelog Updated

**Rule:** Every user-facing or noteworthy change gets a changelog entry.

**Format (CHANGELOG.md):**
```markdown
## [0.2.0] - 2026-05-15

### Added
- Exponential backoff retry for transient action failures
- Circuit breaker for API rate limiting

### Fixed
- XSS vulnerability in selector validation
- Token refresh race condition with concurrent requests
- Silent action failures (now properly reported)

### Changed
- Config moved to chrome.storage.sync (no longer hardcoded)
- Message routing consolidated to single dispatcher
```

**What requires changelog:**
- ✅ User-visible changes (features, fixes, breaking changes)
- ✅ Security updates
- ✅ Performance improvements
- ✅ Architectural changes
- ❌ Internal refactors (test coverage changes, linting)
- ❌ Documentation-only changes
- ❌ Dependency bumps (unless breaking)

**Check:**
```bash
# Verify CHANGELOG.md was updated
if git diff main HEAD -- CHANGELOG.md | grep -q "^+"; then
  echo "✅ Changelog updated"
else
  echo "❌ Changelog NOT updated - required for this PR type"
  exit 1
fi
```

---

## CODE REVIEW CHECKLIST (For Reviewers)

Use this for every PR review:

```markdown
## Review Checklist

### Automated Checks
- [ ] All CI/CD checks pass (green checkmarks)
- [ ] TypeScript: no `any` types or type errors
- [ ] ESLint: no warnings
- [ ] Tests: 100% passing, no flakes
- [ ] Coverage: 85%+ maintained

### Security
- [ ] No hardcoded credentials
- [ ] User input validated
- [ ] No XSS/injection vulnerabilities
- [ ] Error messages don't leak sensitive info
- [ ] Authentication properly checked

### Performance
- [ ] No N+1 patterns
- [ ] No unbounded queries/loops
- [ ] No memory leaks
- [ ] Algorithmic complexity acceptable
- [ ] Latency baseline not exceeded

### Correctness
- [ ] All error paths handled
- [ ] No race conditions
- [ ] Null/undefined handled
- [ ] Edge cases tested
- [ ] Happy path + error path tests present

### Maintainability
- [ ] Naming clear and descriptive
- [ ] Single responsibility maintained
- [ ] No duplication
- [ ] Comments explain WHY (not WHAT)
- [ ] Types document intent

### Documentation
- [ ] CHANGELOG updated (if user-facing)
- [ ] JSDoc added for public methods
- [ ] Non-obvious logic has comments

### Approval Decision
- [ ] ✅ APPROVE - All gates pass, high quality
- [ ] 🟡 REQUEST CHANGES - Minor issues, easy fix
- [ ] 🔴 BLOCK - Critical issues, won't approve until fixed
```

---

## GATE OVERRIDE POLICY

**When can we skip gates?**

| Gate | Can Override? | Approval Required |
|------|---------------|-------------------|
| TypeScript strict | ❌ NO | N/A |
| Security review | ❌ NO | N/A |
| Test coverage | ⚠️ RARE | Tech lead + owner |
| Performance check | ⚠️ RARE | Tech lead + owner |
| Code review | ❌ NO | Always required |

**Example override** (with justification):
```markdown
## Override Request: Test Coverage Gate

Coverage dropped to 82% due to refactoring shared validation (new module).

The new module itself has 100% coverage; overall drop is temporary.
Plan: Consolidate test suite to improve overall coverage by 3%.

**Approval:**
- Tech lead: @luc ✅
- Owner: @senior-dev ✅

**Decision:** Approve with condition - PR #42 must be completed within 1 week.
```

---

## EXAMPLES: What Passes vs Fails

### Example 1: Token Refresh Implementation

**Code:**
```typescript
class TokenManager {
  private refreshPromise: Promise<string> | null = null;

  async getAccessToken(): Promise<string> {
    if (this.isTokenValid()) {
      return this.accessToken;
    }

    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async performRefresh(): Promise<string> {
    const response = await this.oauth.exchangeToken(this.codeVerifier);
    this.accessToken = response.accessToken;
    this.expiresAt = Date.now() + response.expiresInSeconds * 1000;
    return response.accessToken;
  }

  private isTokenValid(): boolean {
    if (!this.accessToken) return false;
    if (!this.expiresAt) return false;
    const BUFFER_MS = 5 * 60 * 1000;
    return this.expiresAt > Date.now() + BUFFER_MS;
  }
}
```

**Review Result: ✅ APPROVED**

**Why:**
- ✅ Security: No token logged, buffer prevents expiry mid-operation
- ✅ Correctness: Race condition prevented with mutex pattern
- ✅ Maintainability: Clear names, single responsibility
- ✅ Performance: Single API call even with concurrent requests
- ✅ Tests: Exist and pass (from Phase 5 plan)

---

### Example 2: Action Executor with Retry

**Code:**
```typescript
async function executeAction(action: Action): Promise<ActionResult> {
  const MAX_ATTEMPTS = 3;
  const BASE_BACKOFF_MS = 100;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (!isValidSelector(action.selector)) {
        throw new ValidationError(`Invalid selector: ${action.selector}`);
      }

      const result = await contentScript.execute(action);
      
      if (!result.success) {
        if (isTransientError(result.error)) {
          throw new TransientError(result.error);
        }
        return { success: false, error: result.error, attempts: attempt };
      }

      return { success: true, attempts: attempt };

    } catch (error) {
      if (!(error instanceof TransientError) || attempt === MAX_ATTEMPTS) {
        return { 
          success: false, 
          error: error.message, 
          attempts: attempt 
        };
      }

      const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }
}
```

**Review Result: ✅ APPROVED**

**Why:**
- ✅ Security: Input validated before use
- ✅ Correctness: Error types checked, retry logic sound
- ✅ Reliability: Transient vs permanent errors distinguished
- ✅ Performance: Exponential backoff prevents API hammering

---

### Example 3: (HYPOTHETICAL) Bad Code

**Code:**
```typescript
async function runTask(task) {
  // Hardcoded config
  const projectId = 'abc-123-project';
  const apiKey = 'secret-key-xyz';

  // No validation
  const selector = task.selector;
  const element = document.querySelector(selector);
  element.innerHTML = task.content; // XSS risk!

  // No error handling
  const plan = await fetch(vertexUrl, {
    headers: { 'X-API-Key': apiKey }
  }).then(r => r.json());

  // N+1 pattern
  for (const action of plan.actions) {
    await fetch(loggingUrl, { body: action }); // Every action!
  }

  // Race condition
  if (this.token) {
    const result = await api.request(this.token); // Token might expire
  }
}
```

**Review Result: 🔴 BLOCK**

**Critical Issues:**
1. ❌ Hardcoded credentials (security)
2. ❌ No input validation (security)
3. ❌ innerHTML from untrusted source (XSS)
4. ❌ No error handling (reliability)
5. ❌ N+1 logging (performance)
6. ❌ Token expiry race (correctness)

**Required fixes before approval:**
- [ ] Move credentials to ConfigManager
- [ ] Validate selector with isValidSelector()
- [ ] Use textContent or sanitize HTML
- [ ] Add try-catch with proper error reporting
- [ ] Batch logging API calls
- [ ] Use atomic getAccessToken() instead of checking cached token

---

## Implementation Checklist

To enable these gates in CI/CD:

**1. Setup linting & formatting:**
```bash
npm install -D eslint @typescript-eslint/eslint-plugin prettier
npm run lint -- --fix
npm run format
```

**2. Configure Git hooks:**
```bash
npm install -D husky lint-staged
npx husky install
npx husky add .husky/pre-commit "npm run lint-staged"
```

**3. Setup GitHub Actions:**
```yaml
# .github/workflows/review-gates.yml
name: Review Gates
on: [pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run lint -- --max-warnings 0
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:coverage
```

**4. Require reviews:**
```
Settings → Branch Rules → Require 1 approval before merge
```

**5. Auto-block on failed CI:**
```
Settings → Branch Rules → Require status checks to pass
```

---

**Created:** PHASE-6-CODE-REVIEW-GATES.md  
**Format:** Complete code review standards with 3-tier gates (automated, manual, approval)  
**Next Step:** Phase 7 (Deployment & Release) — Define deployment checklist and release strategy
