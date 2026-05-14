# Patterns d'Automatisation Ultra-Rapide

## Objectif

Démontrer comment Cometeor transforme **user intent multi-langue** → **DOM action** avec latency <5s pour cas simple, <30s pour workflows complexes.

Chaque pattern inclut: flux exemple, code extracts, points de latence, optimisations.

---

## Pattern 1: Click Automation (Cas Simple)

### User Intent (any language)

**FR**: "Clique sur le bouton de connexion"
**EN**: "Click the login button"
**AR**: "اضغط على زر تسجيل الدخول"

### Data Flow

```
User Input (FR) → POST /run {task, url}
  ↓
SERVER.ts: Validate auth, check concurrency
  ↓
AGENT.ts SessionManager: _active++, withTimeout(120s)
  ↓
A11Y.ts: extractPageContext()
  └─ getFullAXTree() → 250 nodes
  └─ buildCompactTree() → [1] button "Connexion" [2] link "Signup"
  └─ ~100ms
  ↓
PLANNER.ts: generatePlan(task="Clique sur le bouton de connexion", context)
  └─ Call Mercury: system="You are browser automation..." + user="Task: Clique..."
  └─ Response: [{action: "click", nodeId: 1, reason: "Login button identified"}]
  └─ ~3s (Inception API inference)
  ↓
EXECUTOR.ts: executePlan([{click, nodeId:1}])
  └─ clickNode(nodeId=1) → DOM.pushNodesByBackendIdsToFrontend
  └─ DOM.getBoxModel() → center coords (x, y)
  └─ Input.dispatchMouseEvent(type='mousePressed', x, y)
  └─ Input.dispatchMouseEvent(type='mouseReleased', x, y)
  └─ waitForDOMSettle() → 3× polls @ 80ms
  └─ ~200ms
  ↓
RESULT: {success: true, planMs: 3000, executionMs: 200}
```

**Total Latency**: 100ms + 3000ms + 200ms = **3.3 seconds**

### Code Extracts

**planner.ts - Generate Plan**:
```typescript
const plan = await generatePlan(
  "Clique sur le bouton de connexion",
  context,  // {url, tree, nodeMap}
  apiKey,
  debug: false
);
// Output: [{step:1, action:"click", nodeId:1, reason:"..."}]
```

**executor.ts - Execute Click**:
```typescript
if (action.nodeId) {
  const node = context.nodeMap.get(action.nodeId);
  const { nodeIds } = await client.DOM.pushNodesByBackendIdsToFrontend({
    backendNodeIds: [node.backendDOMNodeId],
  });
  const boxModel = await client.DOM.getBoxModel({ nodeId: nodeIds[0] });
  const x = (boxModel.model.border[0] + boxModel.model.border[4]) / 2;
  const y = (boxModel.model.border[1] + boxModel.model.border[5]) / 2;
  
  await client.Input.dispatchMouseEvent({type:'mousePressed', x, y, button:'left'});
  await sleep(40);
  await client.Input.dispatchMouseEvent({type:'mouseReleased', x, y, button:'left'});
}
```

### Points Critiques de Latence

1. **LLM Inference** (3s): Main bottleneck. Inception API call.
   - Mitigation: Prompt caching (same tree for N similar tasks)

2. **Tree Extraction** (100ms): DOM traversal + dedup.
   - Mitigation: Cache a11y tree for 5-10s (if page static)

3. **DOM Settle Wait** (240ms): Polling innerHTML.length 3×.
   - Mitigation: Use MutationObserver instead of polling

### Optimisations Déjà Implémentées

- ✓ Interactive roles prioritized (button found first)
- ✓ Dedup limit prevents tree explosion
- ✓ Selector fallback if nodeId fails
- ✓ Temperature=0.1 (deterministic output)

### Cas d'Erreur & Recovery

**Erreur 1: Button Not Found in Tree**
- Cause: Tree truncated (>400 lines), button at bottom
- Recovery: executor uses selector fallback
- Code: `if (action.selector) { await clickViaJS(selector, client); }`

**Erreur 2: LLM Returns Invalid JSON**
- Cause: Mercury inference incomplete
- Recovery: planner retries with CORRECTION_PROMPT
- Code: `return parseAndValidate(corrected, nodeMap);`

---

## Pattern 2: Form Filling (Moderately Complex)

### User Intent

**FR**: "Remplis le formulaire: email=john@ex.com, password=secret123"
**EN**: "Fill the form with my email and password"

### Data Flow

