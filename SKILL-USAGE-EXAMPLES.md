# 30 Engineering Skill Examples for Cometeor
**Learning Guide: How to Use Each Engineering Skill on Real Problems**

---

## 🔧 /engineering:debug — 5 Examples

Use this for isolating bugs, understanding what went wrong, and tracing data flows.

### Example 1: Trace XSS Attack Path
```
/engineering:debug

"Debug the selector injection XSS vulnerability in Cometeor.
Trace the data flow: User prompt → AI generates plan → selector → DOM execution.
Show step-by-step how an attacker could inject code through a malicious prompt.
What's the exact point of failure?
How would you isolate and test it?"
```

### Example 2: Reproduce Message Handler Race
```
/engineering:debug

"Debug why Cometeor's message handlers fire multiple times.
Current state: 3 separate chrome.runtime.onMessage.addListener() calls.
Reproduce the bug: Send a CONFIG_UPDATED message and watch which handlers respond.
Why does sendResponse get called multiple times?
What's the exact condition that triggers the race?"
```

### Example 3: Isolate Token Refresh Concurrency
```
/engineering:debug

"Debug the token refresh race condition in auth-manager-pkce.ts.
Scenario: Two API requests arrive simultaneously while token is expired.
Both call refreshToken() at the same time.
Reproduce: Show the exact timeline of calls.
Prove that two refresh requests are being sent instead of one.
How would you detect this in production?"
```

### Example 4: Find Silent Action Failures
```
/engineering:debug

"Debug why action failures in Cometeor don't stop the task.
User task: 'Fill form and submit'
Execution: [type email, type password, click submit]
Type password FAILS but continues silently.
Form submitted without password.
Isolate: Why isn't the failure reported back?
Where does the error get swallowed?"
```

### Example 5: Diagnose Content Script Disconnect
```
/engineering:debug

"Debug a scenario: Content script crashes mid-task.
Background service worker keeps sending messages to dead tab.
Task never completes; sidebar shows spinning loader forever.
How would you detect that content script is dead?
What heartbeat mechanism would prevent this?"
```

---

## 🏗️ /engineering:system-design — 5 Examples

Use this for designing architectures, redesigning components, and solving scalability problems.

### Example 6: Redesign Message Routing
```
/engineering:system-design

"Design a message routing system for Cometeor that eliminates race conditions.
Current: 3 separate message listeners, each processes all messages.
Requirement: Single sendResponse per message, clear routing.
Constraints: Must handle sidebar messages, content script messages, config updates.
Design: Should I use a dispatcher pattern? Event emitter? Type-based routing?
Show the complete redesigned message flow."
```

### Example 7: Design Fault-Tolerant Action Execution
```
/engineering:system-design

"Design a fault-tolerance layer for Cometeor action execution.
Current: Actions fail silently; AI doesn't know what failed.
Requirement: Retry failed actions with exponential backoff.
Design considerations:
- Which actions are critical (stop on failure)?
- Which are non-critical (can continue)?
- How many retries? (2? 3? 5?)
- Backoff strategy: exponential vs fixed?
- How to communicate failures back to AI for replanning?"
```

### Example 8: Design Backpressure for DOM Mutations
```
/engineering:system-design

"Design a backpressure system for DOM mutations in Cometeor.
Current problem: Page with 50K nodes receives 100 mutations/sec.
Each mutation triggers full DOM snapshot sent to Vertex AI.
That's 5MB/sec to API.
Design requirements:
- Debounce mutations (how long?)
- Batch similar mutations
- Delta snapshots (send only what changed)
- Fallback to full snapshot when delta > 50% of DOM
Show the complete design with timing diagrams."
```

### Example 9: Design Config Management Architecture
```
/engineering:system-design

"Design a configuration management system for Cometeor.
Current: Hardcoded projectId, clientId in source code.
Desired state: Configurable at runtime; secure storage; dev/prod separation.
Design:
- Where should config live? (chrome.storage.sync? .local? .session?)
- What's the bootstrap process? (First run → options page?)
- How to handle config updates without reloading?
- How to validate config?
- How to secure sensitive values (OAuth credentials)?"
```

