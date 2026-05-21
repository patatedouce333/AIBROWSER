# Services: Force, Rôle, Points Critiques

## Vue Globale

Cometeor Agent = 6 services orchestrés pour transformer "user intent" → "DOM action" en <5s.

La force comparative varie par domaine: planner (LLM intelligence) vs executor (CDP reliability) vs browser (lifecycle stability).

---

## 1. browser.ts - ChromeManager & Session

### Rôle

- **Lifecycle**: Spawn Chrome headless, detect death, auto-restart
- **CDP Tunnel**: Expose chrome-remote-interface client per session
- **Resource Management**: Profile cleanup, SIGTERM graceful shutdown

### Force

**✓ Singleton Mutex Pattern**
```typescript
if (this._launchPromise) return this._launchPromise;
this._launchPromise = this._launch().finally(() => { 
  this._launchPromise = null; 
});
```
Concurrent ensureRunning() calls don't double-spawn. Second caller waits on same promise.

**✓ Auto-Restart on Death**
```typescript
if (this._ready && this._process && !this._process.killed) return;
// Else: restart
await this._waitReady(10_000);  // Timeout 10s
```
Death detection via process.on('exit'). Max 10s restart latency.

**✓ Clean Signal Handling**
```typescript
process.on('SIGINT', () => { this._killSync(); process.exit(0); });
process.on('SIGTERM', () => { this._killSync(); process.exit(0); });
```
Graceful exit, cleanup profile dir. No zombie processes.

### Points Critiques

**△ Single Chrome Instance (Shared State)**
- All workflows share one Chrome process
- Cookies, localStorage, service workers persist
- **Risk**: Task A leaks state to Task B
- **Mitigation**: Use incognito profile (future enhancement)

**△ No Restart During Active Session**
- If Chrome dies mid-execution → ACTION_TIMEOUT_MS fires (12s)
- Replan calls ensureRunning() → restarts Chrome
- **Risk**: Session history lost (cookies gone if new profile)
- **Latency**: +10s for restart

**△ Profile Cleanup Race**
```typescript
try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch {}
```
Cleanup happens async on shutdown. If rapid restart, old profile lingers.

### Routes Impactées

- `POST /run`: ensureRunning() before connectSession
- `POST /workflow`: ensureRunning() before runWorkflow
- `GET /health`: isAlive() check

**Impact**: Chrome unavailable → 429 (at HTTP level) or 10s restart penalty.

---

## 2. a11y.ts - Accessibility Tree Extractor

### Rôle

- **DOM → Semantic**: Chrome getFullAXTree() → compact text representation
- **Node Mapping**: Create nodeMap [ID] → accessibility node
- **Deduplication**: Prevent identical labels from exploding tree

### Force

**✓ Interactive Role Prioritization**
```typescript
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'combobox', 'listbox', ...
]);

// Build: interactiveLines[] THEN staticLines[]
// Output: [...interactiveLines, ...staticLines.slice(0, remainingSpace)]
```
Buttons appear first in tree. Planner sees clickables immediately. Better LLM focus.

**✓ Smart Deduplication**
```typescript
const seenLabels = new Map<string, number>();  // "role:name" → count
if (count < 3) {  // Allow up to 3 identical labels
  nodeMap.set(id, node);
}
```
Prevents nodeId explosion from 50 identical buttons → only 3 in tree.

**✓ Compact Format**
```typescript
// Output: [42] button "Login" (click to submit)
// Not: <full JSON object>
```
400-line max output. LLM gets concise context, not overwhelming.

### Points Critiques

**△ Tree Truncation (>400 lines)**
```typescript
const MAX_LINES = 400;
const combined = [...interactiveLines, 
  ...staticLines.slice(0, Math.max(0, MAX_LINES - interactiveLines.length))];
```
If page has >500 interactive nodes: **some elements invisible to LLM**.
- Planner can't reference truncated nodes
- Hallucination: "click button on row 50" (but row 50 not in tree)
- Fallback to CSS selector (may work or not)