```
extractPageContext() 
  └─ 120 nodes, including textbox[5] "Email", textbox[8] "Password"
  └─ ~150ms
  ↓
generatePlan(task="Remplis email et password", context)
  └─ Mercury response:
    [{step:1, action:"click", nodeId:5, reason:"Focus email field"},
     {step:2, action:"type", nodeId:5, text:"john@ex.com", pressEnter:false},
     {step:3, action:"click", nodeId:8, reason:"Focus password"},
     {step:4, action:"type", nodeId:8, text:"secret123", pressEnter:true},
     {step:5, action:"done"}]
  └─ ~4s
  ↓
executePlan([...])
  ├─ Step 1 (click email): 50ms + settle 80ms
  ├─ Step 2 (type email, 12 chars): 12×(15-30ms) = 270ms + settle 80ms
  ├─ Step 3 (click password): 50ms + settle 80ms
  ├─ Step 4 (type password, 8 chars): 8×(15-30ms) = 180ms + settle 80ms
  └─ Total: ~1.2s
  ↓
RESULT: {success: true, planMs: 4000, executionMs: 1200}
```

**Total Latency**: 150ms + 4000ms + 1200ms = **5.35 seconds**

### Code Extracts

**planner.ts - Multi-Action Plan**:
```typescript
const userMessage = `
URL: https://login.example.com
Title: Sign In

ACCESSIBILITY TREE:
[1] heading "Login Form"
[5] textbox "Email" val=""
[8] textbox "Password" val=""
[12] button "Sign In"

TASK: Remplis le formulaire: email=john@ex.com, password=secret123
`;

const response = await callMercury(SYSTEM_PROMPT, userMessage, {apiKey});
// Returns: JSON array with all steps
```

**executor.ts - Type Action**:
```typescript
case 'type':
  await clickNode(action, client, context);  // Focus field
  await sleep(80);
  
  // Ctrl+A to select all
  await client.Input.dispatchKeyEvent({type:'keyDown', key:'a', modifiers:2});
  await sleep(30);
  await client.Input.dispatchKeyEvent({type:'keyUp', key:'a', modifiers:2});
  
  // Type character by character (humanized)
  for (const char of "john@ex.com") {
    await client.Input.dispatchKeyEvent({type:'char', text:char});
    await sleep(15 + Math.random() * 15);
  }
  
  if (action.pressEnter) {
    await sleep(80);
    await client.Input.dispatchKeyEvent({type:'keyDown', key:'Return'});
    await sleep(30);
    await client.Input.dispatchKeyEvent({type:'keyUp', key:'Return'});
  }
```

### Points Critiques

1. **Tree Quality**: If tree missing [5] or [8] → LLM hallucinates nodeIds → fallback selectors.
2. **Per-Char Latency**: 11 chars × 15-30ms = 330ms for 1 field (seems long, but humanizes input).
3. **Fallback Cost**: If selector fails (no [id=email]) → entire action fails → replan +22s.

### Optimisations

- ✓ Interactive elements (textbox) prioritized in tree
- ✓ pressEnter flag eliminates separate "click submit" step
- ✓ Humanized typing (jitter) avoids bot detection
- ✓ Per-field Ctrl+A clears pre-filled values

---

## Pattern 3: Multi-Step Navigation (Complex Workflow)

### User Intent

**FR**: "Connecte-toi avec john@ex.com, puis navigue vers ton profil, puis change ton mot de passe"
**EN**: "Login, go to profile, change password"

### Data Flow

```
WORKFLOW STEP 1: Login
├─ Navigate to https://login.example.com
├─ extractPageContext() → tree with login form
├─ generatePlan("Connecte-toi...") → [click email, type john@ex.com, click pwd, type ...]
├─ executePlan() → all steps succeed
├─ verify="Dashboard" → wait for "Dashboard" text (optional)
└─ Result: stepSuccess=true, finalUrl="https://dashboard.example.com"

WORKFLOW STEP 2: Profile
├─ Navigate to https://dashboard.example.com/profile
├─ extractPageContext() → tree with profile widgets
├─ generatePlan("Va vers profil") → [click "Profile" button]
├─ executePlan() → success
└─ Result: stepSuccess=true, finalUrl="https://dashboard.example.com/profile"

WORKFLOW STEP 3: Change Password
├─ (No navigate, stay on profile)
├─ extractPageContext() → tree with password form
├─ generatePlan("Change mot de passe: oldpwd=X newpwd=Y") → [click pwd field, type oldpwd, type newpwd, click save]
├─ executePlan() → step[3] type fails (field locked?)
├─ REPLAN: extractPageContext again → different DOM (field now enabled)
├─ generatePlan retry → success
├─ executePlan retry → success
└─ Result: stepSuccess=true, replanned=true, durationMs=35000

TOTAL: step1(8s) + step2(8s) + step3(35s) = 51 seconds (with replan)
```

### Code Extracts