### Example 10: Design Circuit Breaker for API
```
/engineering:system-design

"Design a circuit breaker pattern for Vertex AI API calls in Cometeor.
Problem: If API is rate-limited (429), should we keep hammering it?
Design requirements:
- Detect rate limit: How many consecutive 429s = circuit open?
- Open state: Stop sending requests for how long? (5 min? 10 min?)
- Half-open state: Test with one request; if succeeds, close circuit.
- Metrics: Track circuit state, failure rate, recovery time.
Show the state machine and transitions."
```

---

## 🏛️ /engineering:architecture — 5 Examples

Use this for documenting decisions, creating ADRs, and comparing alternatives.

### Example 11: ADR for Config Storage
```
/engineering:architecture

"Create an Architecture Decision Record for Cometeor config management.
Title: Where should extension configuration live?

Options to evaluate:
A) chrome.storage.sync (syncs across devices; encrypted by browser)
B) chrome.storage.local (stays on device; encrypted by browser)
C) chrome.storage.session (cleared on browser close; encrypted)
D) Environment variables + webpack (baked into binary; can't change)
E) External config server (centralized; harder to secure in extension)

For each option, analyze:
- Security (how safe are credentials?)
- Flexibility (can user change without rebuilding?)
- Persistence (survives browser restart?)
- Sync across devices
- Complexity
- Risk of exposure

Recommend one and explain trade-offs."
```

### Example 12: ADR for Message Routing Pattern
```
/engineering:architecture

"Create an ADR: How should Cometeor route messages between components?

Options:
A) Multiple listeners (current; has race condition)
B) Single dispatcher with switch statement
C) Event emitter pattern (EventTarget)
D) Type-based router (message type → handler map)
E) Message queue (buffer → process async)

For each, analyze:
- Concurrency safety
- Testability
- Extensibility (adding new message types)
- Performance
- Code clarity
- Maintenance burden

Choose one and show refactored code."
```

### Example 13: ADR for Error Handling Strategy
```
/engineering:architecture

"Create an ADR: How should Cometeor handle action execution failures?

Options:
A) Silent failure (current; breaks tasks)
B) Fail fast (stop on first error)
C) Retry with backoff (exponential, fixed, adaptive)
D) Circuit breaker (stop after N failures)
E) Cascading fallback (try selector#1, if fails try selector#2)

For action types: click, type, scroll, wait, press_key
Which strategy applies to each?

Create a decision matrix showing:
- Critical actions: (stop on failure)
- Non-critical: (retry)
- Recoverable: (fallback)
- Unrecoverable: (report + skip)"
```

### Example 14: ADR for Authentication Token Management
```
/engineering:architecture

"Create an ADR: How should Cometeor manage authentication tokens?

Current problem: Token refresh race condition.

Options:
A) Single-threaded refresh (use lock/mutex)
B) Cached token with background refresh
C) Just-in-time refresh (verify token before each request)
D) Distributed cache (share tokens across service worker instances)

For each option, analyze:
- Concurrency safety
- Performance (token validation overhead)
- Failure modes (what if refresh fails?)
- Refresh timing (how far before expiry?)

Choose approach and show implementation."
```

### Example 15: ADR for DOM Snapshot Strategy
```
/engineering:architecture

"Create an ADR: How should Cometeor capture and send DOM snapshots?

Options:
A) Full DOM snapshot every mutation (current; expensive)
B) Debounced full snapshot (batch mutations; send every 100ms)
C) Delta snapshot (send only changed nodes)
D) Intelligent sampling (full every 10s + deltas in between)
E) On-demand snapshot (only when AI asks)

For each, analyze:
- API data cost (MB per task)
- Latency to feedback (how quickly does AI see changes?)
- Accuracy (does AI have enough context?)
- Implementation complexity

Recommend and show architecture."
```

---

## 📊 /engineering:tech-debt — 3 Examples