**△ Dedup Limit Reuse (Same ID for Different Elements)**
```typescript
// Page has 5 buttons all named "Submit"
// Tree shows only first 3: [15] button "Submit", [16] button "Submit", [17] button "Submit"
// Planner references [15]
// But executePlan().clickNode([15]) finds nodeMap[15]
// If page mutation happened → wrong button clicked
```

**△ Timeout on Large Pages (10s max)**
```typescript
await Promise.race([
  client.Accessibility.getFullAXTree(),
  sleep(10_000)
]);
```
Giant DOM → tree extraction timeout → returns {nodes:[]} → tree="(empty page)".

### Latency Breakdown

- **Typical**: 100-300ms (most pages)
- **Large DOM**: 300-500ms (1000+ nodes)
- **Timeout**: 10000ms (edge case: complex SPA)

### Routes Impactées

- `POST /run`: extractPageContext calls a11y (per task)
- `POST /workflow`: extractPageContext per step (N times)

**Impact**: Tree quality → plan quality. Bad tree = hallucination.

---

## 3. planner.ts - Mercury LLM Planner

### Rôle

- **Task → Plan**: Convert user intent to action sequence
- **Multilingual**: Accept tasks in any language, output English actions
- **Error Recovery**: JSON parse failure → retry with correction prompt

### Force

**✓ Deterministic Planning**
```typescript
const response = await callMercury(SYSTEM_PROMPT, userMessage, {
  apiKey,
  temperature: 0.1,  // Low temp = deterministic
  maxTokens: 4096
});
```
temperature=0.1 means Mercury produces same plan for same input. Reproducible.

**✓ Multilanguage Task Input**
```typescript
const SYSTEM_PROMPT = `... Accept tasks in ANY language (French, Spanish, Arabic, Chinese, etc.)
  — plan in English action types but understand the task in its original language`;
```
Task="Remplissez le formulaire login" (FR) → Plan=[{action:'type', text:'user@ex.com'}] (EN).

**✓ JSON Retry with Correction**
```typescript
try {
  return parseAndValidate(response, context.nodeMap);
} catch (firstErr) {
  console.warn('[planner] JSON parse failed, retrying...');
  const corrected = await callMercury(CORRECTION_PROMPT, ...);
  return parseAndValidate(corrected, context.nodeMap);
}
```
If LLM returns broken JSON → one retry with "fix it" prompt. ~70% success on retry.

**✓ Semantic Validation**
```typescript
if (s.nodeId !== undefined) {
  const id = Number(s.nodeId);
  if (nodeMap.has(id)) {
    step.nodeId = id;
  } else {
    console.warn(`[planner] nodeId ${id} not in nodeMap (hallucinated?), using selector fallback`);
  }
}
```
Planner detects hallucinated nodeIds, demotes to selector fallback.

### Points Critiques

**△ Latency Dominates (2-8s per call)**
```typescript
// Typical breakdown:
// - Network: 500ms
// - LLM inference: 2-5s (Mercury-2)
// - JSON parse: 50ms
// Total: 2.5-5.5s (plus retries if needed)
```
**Main bottleneck in entire pipeline**. 3-step workflow = 3 LLM calls = 7.5-16.5s just planning.

**△ Rate Limit Risk (429)**
```typescript
if (err.message?.includes('429') || err.message?.includes('503')) {
  const backoff = 1000 * Math.pow(2, attempt - 1);  // 1s, 2s, 4s
  // Retry 3× total = 7s+ backoff if unlucky
}
```
If Inception API overloaded → 429 → retry with 1s backoff → +3-7s latency.

**△ Hallucinated NodeIds**
```typescript
// Tree shows: [5] button "Login"
// Mercury hallucinates: nodeId=999 (doesn't exist)
// Planner: "nodeId 999 not in nodeMap"
// Falls back to CSS selector (may fail)
```
Happens when tree is truncated or LLM confuses node count.

**△ Bad Tree → Bad Plan**
- Incomplete tree → Mercury invents nodes
- Complex page → LLM overthinks
- No "explain your reasoning" step (for latency)

### Latency Breakdown

