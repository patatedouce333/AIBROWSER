# COMETEOR - Architecture Technique Profonde

## Objectif Métier

**Ultra-automatisation rapide du navigateur**: Click, form fill, DOM interaction via Chrome DevTools Protocol (CDP). Temps cible : <5s par action simple, <30s par workflow complexe.

L'architecture répond à trois exigences critiques :
1. **Latence minimale** - Chaque milliseconde compte (plan + exécution)
2. **Fiabilité** - Auto-correction sur erreur (re-planning)
3. **Concurrence** - MAX_CONCURRENT=3 tâches parallèles, queueing

---

## Flux Causal Complet : User Task → Browser Action

```
┌─────────────────────────────────────────────────────────────────┐
│  USER INPUT (any language: FR, EN, AR, etc.)                     │
│  "Clique sur le bouton Login, puis remplis mon email"           │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. EXTRACTION CONTEXTE (a11y.ts: extractPageContext)            │
│     - getFullAXTree() via Chrome Accessibility API              │
│     - Conversion DOM → arbre sémantique compact                  │
│     - Map nodeId → backendDOMNodeId (résolution CDP)            │
│     └─ LATENCE: 100-500ms (DOM size dependent)                 │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. GENERATION PLAN (planner.ts: generatePlan)                   │
│     - Call Mercury LLM via Inception API                        │
│     - Input: URL + title + accessibility tree (compact)         │
│     - Output: JSON array [PlannedAction, ...]                   │
│     - Fallback: Retry avec correction prompt                    │
│     └─ LATENCE: 2-8s (LLM main bottleneck!)                    │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. EXECUTION PLAN (executor.ts: executePlan)                    │
│     - Pour chaque action (click, type, scroll, navigate)        │
│     - Dispatch via CDP (Input.dispatchMouseEvent, etc.)         │
│     - Fallback: CSS selector si nodeId échoue                   │
│     - Wait DOM settle: 3× polls @ 80ms                          │
│     └─ LATENCE: 50-12000ms par action                           │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. VERIFICATION & FEEDBACK                                      │
│     - Check final URL via Runtime.evaluate                      │
│     - Log latency, success/error par step                       │
│     - Return TaskResult → HTTP response                         │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  WORKFLOW MULTI-STEPS: Boucle (étape 1-4) × N steps            │
│  + Auto-replan si échec étape required=true                     │
└─────────────────────────────────────────────────────────────────┘
```

**Temps Total Estimé**:
- Simple click: 100ms (a11y) + 3s (plan) + 200ms (execute) = **3.3s**
- Form fill (5 champs): 100ms + 3s + 1.5s = **4.6s**
- 3-step workflow: 300ms + 9s + 2s = **11.3s**

---

## Ramifications Causales Imbriquées

### Chaîne 1: Qualité A11Y → Qualité Plan → Succès Exécution

**Impact**: Une A11Y tree incomplète (>400 nœuds?) lance 2 appels API LLM au lieu de 1 (replan).

Si extractPageContext timeout (10s) → Mercury reçoit tree vide → hallucination nodeIds → fallback selector → potentiel succès si 2e context plus riche.

### Chaîne 2: Latence Plan → Timeout Global