Use this for auditing code quality, prioritizing fixes, and understanding maintenance burden.

### Example 16: Audit and Prioritize All Issues
```
/engineering:tech-debt

"Audit all tech debt in Cometeor extension.

Current inventory:
- 5 critical issues (XSS, races, failures, config, silent errors)
- 8 high-priority issues (timeouts, leaks, type safety, etc.)
- 12 medium issues (no tests, logging, comments, etc.)

Task: Create a prioritization matrix.
For each issue, estimate:
- Fix effort (hours)
- Business risk (security? reliability? performance?)
- Dependencies (does fixing A unblock B?)
- User impact (how many users affected?)
- Code coverage (how many files changed?)

Create a roadmap showing:
- What to fix first? (unblocks other fixes)
- What to parallelize? (independent fixes)
- What to defer? (nice-to-have)

Show timeline: Can we ship in 2 weeks?"
```

### Example 17: Audit Type Safety Debt
```
/engineering:tech-debt

"Audit TypeScript type safety in Cometeor.

Current state: Many 'any' types used throughout.
Find all instances of:
- (message: any, ...)
- (error: any)
- Any unchecked data flows

Task: 
- Count lines of unsafe code
- Map unsafe types → actual types needed
- Estimate effort to eliminate all 'any'
- Show which files are worst offenders
- Recommend which type fixes yield highest value

Categorize:
- Easy wins (rename variable to proper type): 1h effort
- Medium (add interfaces): 5h
- Hard (restructure modules): 10h"
```

### Example 18: Audit Testing Debt
```
/engineering:tech-debt

"Audit testing coverage in Cometeor.

Current state: npm test fails (no tests written).

Questions:
- What critical paths have zero test coverage?
  (ActionExecutor? TokenManager? MessageRouter?)
- What's the risk of each untested path?
- What would tests cost to write?

For each critical component:
- How many lines of code?
- How many branches?
- What test types needed?
  (unit? integration? E2E? Property-based?)
- Estimate lines of test code needed

Create a test debt roadmap:
'High priority (race conditions): 50 tests, 200 lines, 10h effort'
'Medium priority (error paths): 30 tests, 150 lines, 6h'
'Low priority (logging): 10 tests, 50 lines, 2h'"
```

---

## ✅ /engineering:testing-strategy — 4 Examples

Use this for designing test suites, test pyramids, and testing problematic code.

### Example 19: Design Tests for Race Conditions
```
/engineering:testing-strategy

"Design a test suite for Cometeor's concurrency bugs.

Problems to test:
1. Message handler race (3 listeners respond once)
2. Token refresh race (concurrent calls duplicate refresh)

Test design requirements:
- Test must reliably reproduce the race
- Not flaky (passes sometimes, fails sometimes)
- Fast (< 1 second per test)
- Deterministic (same input, same output)

For each race:
- How would you force concurrency? (Promise.all? setImmediate?)
- What assertion proves the bug? (sendResponse called twice?)
- How would you verify the fix?

Create test file structure:
tests/
  auth/
    token-refresh.race.test.ts
    token-refresh.concurrent.test.ts
  messages/
    handler-dispatch.race.test.ts"
```

### Example 20: Design Test Pyramid for Cometeor
```
/engineering:testing-strategy

"Design a test pyramid (coverage strategy) for Cometeor.

Traditional pyramid:
- Bottom (many): Unit tests
- Middle: Integration tests
- Top (few): E2E tests

For Cometeor, what should be at each level?

Unit tests (target: 80% of time):
- ActionValidator (selectors, coordinates, text input)
- TokenManager (refresh, expiry, storage)
- MessageRouter (type routing, dispatch)
- RateLimiter (token bucket, backoff)

Integration tests (target: 15% of time):
- TaskManager + ActionExecutor (plan → execute)
- AuthManager + TokenStore (OAuth flow)
- VertexClient + RequestQueue (API + rate limiting)

E2E tests (target: 5% of time):
- Full user workflow (sidebar → task complete)

For each level, estimate:
- Number of tests needed
- Time to write (hours)
- Maintenance cost (hours per sprint)"
```