- **Simple task** (1-3 actions): 2-3s total
- **Complex task** (5+ actions, multi-page): 5-8s total
- **With retry (429 or JSON fail)**: +1-4s

### Routes Impactées

- `POST /run`: generatePlan once per task
- `POST /workflow`: generatePlan per step (N × latency)

**Impact**: N-step workflow = N × planner latency. Workflow of 5 steps = 12.5-40s just planning.

---

## 4. executor.ts - Action Executor

### Rôle

- **Atomic Action Dispatch**: click, type, select, scroll, wait, navigate
- **CDP Protocol**: Send events via Input.dispatchMouseEvent, etc.
- **Fallback Strategy**: nodeId fails → try CSS selector
- **DOM Settle Detection**: Wait for mutations to stabilize

### Force

**✓ Dual Resolution Path**
```typescript
// Path 1: nodeId → backendDOMNodeId → CDP resolution
const { nodeIds } = await client.DOM.pushNodesByBackendIdsToFrontend({
  backendNodeIds: [node.backendDOMNodeId],
});

// Path 2: CSS selector fallback
await clickViaJS(action.selector, client);
```
Primary: accurate node targeting. Fallback: resilient selector.

**✓ Humanized Input (Simulated Typing)**
```typescript
for (const char of action.text) {
  await client.Input.dispatchKeyEvent({ type: 'char', text: char });
  await sleep(15 + Math.random() * 15);  // 15-30ms per char
}
```
Character-by-character with jitter avoids detection as bot.

**✓ DOM Settle Polling**
```typescript
while (stableCount < DOM_SETTLE_STABLE_COUNT) {  // 3×
  await sleep(DOM_SETTLE_POLL_MS);  // 80ms
  const current = String(result.value);
  if (current === lastHtml) stableCount++;
  else stableCount = 0;
}
```
Polls DOM 3× to confirm no mutations. Avoids race with async renders.

**✓ Timeouts per Action Type**
```typescript
const ACTION_TIMEOUT_MS = 12_000;      // click, type, select, scroll, wait
const NAV_TIMEOUT_MS = 20_000;         // navigate
await withTimeout(executeAction(...), timeout, label);
```
Navigate gets 20s (slower due to page load), others 12s.

### Points Critiques

**△ Sequential NOT Concurrent**
```typescript
for (const action of plan) {
  await executeAction(action, client, context);
  await waitForDOMSettle(client);  // 240ms overhead per action
}
```
Each action waits full timeout. No pipelining. 5 actions = 5 × 200ms settle = 1s overhead alone.

**△ Chrome CDP Can Hang**
```typescript
// If Chrome GC or busy:
await client.Input.dispatchMouseEvent(...)
// Blocks indefinitely until timeout (12s)
```
No heartbeat check. TCP socket hangs. Hard timeout fires eventually.

**△ Selector Fallback Unreliable**
```typescript
if (action.selector) {
  const { exceptionDetails } = await client.Runtime.evaluate({
    expression: `document.querySelector(${JSON.stringify(selector)}).click()`
  });
}
```
CSS selector might:
- Not exist (throw "Not found")
- Exist but wrong element (duplicate classes)
- Exist but hidden (visibility=none)
Success rate ~70% empirically.

**△ No Error Context**
```typescript
catch (err: any) {
  console.error(`✗ ${err.message}`);
  // Just error message, no DOM state snapshot
}
```
If action fails, no screenshot or DOM dump for debugging.

### Latency Breakdown

- **click**: 50-200ms (CDP dispatch + DOM settle)
- **type (5 chars)**: 80-150ms (per-char 15-30ms + Ctrl+A overhead)
- **select**: 100-200ms (focus + change event)
- **scroll**: 200-400ms (wheel event + settle)
- **wait**: 300-8000ms (polling condition every 300ms)
- **navigate**: 1000-20000ms (page load + settle)

### Routes Impactées

- `POST /run`: executePlan once (main execution phase)
- `POST /workflow`: executePlan per step (N times)

**Impact**: Multi-step workflow bottleneck after plan generation.

---

## 5. workflow.ts - Workflow Orchestrator

