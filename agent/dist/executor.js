"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executePlan = executePlan;
const ACTION_TIMEOUT_MS = 12000;
const NAV_TIMEOUT_MS = 20000;
const DOM_SETTLE_POLL_MS = 80;
const DOM_SETTLE_STABLE_COUNT = 3;
async function executePlan(plan, client, context) {
    const steps = [];
    const start = Date.now();
    for (const action of plan) {
        if (action.action === 'done')
            break;
        const stepStart = Date.now();
        console.log(`  Step ${action.step}: ${action.action} — ${action.reason}`);
        try {
            await withTimeout(executeAction(action, client, context), action.action === 'navigate' ? NAV_TIMEOUT_MS : ACTION_TIMEOUT_MS, `action "${action.action}" step ${action.step}`);
            const durationMs = Date.now() - stepStart;
            steps.push({ step: action.step, action: action.action, success: true, durationMs });
            console.log(`    ✓ ${durationMs}ms`);
            await waitForDOMSettle(client);
        }
        catch (err) {
            const durationMs = Date.now() - stepStart;
            console.error(`    ✗ ${err.message}`);
            steps.push({ step: action.step, action: action.action, success: false, error: err.message, durationMs });
            if (action.selector) {
                try {
                    console.log(`    ↺ Retrying with CSS selector: ${action.selector}`);
                    await withTimeout(executeViaCSSSelector(action, client), ACTION_TIMEOUT_MS, 'selector fallback');
                    steps[steps.length - 1].success = true;
                    steps[steps.length - 1].error = undefined;
                    console.log(`    ✓ Fallback succeeded`);
                    await waitForDOMSettle(client);
                }
                catch (e2) {
                    console.error(`    ✗ Fallback also failed: ${e2.message}`);
                }
            }
        }
    }
    let finalUrl;
    try {
        const { result } = await client.Runtime.evaluate({
            expression: 'location.href',
            returnByValue: true,
        });
        finalUrl = result.value;
    }
    catch { }
    const successCount = steps.filter(s => s.success).length;
    return {
        success: successCount === steps.length,
        steps,
        totalMs: Date.now() - start,
        finalUrl,
    };
}
async function executeAction(action, client, context) {
    switch (action.action) {
        case 'navigate':
            await client.Page.navigate({ url: action.url });
            await client.Page.loadEventFired();
            await sleep(400);
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
async function clickNode(action, client, context) {
    if (action.nodeId) {
        const node = context.nodeMap.get(action.nodeId);
        if (!node?.backendDOMNodeId)
            throw new Error(`Node ${action.nodeId} has no backendDOMNodeId`);
        const { nodeIds } = await client.DOM.pushNodesByBackendIdsToFrontend({
            backendNodeIds: [node.backendDOMNodeId],
        });
        const nodeId = nodeIds[0];
        if (!nodeId)
            throw new Error(`Could not resolve nodeId for backend ${node.backendDOMNodeId}`);
        // Scroll element into view
        await client.DOM.scrollIntoViewIfNeeded({ nodeId }).catch(() => { });
        const { model } = await client.DOM.getBoxModel({ nodeId });
        if (!model)
            throw new Error('getBoxModel returned no model');
        // border quad: [x1,y1, x2,y2, x3,y3, x4,y4]
        const border = model.border;
        const x = (border[0] + border[4]) / 2;
        const y = (border[1] + border[5]) / 2;
        await client.Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await sleep(40);
        await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        return;
    }
    if (action.selector) {
        await clickViaJS(action.selector, client);
        return;
    }
    throw new Error('click requires nodeId or selector');
}
async function typeInNode(action, client, context) {
    if (!action.text)
        throw new Error('type action requires text');
    await clickNode(action, client, context);
    await sleep(80);
    // Ctrl+A to select all (modifiers: 2 = Ctrl on Linux/Windows)
    await client.Input.dispatchKeyEvent({ type: 'keyDown', key: 'a', modifiers: 2 });
    await sleep(30);
    await client.Input.dispatchKeyEvent({ type: 'keyUp', key: 'a', modifiers: 2 });
    await sleep(20);
    for (const char of action.text) {
        await client.Input.dispatchKeyEvent({ type: 'char', text: char });
        await sleep(15 + Math.random() * 15);
    }
    if (action.pressEnter) {
        await sleep(80);
        await client.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Return' });
        await sleep(30);
        await client.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Return' });
    }
}
async function selectOption(action, client, context) {
    if (!action.nodeId)
        throw new Error('select requires nodeId');
    const node = context.nodeMap.get(action.nodeId);
    if (!node?.backendDOMNodeId)
        throw new Error(`Node ${action.nodeId} has no backendDOMNodeId`);
    const { nodeIds } = await client.DOM.pushNodesByBackendIdsToFrontend({
        backendNodeIds: [node.backendDOMNodeId],
    });
    const nodeId = nodeIds[0];
    if (!nodeId)
        throw new Error('Could not resolve DOM nodeId');
    const { object } = await client.DOM.resolveNode({ nodeId });
    await client.Runtime.callFunctionOn({
        functionDeclaration: `function(v) { this.value = v; this.dispatchEvent(new Event('change', {bubbles:true})); }`,
        arguments: [{ value: action.text ?? '' }],
        objectId: object.objectId,
    });
}
async function scroll(action, client) {
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
async function waitForCondition(action, client) {
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
            if (result.value === true)
                return;
        }
        catch { }
        await sleep(300);
    }
    throw new Error(`Wait timeout: condition not found after ${timeout}ms`);
}
async function executeViaCSSSelector(action, client) {
    const selector = action.selector;
    if (action.action === 'click') {
        await clickViaJS(selector, client);
    }
    else if (action.action === 'type' && action.text) {
        const { exceptionDetails } = await client.Runtime.evaluate({
            expression: `
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('Element not found: ' + ${JSON.stringify(selector)});
        el.scrollIntoView({block:'center'});
        el.focus();
        el.value = ${JSON.stringify(action.text)};
        el.dispatchEvent(new Event('input', {bubbles:true}));
        el.dispatchEvent(new Event('change', {bubbles:true}));
        true
      `,
            returnByValue: true,
        });
        if (exceptionDetails)
            throw new Error(exceptionDetails.text || 'JS evaluation failed');
    }
}
async function clickViaJS(selector, client) {
    const { exceptionDetails } = await client.Runtime.evaluate({
        expression: `
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('Not found: ' + ${JSON.stringify(selector)});
      el.scrollIntoView({block:'center'});
      el.click();
      true
    `,
        returnByValue: true,
    });
    if (exceptionDetails)
        throw new Error(exceptionDetails.text || 'clickViaJS failed');
}
async function waitForDOMSettle(client) {
    let stableCount = 0;
    let lastHtml = '';
    while (stableCount < DOM_SETTLE_STABLE_COUNT) {
        await sleep(DOM_SETTLE_POLL_MS);
        try {
            const { result } = await client.Runtime.evaluate({
                expression: 'document.documentElement.innerHTML.length',
                returnByValue: true,
            });
            const current = String(result.value);
            if (current === lastHtml) {
                stableCount++;
            }
            else {
                stableCount = 0;
                lastHtml = current;
            }
        }
        catch {
            break;
        }
    }
}
function withTimeout(p, ms, label) {
    return Promise.race([
        p,
        sleep(ms).then(() => { throw new Error(`Timeout ${ms}ms: ${label}`); }),
    ]);
}
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