### Example 21: Design Tests for Selector Injection
```
/engineering:testing-strategy

"Design a security test suite for selector injection vulnerability.

Threat: Attacker crafts prompt → AI generates malicious selector → XSS.

Test scenarios:
1. Benign selectors pass validation
   - 'button.submit'
   - 'input[type=email]'
   - 'div > p.text'

2. Malicious selectors rejected
   - '\"); alert(\"XSS'); //'
   - 'x\' onload=\'alert(1)'
   - '${require(\"fs\").readFileSync(\"/etc/passwd\")}'
   - Any selector with script tags, event handlers, etc.

3. Edge cases
   - Empty selector ''
   - Very long selector (10K chars)
   - Unicode/emoji selectors
   - Selectors with newlines/tabs

Test framework:
tests/
  security/
    selector-injection.test.ts
      - testValidSelectorsPass()
      - testMaliciousSelectorsRejected()
      - testEdgeCasesHandled()
      - testFuzzing() // Generate random inputs

Coverage: 100% of selector validation code"
```

### Example 22: Design Load/Stress Test Strategy
```
/engineering:testing-strategy

"Design a load/stress test suite for Cometeor under high mutation rate.

Scenario: Page with 50K DOM nodes; 100 mutations/sec for 60 seconds.
Expected behavior: Extension handles gracefully (no hang, no crash).

Test design:
1. Baseline test: No mutations
   - Measure: API calls, memory, CPU
   
2. Load test: Gradual mutation increase
   - Start: 1 mutation/sec
   - Ramp: +10 mutations/sec every 10 seconds
   - Max: 100 mutations/sec
   - Measure: API calls, latency, errors

3. Stress test: Max mutations for duration
   - 100 mutations/sec for 60 seconds
   - Measure: Peak memory, dropped mutations, recovery time

4. Spike test: Sudden load change
   - 0 mutations → 100 mutations/sec (instant)
   - Does extension recover?

Metrics to track:
- Memory growth (should plateau, not linear)
- API call rate (should not exceed quota)
- DOM snapshot size (should stay < 1MB avg)
- Latency to AI response (should stay < 2s p95)
- Errors (should be zero)"
```

---

## 📝 /engineering:code-review — 3 Examples

Use this for reviewing code changes, security audits, and quality gates.

### Example 23: Security Review of Auth Flow
```
/engineering:code-review

"Review the OAuth2 PKCE authentication flow in auth-manager-pkce.ts for security.

Check for:
1. PKCE implementation correct?
   - code_verifier generated securely? (crypto.randomUUID())
   - code_challenge hashed with S256?
   - Verifier sent in token exchange request?

2. CSRF protection?
   - State token generated?
   - State validated in callback?

3. Token handling secure?
   - Tokens stored in chrome.storage.session (not localStorage)?
   - codeVerifier stored in session storage (not memory)?
   - Refresh token handled safely?
   - No logging of tokens?

4. Edge cases handled?
   - OAuth flow cancelled by user?
   - Network error during token exchange?
   - Token expiry before refresh?
   - Refresh token revoked?

Report: Is this safe for production?"
```

### Example 24: Code Review of Action Executor
```
/engineering:code-review

"Review action-executor.ts for correctness, performance, and security.

Check:
1. Error handling
   - All error paths result in reported failure?
   - No silent failures?
   - Timeout on each action?

2. Input validation
   - Selector validated? (no XSS)
   - Coordinates in valid range? (0-9999)
   - Text input length checked? (< 10K)
   - Action type enumerated? (no unknown types)

3. Sequencing
   - Actions executed in order?
   - Proper delays between actions? (for stability)
   - Concurrent action execution possible? (should be serial)

4. Performance
   - Any N+1 query patterns?
   - Memory leak on retries?
   - Unbounded queue?

5. Testing
   - Each action type tested?
   - Failure paths tested?
   - Concurrency tested?

Report: Is this code safe to execute on untrusted websites?"
```