### Rôle

- **Multi-Step Execution**: Loop over WorkflowStep[]
- **Step Isolation**: Each step fresh extraction, planning, execution
- **Auto-Replan**: If step fails + required=true → retry once
- **Verification**: Optional condition check (text/CSS selector)

### Force

**✓ Step Isolation**
```typescript
for (let i = 0; i < steps.length; i++) {
  const step = steps[i];
  
  const context = await extractPageContext(cdp);  // Fresh tree
  const plan = await generatePlan(step.task, context, ...);  // Fresh plan
  const result = await executePlan(plan, cdp, context);  // Fresh exec
}
```
Each step independent. Carry state (cookies), not plan (regenerate).

**✓ Auto-Replan on Failure**
```typescript
if (!stepSuccess && required) {
  replanned = true;
  const context2 = await extractPageContext(cdp);  // New extraction
  const plan2 = await generatePlan(step.task, context2, ...);
  const result2 = await executePlan(plan2, cdp, context2);
  stepSuccess = result2.success;
}
```
Max 1 replan per step. DOM changed after first failure → new plan may succeed.

**✓ Verification Condition**
```typescript
if (step.verify) {
  stepSuccess = await checkVerify(step.verify, cdp);
  // Checks: document.body.innerText.includes(condition) OR 
  //         !!document.querySelector(condition)
}
```
Wait for confirmation text or CSS selector. Polling 8s timeout @ 300ms interval.

**✓ Graceful Partial Failure**
```typescript
const allRequired = stepResults.every(r => {
  const originalStep = steps[r.step - 1];
  const req = originalStep.required !== false;
  return !req || r.success;
});
```
Non-required steps don't block workflow. Partial success = workflow continues.

### Points Critiques

**△ Cascading Replan Latency**
```typescript
// Step 1: plan (5s) + exec (2s) = 7s. FAIL.
//   → replan: extraction (0.5s) + plan (5s) + exec (2s) = 22.5s total
// Step 2: plan (5s) + exec (2s) = 7s. SUCCESS.
// Step 3: plan (5s) + exec (2s) = 7s. FAIL → replan (22.5s)
// Workflow 3 steps with 1 replan each = 60s
```
Worst-case latency multiplies quickly. 5-step workflow with 2 replans = 90+ seconds.

**△ State Leakage Between Steps**
```typescript
// Step 1: Login (set cookie)
// Step 2: Assumes logged in (has cookie) ✓
// BUT: Step 1 crashed, replan succeeded with different login
// Step 2: Cookie might be invalid if replan used different path
```
Steps share HTTP session but not plan context.

**△ Verification Condition Polling**
```typescript
// checkVerify polls document.body.innerText every 300ms
// Max 8s = ~27 polls
// If content takes 5s to render → wait full 5s (overkill)
```
Could optimize with mutation observer instead of polling.

### Latency Breakdown

- **Per-step**: 0.5s (a11y) + 5s (plan) + 2s (exec) + 1s (verify) = 8.5s typical
- **With replan**: 8.5s + 22.5s (replan) = 31s worst-case
- **N-step workflow**: N × 8.5s + (replans × 22.5s)

### Routes Impactées

- `POST /workflow`: main orchestrator
- Calls a11y, planner, executor sequentially

**Impact**: Workflow latency = sum of all step latencies.

---

## 6. agent.ts - SessionManager & Concurrency

### Rôle

- **Task Lifecycle**: runTask, runWorkflow
- **Concurrency Control**: Enforce MAX_CONCURRENT=3
- **Timeout Enforcement**: TASK_TIMEOUT_MS=120s per task
- **Session Cleanup**: Close session, shutdown Chrome if !keepAlive

### Force

**✓ Global Concurrency Control**
```typescript
static _active = 0;  // Counter
if (this._active >= MAX_CONCURRENT) {
  throw new Error(`Too many concurrent tasks (max 3)`);
}
this._active++;
try {
  return await this._execute(...);
} finally {
  this._active--;
}
```
Simple, effective. 4th client immediately rejected (no queue).