**Impact**: Plan latency est **sériel** (pas d'attente parallelisée). Mercury latency ~5s × MAX_CONCURRENT=3 clients = 15s queue latency pour 3e client.

TASK_TIMEOUT_MS=120s covers: 0.5s (a11y) + 5s (plan) + 2s (exec) + 15.5s (replan) = 22.5s ✓ safe.

### Chaîne 3: Chrome CDP Freeze → Cascade Timeout

**Impact**: Flakiness Chrome CDP cascade à tous les steps.

Worst case: Workflow 5 steps × 12s timeout/step = 60s. Si + 1 replan × (10s a11y + 5s plan + 12s exec) = 27s. TOTAL: 87s < 120s limit ✓ marginal.

---

## Services Clés : Strength Analysis

### 1. **browser.ts - ChromeManager**

**Force**: Singleton pattern, mutex launch, auto-restart on death detection.

**Rôle**: 
- Spawn Chrome headless with debugging port 9222
- Maintain single process across sessions
- Graceful shutdown via SIGTERM/SIGKILL

**Ramification**:
- ensureRunning() is mutex-protected (_launchPromise)
- Concurrent calls don't double-spawn ✓
- But no per-session isolation (all workflows share single Chrome)

### 2. **a11y.ts - Accessibility Tree Extractor**

**Force**: Semantic deduplication (max 3 identical labels), interactive role prioritization (buttons first), max 400-line compact output.

**Rôle**: 
- getFullAXTree() from Chrome Accessibility API
- Build nodeMap: counter++ → node reference
- Dedup per role to avoid collisions

**Ramification**:
- Tree size explosion (>1000 nodes) → truncated to 400 lines
- LLM doesn't see truncated elements → hallucination risk
- dedup limit prevents infinite loops

### 3. **planner.ts - Mercury LLM Planner**

**Force**: JSON retry with correction prompt, multilanguage task input, temperature=0.1 (deterministic).

**Rôle**: 
- Call Inception API (Mercury-2 model)
- 3× retry on 429/503 with exponential backoff
- Immediate fail on 401/403 (no auth retry)

**Latency Breakdown**: Network 500ms + Inference 2-5s + JSON parse 50ms = **2.5-5.5s total**.

**Ramification**:
- Main latency bottleneck in entire pipeline
- Rate limit (429) adds 1-2s backoff per retry
- Bad tree input → bad plan quality

### 4. **executor.ts - Action Executor**

**Force**: Atomic per-action timeout (12s, 20s for nav), DOM settle polling (3× @ 80ms), CSS selector fallback (30% failure recovery).

**Rôle**: 
- Sequential action dispatch (click, type, select, scroll, wait, navigate)
- Primary: nodeId → backendDOMNodeId → CDP resolution
- Fallback: document.querySelector() via Runtime.evaluate

**Ramification**:
- Sequential NOT concurrent (by design for reliability)
- Selector fallback saves ~30% failed actions
- DOM settle overhead: 240ms per action

### 5. **workflow.ts - Workflow Orchestrator**

**Force**: Step isolation (fresh context per step), auto-replan on failure (max 1 retry), verification condition (optional text/CSS check).

**Rôle**: 
- Multi-step, multi-page task chaining
- Per-step: navigate → extract → plan → execute → verify
- Replan trigger: stepSuccess=false AND required=true

**Ramification**:
- Each step is independent execution unit
- Carries state (cookies, localStorage)
- No plan sharing (fresh regeneration each step)

### 6. **agent.ts - SessionManager**

**Force**: Global concurrency control (MAX_CONCURRENT=3), per-task timeout (120s), graceful backpressure (429 on capacity).

**Rôle**: 
- Singleton session manager
- Track _active count (simple counter, not queue)
- Enforce TASK_TIMEOUT_MS hard limit

**Ramification**:
- No queue fairness (first-come-first-served at HTTP)
- 4th concurrent client immediately rejected
- Server.ts enforces separate MAX_CONCURRENT=5 limit

---

## Tableau Comparatif : Latency & Reliability

| Service | Latency | Reliability | Failure Mode | Recovery |
|---------|---------|-------------|--------------|----------|
| a11y.ts | 100-500ms | High | Tree timeout (10s) | Replan attempts fresh extract |
| planner.ts | 2-8s | Medium | LLM 429/503 | 3× retry with backoff |
| executor.ts | 50-12000ms | High | CDP timeout/error | CSS selector fallback |
| workflow.ts | variable | High | Step fail | Auto-replan once |
| agent.ts | sync | High | Capacity | 429 backpressure |
| browser.ts | 0-10s | High | Chrome death | Auto-restart ensureRunning |

**Critical Path**: planner.ts > executor.ts > a11y.ts (by latency impact).

---

## Points Critiques : Optimization Opportunities

1. **LLM Latency** (2-8s): Dominant bottleneck. Consider:
   - Prompt caching (same tree for similar tasks)
   - Smaller tree format (YAML vs JSON)

2. **Tree Truncation** (>400 lines): Hallucination risk. Consider:
   - Progressive tree building (interactive nodes first)
   - Adaptive limit based on tree complexity

3. **Sequential Actions**: DOM settle polling (240ms overhead). Consider:
   - Batch mutations detection (single poll after N actions)
   - Parallel action planning (speculative execution)

4. **Single Chrome Instance**: No session isolation. Consider:
   - Per-workflow Chrome profile or incognito tab
   - For security: each API key → separate Chrome process

---

## Routes HTTP Impactées

### `POST /run`
- Input: `{task: string, url: string}`
- Workflow: extractPageContext → generatePlan → executePlan
- Timeout: 125s (REQUEST_TIMEOUT_MS server-side)
- Rate limit: server.ts MAX_CONCURRENT=5

### `POST /workflow`  
- Input: `{steps: WorkflowStep[], apiKey?: string}`
- Workflow: runWorkflow (per-step loop)
- Timeout: 125s
- Rate limit: MAX_CONCURRENT=5

### `GET /health`
- Diagnostic: Chrome alive + active task count
- No data path impact

---

## Résumé Architecture

**Cometeor Agent = LLM Planner + Chrome Executor**

- **Latency Critical Path**: Mercury LLM (2-8s) >> Execution (1-2s)
- **Reliability**: Auto-replan on fail (max 1 retry/step), CSS selector fallback
- **Concurrency**: MAX_CONCURRENT=3 (agent) + MAX_CONCURRENT=5 (server) with backpressure
- **Failure Modes**: Tree truncation, LLM rate-limit, Chrome hang, CDP timeout
- **Recovery**: Replan extraction, retry backoff, selector fallback, auto-restart

Voir **02-SERVICES.md** pour force détaillée; **03-AUTOMATION.md** pour patterns métier.