### Example 25: Performance Review of DOM Snapshots
```
/engineering:code-review

"Review DOM snapshot code for performance issues.

Check:
1. Snapshot size
   - Does it serialize entire DOM?
   - Any way to compress?
   - Delta snapshots implemented? (or should be?)

2. Frequency
   - How often are snapshots taken?
   - Is there debouncing?
   - Any backpressure if mutations too frequent?

3. Async behavior
   - Is snapshot non-blocking?
   - Could snapshot generation pause the page?
   - Any janky animations?

4. Memory
   - Snapshots kept in memory? (how long?)
   - Old snapshots cleaned up?
   - Memory leak on long tasks?

5. Network
   - Snapshot serialization efficient?
   - Gzip compression used?
   - Can we send delta instead of full?

Report: 
- Current snapshot size in MB?
- API data cost per task?
- Improvement potential?"
```

---

## 📋 /engineering:deploy-checklist — 3 Examples

Use this for pre-release verification, deployment planning, and rollback procedures.

### Example 26: Pre-Release Checklist for Security Fixes
```
/engineering:deploy-checklist

"Create a pre-release checklist before shipping security fixes to Cometeor.

Fixes being released:
1. Selector injection validation
2. Message handler consolidation
3. Token refresh locking
4. Action retry logic
5. Config → storage

Checklist:

Code Review:
- [ ] All code reviewed by second developer
- [ ] Security implications documented
- [ ] Edge cases covered in tests

Testing:
- [ ] Unit tests pass (100% coverage of new code)
- [ ] Integration tests pass
- [ ] Manual testing on live sites (Google, GitHub, etc.)
- [ ] Security tests pass (XSS payloads rejected?)
- [ ] Regression tests pass (old functionality not broken?)

Performance:
- [ ] No performance regression
- [ ] Memory usage stable
- [ ] API quota not exceeded

Deployment:
- [ ] Release notes written
- [ ] Changelog updated
- [ ] Migration guide (if needed)
- [ ] Rollback plan documented (what if we revert?)

Monitoring:
- [ ] Error logging enabled
- [ ] Metrics collection configured
- [ ] Alert thresholds set
- [ ] Runbook written (how to respond if issues)

Sign-off:
- [ ] PM approves release
- [ ] Security team approves
- [ ] QA approves"
```

### Example 27: Deployment Plan for Extension Update
```
/engineering:deploy-checklist

"Plan deployment of Cometeor update to users.

Release: v1.1.0 (critical security patches)

Deployment strategy: Canary (gradual rollout)

Step 1: Internal testing (1 day)
- QA tests on internal extension
- Dogfooding by team
- Performance baseline

Step 2: Beta release (3 days)
- Push to 5% of users
- Monitor error rate (target: < 1% increase)
- Collect feedback

Step 3: Ramp (2 days)
- 5% → 25% of users
- Monitor again

Step 4: Full release (1 day)
- 25% → 100% of users

Rollback procedure (if error rate spikes):
- Immediately push previous version
- Issue hotfix
- Analyze what went wrong

Metrics to monitor:
- Crash rate
- Task success rate
- API error rate
- User complaints
- Extension rating (don't let drop)"
```

### Example 28: Release Notes for Bug Fixes
```
/engineering:deploy-checklist

"Write release notes for Cometeor v1.1.0.

Content:

## What's New

### Security Fixes
- Fixed XSS vulnerability in selector validation
- Fixed OAuth token refresh race condition
- Hardcoded credentials moved to secure storage

### Reliability Improvements
- Message routing consolidated (eliminates race condition)
- Action failures now properly retried with backoff
- Content script health monitoring added

### Bug Fixes
- Silent action failures now reported
- Message handler duplicate responses fixed
- Token refresh no longer duplicates API calls

## Migration Guide

No action needed. Update automatically applied.

## Known Limitations

- Large DOM trees (> 100K nodes) may have slower snapshots
- API rate limit still 55 req/min (coming in v1.2)

## Reporting Issues

Found a bug? Report it: github.com/cometeor/issues"
```

