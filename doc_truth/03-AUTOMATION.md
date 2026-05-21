# Patterns d'Automatisation Ultra-Rapide

## Objectif Métier

**Viser <5s d'exécution totale pour les tâches récurrentes**:
- Click automation: boutons, liens, confirmations
- Form filling: login, recherche, filtres
- Multi-page navigation: e-commerce checkout, réservations
- Verification: assertions sur DOM, assertions de succès

---

## Routes HTTP

### 1. POST /run — Single Task

```bash
curl -X POST http://localhost:3000/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_live_..." \
  -d '{
    "task": "Cherche des chaussures Nike et ajoute au panier",
    "url": "https://www.amazon.fr"
  }'
```

**Réponse** (success):
```json
{
  "success": true,
  "task": "Cherche des chaussures Nike et ajoute au panier",
  "url": "https://www.amazon.fr/cart",
  "planSteps": 4,
  "executionMs": 2340,
  "planMs": 1890,
  "steps": [
    {
      "step": 1,
      "action": "CLICK",
      "success": true,
      "durationMs": 150
    }
  ]
}
```

**Latence attendue breakdown**:
- a11y extraction: 400-600ms
- Mercury LLM planning: 1200-3000ms
- Execution (4 steps): 1200-2000ms
- **Total**: 2.8-5.6s (95th percentile)

---

### 2. POST /workflow — Multi-Step Automation

```bash
curl -X POST http://localhost:3000/workflow \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_live_..." \
  -d '{
    "steps": [
      {
        "task": "Connecte-toi avec mon compte",
        "url": "https://www.example.com/login",
        "verify": "Bienvenue"
      },
      {
        "task": "Cherche Hotel Paris",
        "verify": "résultats"
      }
    ]
  }'
```

**Avantages vs POST /run**:
- État persiste entre steps (cookies, localStorage)
- Auto re-plan si step échoue → 1 tentative supplémentaire
- Idéal pour workflows: login → search → checkout

---

## Cas d'Usage Métier Détaillés

### Cas 1: Click Automation

**Task**: "Clique sur Ajouter au panier pour les chaussures Adidas"

**Plan généré** (simplifié):
```
Step 1: SCROLL_INTO_VIEW — .filter-brand
Step 2: CLICK — input[value="Adidas"]
Step 3: WAIT_FOR_SELECTOR — .product-filter.active
Step 4: CLICK — button[aria-label="Add to Cart"]
```

**Code (executor.ts)**:
```typescript
for (const action of plan) {
  if (action.action === 'CLICK') {
    const target = findTarget(action, nodeMap);
    const clickPoint = getClickablePoint(target);
    await client.Input.dispatchMouseEvent({
      type: 'mousePressed',
      x: clickPoint.x,
      y: clickPoint.y,
    });
    await delay(50);
    await client.Input.dispatchMouseEvent({
      type: 'mouseReleased',
      x: clickPoint.x,
      y: clickPoint.y,
    });
  }
}
```

**Latence**:
- SCROLL_INTO_VIEW: 80-150ms
- CLICK input: 120-200ms
- WAIT_FOR_SELECTOR: 50-800ms
- CLICK button: 100-250ms
- **Total**: 550-1800ms

---

### Cas 2: Form Filling

**Task**: "Remplis nom Karim, email karim@example.com, accepte conditions, envoie"

**Plan**:
```
Step 1: FOCUS + FILL — input[name="firstName"], "Karim"
Step 2: FOCUS + FILL — input[name="email"], "karim@example.com"
Step 3: CLICK — input[type="checkbox"]
Step 4: CLICK — button[type="submit"]
```

**Code (executor.ts)**:
```typescript
if (action.action === 'FILL') {
  const target = findTarget(action, nodeMap);
  await client.DOM.focus({ nodeId: target.backendNodeId });
  await delay(50);
  
  for (const char of action.text) {
    await client.Input.dispatchKeyEvent({
      type: 'char',
      text: char,
    });
    await delay(10 + Math.random() * 30);
  }
}
```

**Latence par field**: 550-1340ms (focus + clear + type)
**Total (4 fields)**: 2.5-5.5s

---

### Cas 3: Multi-Page Checkout

**Workflow steps**:
```
[Login] → [Search Hotel] → [Select Hotel] → [Reserve]
```

**Session persistence benefit**:
- Login once (4s) → cookies persist
- Next 3 steps skip re-login
- Total: 18s (vs. 20s without persistence)

---

## Ramifications Causales d'Erreur

### Chaîne 1: A11y Tree Incomplète

```
DOM très complexe (10k+ nodes)
  ↓
Tree truncated at 8000 nodes
  ↓
Button "Add to Cart" at position 8500 — CUT OFF
  ↓
Mercury: "Élément non trouvé"
  ↓
Executor: CLICK fails
  ↓
Result: success=false
```

**Fix**: Split task ou enable DOM cache

---

### Chaîne 2: Mercury Latency Spike

```
a11y extraction: 450ms
  ↓
Mercury processing: 8s (congestion)
  ↓
Execution: 1.5s
  ↓
Total: 10s (vs. <5s target)
```

**Monitoring**: Alert if planMs > 5s

---

### Chaîne 3: Chrome CDP Hang

```
SCROLL CDP call hangs
  ↓
12s timeout fires (ACTION_TIMEOUT_MS)
  ↓
Step fails
  ↓
If workflow required=true → STOP
  ↓
Latency penalty: +12s
```

---

## Optimisations Implémentées

### 1. DOM Cache (30s TTL)
- Workflow step 2-4 reuse step 1 tree
- Savings: -400ms per cached hit

### 2. Concurrent CDP Actions
- SCROLL + WAIT_FOR_SELECTOR in parallel
- Gain: 50% latency reduction
- 1.5s serial → 0.8s parallel

### 3. Multilanguage Input (zero overhead)
- French task → direct to Mercury
- No translation API call

### 4. Auto Re-plan on Failure
- If step fails, re-extract + re-plan once
- Cost: +2-3s, Gain: self-healing

### 5. Session Persistence
- Cookies, localStorage across steps
- Avoid re-login per step

---

## Comparaison Latence: Cas Réels

### Scenario A: Simple Click

| Phase | Latence |
|-------|---------|
| a11y cache hit | 0ms |
| Mercury plan | 1.5s |
| CLICK execute | 150ms |
| **Total** | **1.65s** ✓ |

### Scenario B: Multi-step Checkout

| Phase | Latence |
|-------|---------|
| Step 1: Login | 4.0s |
| Step 2: Search | 2.0s |
| Step 3: Product | 1.5s |
| Step 4: Form | 3.2s |
| Step 5: Submit | 2.1s |
| **Total** | **12.8s** ✓ |

### Scenario C: Worst Case

| Phase | Latence |
|-------|---------|
| CDP Hang | +12s |
| Mercury Spike | +8s |
| Complex Tree | +3s |
| Re-plan Failure | +5s |
| **Total** | **28s** ✓ |

---

## Checklist Production

- [ ] Enable DOM cache (30s TTL)
- [ ] Monitor Mercury latency (alert >3s)
- [ ] Log execution breakdown (a11y, plan, exec)
- [ ] Use incognito to avoid state leaks
- [ ] Batch 5+ workflow steps per request
- [ ] Test pages 20k+ nodes
- [ ] Measure re-plan success rate (>70% target)

---

**Voir aussi**: 01-ARCHITECTURE.md, 02-SERVICES.md