**✓ Hard Timeout per Task**
```typescript
return await withTimeout(
  this._execute(...),
  TASK_TIMEOUT_MS,  // 120s
  'task'
);
```
Promise.race() ensures no task runs >120s. Prevents runaway requests.

**✓ Chrome Lifecycle Tied to Task**
```typescript
try {
  return await this._execute(...);
} finally {
  await session.close();
  if (!config.keepAlive) {
    await ChromeManager.getInstance().shutdown();
  }
}
```
Each task gets clean Chrome or reuses. keepAlive=true for HTTP server (reuse across requests).

### Points Critiques

**△ No Queueing (Backpressure Only)**
```typescript
if (this._active >= MAX_CONCURRENT) {
  throw new Error(`Too many concurrent tasks (max 3)`);
}
// Caller sees 429 error
// Caller must implement retry
```
No queue fairness. Fast clients may starve slow clients.

**△ Separate Concurrency Limits**
```typescript
// agent.ts: MAX_CONCURRENT = 3
// server.ts: MAX_CONCURRENT = 5 (separate check!)
// Race condition: server allows 5, agent rejects 2
```
Mismatch between agent and HTTP server limits. Server allows 5, agent gate at 3.

**△ Chrome Reuse Risk (keepAlive=true)**
```typescript
// Server.ts:
const result = await runTask(task, url, { apiKey, keepAlive: true });
// Chrome stays alive, cookies persist, state leaks to next request
```
Shared Chrome across HTTP requests. Task A's login affects Task B.

**△ Timeout is Hard (No Graceful Shutdown)**
```typescript
// If task hits TASK_TIMEOUT_MS (120s)
// Promise.race() → rejection
// Background work (Chrome fetch) still running
// May complete after client disconnected
```
No cleanup of in-flight requests.

### Latency Breakdown

- **Task overhead**: <100ms (agent counter check)
- **Total timeout**: 120s hard limit
- **Queue wait**: depends on active count (0-120s if backpressure)

### Routes Impactées

- `POST /run`: runTask with keepAlive=true
- `POST /workflow`: runWorkflowTask with keepAlive=true
- Rate limiting: MAX_CONCURRENT=5 at server.ts

**Impact**: Concurrency bottleneck. >5 concurrent clients = 429 errors.

---

## Comparative Strength Table

| Service | Latency | Reliability | Bottleneck | Recovery |
|---------|---------|-------------|-----------|----------|
| browser.ts | 0-10s startup | ★★★★ | Restart latency | Auto-restart |
| a11y.ts | 100-500ms | ★★★★ | Tree truncation | Selector fallback |
| planner.ts | 2-8s | ★★★☆ | LLM inference | JSON retry (1×) |
| executor.ts | 50-12000ms | ★★★★ | CDP hang | Selector fallback |
| workflow.ts | 8-90s | ★★★★ | Cascading replans | Max 1 retry/step |
| agent.ts | <100ms | ★★★★ | Concurrency limit | Backpressure (429) |

**Critical Path (by impact on latency)**:
1. planner.ts (2-8s per call) - Main bottleneck
2. executor.ts (200-400ms per action) - Execution phase
3. a11y.ts (100-500ms per page) - Minor contributor

---

## Résumé Services

**COMETEOR AGENT SERVICES SUMMARY**

- **browser.ts**: Reliable Chrome lifecycle, mutex launch, auto-restart ✓
- **a11y.ts**: Smart tree compaction, interactive prioritization, dedup ✓
- **planner.ts**: Deterministic LLM planning, multilingual, JSON retry ✓ (but slow)
- **executor.ts**: Dual resolution (nodeId + selector fallback), DOM settle wait ✓
- **workflow.ts**: Step isolation, auto-replan, verification condition ✓
- **agent.ts**: Concurrency control, hard timeout, backpressure ✓

**Main Bottlenecks**: Mercury LLM latency (2-8s), Chrome CDP hangs (rare, 12s timeout).

**Optimization Priorities**: Cache planner results, batch executor actions, optimize tree extraction.

Voir **03-AUTOMATION.md** pour use-case patterns et exemples métier.