---

## 📚 /engineering:documentation — 2 Examples

Use this for writing guides, runbooks, and architecture docs.

### Example 29: Write Architectural Overview Document
```
/engineering:documentation

"Write architectural documentation for Cometeor extension.

Audience: New developers joining the team

Sections:
1. High-level overview
   - What is Cometeor?
   - How does it work? (diagram)
   - Key components

2. Component deep dive
   - Service worker (message routing, task management)
   - Content scripts (DOM extraction, action execution)
   - Sidebar UI (task interface)
   - Auth manager (OAuth2 PKCE flow)

3. Data flow
   - User task → AI planning → action execution
   - Show complete request/response flow

4. Key design patterns
   - Message passing between components
   - Task state machine
   - Error handling and retry logic

5. Known limitations
   - Service worker termination risk
   - DOM snapshot performance
   - Rate limiting on Vertex AI

6. Future improvements
   - Circuit breaker for API
   - Delta snapshots
   - Distributed task execution

7. References
   - Chrome extension API docs
   - Vertex AI API docs
   - Related projects"
```

### Example 30: Write Troubleshooting Runbook
```
/engineering:documentation

"Write a troubleshooting runbook for Cometeor developers.

Audience: Developers debugging production issues

Format:

## Runbook: Cometeor Task Hangs

### Symptoms
- Sidebar shows 'In progress' for > 5 minutes
- No actions executing
- No error messages

### Root Causes (diagnosis tree)

Is service worker alive?
├─ YES: Continue to next check
└─ NO: Service worker terminated
    → Solution: Implement offscreen document for long tasks

Is content script alive?
├─ YES: Continue to next check
└─ NO: Content script crashed
    → Solution: Reload tab or send heartbeat

Is API responding?
├─ YES: Continue to next check
└─ NO: Vertex AI API down or timeout
    → Solution: Check rate limit; implement timeout + fallback

Is message passing working?
├─ YES: Action should execute
└─ NO: Message lost in transit
    → Solution: Check console for 'Message error'

### Immediate Actions
1. Check Chrome DevTools console for errors
2. Inspect service worker: chrome://extensions → Cometeor → Service Worker
3. Check API quota: Google Cloud Console → Vertex AI

### Recovery
- If service worker dead: Reload extension
- If content script dead: Reload tab
- If API throttled: Wait 5 minutes or upgrade quota

### Escalation
- Issue persists > 15 min: File bug with logs
- Affects all tasks: Page-wide issue
- Affects one site: Site-specific issue (permissions?)"
```

---

## 🎓 Summary: Which Skill for Which Problem

| Problem | Best Skill | Example # |
|---------|-----------|-----------|
| **Understanding bugs** | `/engineering:debug` | 1-5 |
| **Redesigning architecture** | `/engineering:system-design` | 6-10 |
| **Documenting decisions** | `/engineering:architecture` | 11-15 |
| **Prioritizing fixes** | `/engineering:tech-debt` | 16-18 |
| **Building tests** | `/engineering:testing-strategy` | 19-22 |
| **Reviewing code** | `/engineering:code-review` | 23-25 |
| **Shipping changes** | `/engineering:deploy-checklist` | 26-28 |
| **Writing guides** | `/engineering:documentation` | 29-30 |

---

## 🚀 How to Use These Examples

**Pick one example that matches your current problem:**

1. Copy the exact format
2. Replace placeholders with your actual code/context
3. Invoke the skill with the full prompt
4. Read the skill's analysis
5. Apply recommendations to your codebase

**Example flow:**
```
1. You have a problem: "Actions fail silently"
2. Find matching example: Example 4 (Debug silent failures)
3. Copy format and customize
4. Run: /engineering:debug "Debug why action failures..."
5. Get: Step-by-step isolation and fix plan
6. Implement fix
7. Verify with tests (use /engineering:testing-strategy)
```

---

**Ready?** Pick an example and run it!