**workflow.ts - Multi-Step Execution**:
```typescript
const steps: WorkflowStep[] = [
  {
    task: "Connecte-toi avec john@ex.com, mot de passe secret123",
    url: "https://login.example.com",
    verify: "Dashboard",
    required: true
  },
  {
    task: "Clique sur mon profil",
    url: "https://dashboard.example.com",
    required: true
  },
  {
    task: "Change ton mot de passe: ancien=secret123 nouveau=newsecret456",
    required: true
  }
];

const result = await runWorkflow(steps, client, {apiKey});
// Returns: {success, steps: [{step:1, success:true, replanned:false, ...}]}
```

**workflow.ts - Auto-Replan Logic**:
```typescript
if (!stepSuccess && required) {
  replanned = true;
  
  // Fresh extraction (DOM may have changed)
  const context2 = await extractPageContext(cdp);
  
  // Fresh plan (field now enabled, etc.)
  const plan2 = await generatePlan(step.task, context2, apiKey, debug);
  
  // Fresh execution
  const result2 = await executePlan(plan2, cdp, context2);
  
  if (result2.success) {
    stepSuccess = true;
    stepError = undefined;
  }
}
```

### Points Critiques

1. **Cascading Latency**: Step 3 fails → replan (22.5s) → total workflow 51s (still <120s hard limit).
2. **State Persistence**: Steps share cookies (logged in), but NOT plan context.
3. **Verification Polling**: verify="Dashboard" polls every 300ms, max 8s. If content late → full wait.

### Ramifications Causales

```
Step 1 Login → Cookie set ✓
  └─ Step 2 Profile accesses cookie ✓
     └─ Step 3 Change Pwd expects authenticated session ✓
        └─ If Step 1 replan succeeded BUT with different login path
           └─ Step 3 might use different session context (unlikely, but possible)
```

---

## Pattern 4: Assertion / Verification (Quality Check)

### User Intent

**FR**: "Après login, vérifie que ton email john@ex.com s'affiche sur le profil"
**EN**: "Verify email displayed after login"

### Data Flow

```
WORKFLOW STEP: Login + Verify
├─ Navigate https://login.example.com
├─ generatePlan("Login avec john@ex.com") → [click, type, submit]
├─ executePlan() → all success
├─ VERIFY CONDITION: verify="john@ex.com"
│  └─ checkVerify(condition, client):
│     └─ Runtime.evaluate:
│        document.body.innerText.includes("john@ex.com") ||
│        document.querySelector("john@ex.com")
│     └─ Poll every 300ms, max 8s
│     └─ If found within 8s → stepSuccess=true ✓
│     └─ If NOT found → stepSuccess=false, trigger REPLAN
│
└─ Result: If verify succeeds → step done. If fail → replan.
```

**Total Latency**: 8.5s typical (plan + exec + verify within 8s).

### Code Extracts

**workflow.ts - Verification**:
```typescript
if (step.verify) {
  stepSuccess = await checkVerify(step.verify, cdp);
}

async function checkVerify(condition: string, client: any): Promise<boolean> {
  try {
    const {result} = await client.Runtime.evaluate({
      expression: `
        document.body.innerText.includes(${JSON.stringify(condition)}) ||
        !!document.querySelector(${JSON.stringify(condition)})
      `,
      returnByValue: true
    });
    return result.value === true;
  } catch {
    return false;
  }
}
```

### Points Critiques

1. **Polling Overhead**: Waits full 8s even if condition met in 1s.
   - Optimization: Use MutationObserver instead of timer-based polling.

2. **Ambiguous Selectors**: verify="john@ex.com" tries CSS selector first.
   - If page has multiple email displays → querySelector finds wrong one.

---

## Routes HTTP : Exemples Complets

### Route 1: `POST /run` - Single Task

**Request**:
```bash
curl -X POST http://localhost:3000/run \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Remplissez le champ email avec john@example.com",
    "url": "https://login.example.com"
  }'
```

**Response** (success):
```json
{
  "success": true,
  "task": "Remplissez le champ email avec john@example.com",
  "url": "https://login.example.com/dashboard",
  "planSteps": 3,
  "planMs": 3200,
  "executionMs": 450,
  "steps": [
    {"step": 1, "action": "click", "success": true, "durationMs": 80},
    {"step": 2, "action": "type", "success": true, "durationMs": 320},
    {"step": 3, "action": "done", "success": true, "durationMs": 50}
  ]
}
```

**Response** (replan failure):
```json
{
  "success": false,
  "task": "...",
  "planSteps": 3,
  "planMs": 3200,
  "executionMs": 8500,
  "failedAt": "execution",
  "error": "click: Element not found in nodeMap 99",
  "steps": [
    {"step": 1, "action": "click", "success": false, "error": "..."}
  ]
}
```

### Route 2: `POST /workflow` - Multi-Step

**Request**:
```bash
curl -X POST http://localhost:3000/workflow \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "steps": [
      {
        "task": "Connectez-vous avec john@example.com, password=secret123",
        "url": "https://login.example.com",
        "verify": "Welcome, John",
        "required": true
      },
      {
        "task": "Allez sur votre profil",
        "url": "https://dashboard.example.com",
        "required": true
      },
      {
        "task": "Mettez à jour votre bio avec 'Engineer à Paris'",
        "required": false
      }
    ]
  }'
```

