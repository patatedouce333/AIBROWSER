import { PlannedAction } from './planner';
import { PageContext, extractPageContext } from './a11y';

export interface StepResult {
  step: number;
  action: string;
  success: boolean;
  error?: string;
  durationMs: number;
}

export interface ExecutionResult {
  success: boolean;
  steps: StepResult[];
  totalMs: number;
  finalUrl?: string;
}

export async function executePlan(
  plan: PlannedAction[],
  client: any,
  context: PageContext
): Promise<ExecutionResult> {
  const steps: StepResult[] = [];
  const start = Date.now();

  for (const action of plan) {
    if (action.action === 'done') break;

    const stepStart = Date.now();
    console.log(`  Step ${action.step}: ${action.action} — ${action.reason}`);

    try {
      await executeAction(action, client, context);
      const durationMs = Date.now() - stepStart;
      steps.push({ step: action.step, action: action.action, success: true, durationMs });
      console.log(`    ✓ ${durationMs}ms`);

      // Quick DOM stabilization wait (not a screenshot — just a tick)
      await sleep(150);

    } catch (err: any) {
      const durationMs = Date.now() - stepStart;
      console.error(`    ✗ ${err.message}`);
      steps.push({ step: action.step, action: action.action, success: false, error: err.message, durationMs });

      // On failure: try CSS selector fallback before giving up
      if (action.selector) {
        try {
          console.log(`    ↺ Retrying with CSS selector: ${action.selector}`);
          await executeViaCSSSelector(action, client);
          steps[steps.length - 1].success = true;
          steps[steps.length - 1].error = undefined;
          console.log(`    ✓ Fallback succeeded`);
        } catch (e2: any) {
          // Step failed — continue to next step (best-effort)
          console.error(`    ✗ Fallback also failed: ${e2.message}`);
        }
      }
    }
  }

  // Get final URL
  let finalUrl: string | undefined;
  try {
    const { result } = await client.Runtime.evaluate({
      expression: 'location.href',
      returnByValue: true,
    });
    finalUrl = result.value;
  } catch {}

  const successCount = steps.filter(s => s.success).length;
  return {
    success: successCount === steps.length,
    steps,
    totalMs: Date.now() - start,
    finalUrl,
  };
}

async function executeAction(action: PlannedAction, client: any, context: PageContext): Promise<void> {
  switch (action.action) {
    case 'navigate':
      await client.Page.navigate({ url: action.url });
      await client.Page.loadEventFired();
      await sleep(500);
      break;

    case 'click':
      await clickNode(action, client, context);
      break;

    case 'type':
      await typeInNode(action, client, context);
      break;

    case 'select':
      await selectOption(action, client, context);
      break;

    case 'scroll':
      await scroll(action, client);
      break;

    case 'wait':
      await waitForCondition(action, client);
      break;

    default:
      throw new Error(`Unknown action type: ${action.action}`);
  }
}

async function clickNode(action: PlannedAction, client: any, context: PageContext): Promise<void> {
  if (action.nodeId) {
    const node = context.nodeMap.get(action.nodeId);
    if (!node?.backendDOMNodeId) throw new Error(`Node ${action.nodeId} has no backendDOMNodeId`);

    // Resolve to DOM node
    const { nodeId } = await client.DOM.pushNodesByBackendIdsToFrontend({
      backendNodeIds: [node.backendDOMNodeId],
    }).then((r: any) => ({ nodeId: r.nodeIds[0] }));

    // Get bounding box
    const { model } = await client.DOM.getBoxModel({ nodeId });
    const content = model.content;
    const x = (content[0] + content[2]) / 2;
    const y = (content[1] + content[5]) / 2;

    await client.Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(30);
    await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    return;
  }

  if (action.selector) {
    await clickViaJS(action.selector, client);
    return;
  }

  throw new Error('click requires nodeId or selector');
}

async function typeInNode(action: PlannedAction, client: any, context: PageContext): Promise<void> {
  if (!action.text) throw new Error('type action requires text');

  // Click the element first
  await clickNode(action, client, context);
  await sleep(80);

  // Clear existing content
  await client.Input.dispatchKeyEvent({ type: 'keyDown', key: 'a', modifiers: 4 }); // Ctrl+A
  await sleep(30);

  // Type each character
  for (const char of action.text) {
    await client.Input.dispatchKeyEvent({ type: 'char', text: char });
    await sleep(20 + Math.random() * 20); // slight variation
  }

  // Press Enter if it looks like a search/submit
  if (action.text && (action.reason.toLowerCase().includes('search') || action.reason.toLowerCase().includes('submit'))) {
    await sleep(100);
    await client.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Return' });
    await sleep(30);
    await client.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Return' });
  }
}

async function selectOption(action: PlannedAction, client: any, context: PageContext): Promise<void> {
  if (action.nodeId) {
    const node = context.nodeMap.get(action.nodeId);
    if (node?.backendDOMNodeId) {
      const { nodeId } = await client.DOM.pushNodesByBackendIdsToFrontend({
        backendNodeIds: [node.backendDOMNodeId],
      }).then((r: any) => ({ nodeId: r.nodeIds[0] }));

      await client.Runtime.callFunctionOn({
        functionDeclaration: `function(v) { this.value = v; this.dispatchEvent(new Event('change', {bubbles:true})); }`,
        arguments: [{ value: action.text }],
        objectId: (await client.DOM.resolveNode({ nodeId })).object.objectId,
      });
      return;
    }
  }
  throw new Error('select requires a valid nodeId');
}

async function scroll(action: PlannedAction, client: any): Promise<void> {
  const amount = action.amount ?? 300;
  const delta = action.direction === 'up' ? -amount : amount;
  await client.Input.dispatchMouseEvent({
    type: 'mouseWheel',
    x: 400,
    y: 400,
    deltaX: 0,
    deltaY: delta,
  });
  await sleep(200);
}

async function waitForCondition(action: PlannedAction, client: any): Promise<void> {
  const timeout = action.timeoutMs ?? 8000;
  const condition = action.condition ?? '';
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    try {
      const { result } = await client.Runtime.evaluate({
        expression: `
          document.body.innerText.includes(${JSON.stringify(condition)}) ||
          !!document.querySelector(${JSON.stringify(condition)})
        `,
        returnByValue: true,
      });
      if (result.value === true) return;
    } catch {}
    await sleep(300);
  }
  throw new Error(`Wait timeout: "${condition}" not found after ${timeout}ms`);
}

async function executeViaCSSSelector(action: PlannedAction, client: any): Promise<void> {
  const selector = action.selector!;
  if (action.action === 'click') {
    await clickViaJS(selector, client);
  } else if (action.action === 'type' && action.text) {
    await client.Runtime.evaluate({
      expression: `
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('Element not found: ${selector}');
        el.focus();
        el.value = ${JSON.stringify(action.text)};
        el.dispatchEvent(new Event('input', {bubbles:true}));
        el.dispatchEvent(new Event('change', {bubbles:true}));
      `,
    });
  }
}

async function clickViaJS(selector: string, client: any): Promise<void> {
  const { exceptionDetails } = await client.Runtime.evaluate({
    expression: `
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('Not found: ${selector}');
      el.scrollIntoView({block:'center'});
      el.click();
      true
    `,
    returnByValue: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.text);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