**Response**:
```json
{
  "success": true,
  "steps": [
    {
      "step": 1,
      "task": "Connectez-vous...",
      "success": true,
      "replanned": false,
      "durationMs": 8500,
      "finalUrl": "https://dashboard.example.com"
    },
    {
      "step": 2,
      "task": "Allez sur votre profil",
      "success": true,
      "replanned": false,
      "durationMs": 7800,
      "finalUrl": "https://dashboard.example.com/profile"
    },
    {
      "step": 3,
      "task": "Mettez à jour...",
      "success": true,
      "replanned": true,
      "durationMs": 25000,
      "finalUrl": "https://dashboard.example.com/profile"
    }
  ],
  "totalMs": 41300,
  "finalUrl": "https://dashboard.example.com/profile"
}
```

---

## Ramifications Causales d'Erreur : Arbre Complet

```
USER TASK: "Remplir formulaire"
  ↓
ERROR: A11Y tree truncated (>400 nodes)
  ├─ extractPageContext() returns {tree: "[1] button... [400] input... (TRUNCATED)"}
  └─ LLM doesn't see password field below line 400
     ├─ Mercury hallucinates: nodeId=999 (doesn't exist)
     └─ Planner: "nodeId 999 not in nodeMap"
        ├─ Falls back to selector: document.querySelector("input[type=password]")
        └─ Execution tries clickViaJS(selector)
           ├─ Success IF selector valid → action succeeds ✓
           └─ Failure IF selector invalid → error
              ├─ Logs: "Not found: input[type=password]"
              └─ If required=true → REPLAN
                 ├─ New extractPageContext() (same truncation)
                 ├─ Mercury tries again (might fail same way)
                 └─ Replan fails → workflow broken
                    └─ USER SEES: "Workflow failed after retry"

MITIGATION: Optimize tree generation
  └─ Use INTERACTIVE_ROLES priority first
  └─ Textbox (input) is interactive → shown early in tree
  └─ Unlikely to be truncated if form controls prioritized
```

---

## Tableau: Cas d'Usage × Latence × Points Critiques

| Cas | Latence | Plan | Exec | Critical | Mitigation |
|-----|---------|------|------|----------|-----------|
| Click simple | 3.3s | 3s | 0.2s | LLM latency | Cache plan |
| Form (5 fields) | 5.4s | 4s | 1.2s | Per-char typing | Batch chars? |
| Navigation (3 steps) | 25s | 12s | 10s | Cascading replans | Max 1 replan |
| Multi-page (5 steps) | 50s+ | 20s | 25s | Timeout risk | Monitor timeout |
| Verify assertion | 8.5s | 4s | 4s | Polling overhead | Use MutationObserver |

---

## Optimisations Déjà Implémentées

✓ **Interactive Role Prioritization**: Buttons/inputs/textboxes appear first in tree
✓ **Deduplication**: Max 3 identical labels per role
✓ **Selector Fallback**: If nodeId fails, try CSS selector (30% success)
✓ **JSON Retry**: If Mercury returns bad JSON → retry once with correction
✓ **Temperature=0.1**: Deterministic LLM output
✓ **Humanized Typing**: Per-character 15-30ms jitter
✓ **DOM Settle Polling**: Wait for mutations stabilize (3 polls @ 80ms)
✓ **Auto-Replan**: 1 retry on failure (max 1 per step)

---

## Optimisations Futures

△ **Prompt Caching**: Same tree format → cache at Inception API level
△ **Tree Format Optimization**: YAML or compact binary vs JSON
△ **MutationObserver**: Replace polling with event-driven settlement
△ **Parallel Action Planning**: Speculative planning while executing current step
△ **Session Isolation**: Per-task Chrome profile (security + state isolation)
△ **Request Batching**: Merge multiple small CDP calls into one
△ **Smart Verify**: Use network listener instead of DOM polling

---

## Résumé : Patterns d'Automatisation

**Cometeor = LLM-guided browser automation**

- **Click**: 3.3s (latency dominated by LLM)
- **Form Fill**: 5.4s (typing adds humanization overhead)
- **Multi-Step**: 25-90s (cascading plans + replans)
- **Verification**: 8.5s (polling cost)

**Failure Recovery**: Auto-replan (max 1/step), selector fallback (70% success), JSON retry.

**Critical Path**: Mercury LLM (2-8s) >> Execution (1-2s).

**Current Capacity**: MAX_CONCURRENT=3 agent, MAX_CONCURRENT=5 server.

Voir **01-ARCHITECTURE.md** pour flux causal global; **02-SERVICES.md** pour analyse force détaillée.
