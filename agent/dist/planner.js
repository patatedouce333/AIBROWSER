"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePlan = generatePlan;
const ai_client_1 = require("./ai-client");
const SYSTEM_PROMPT = `You are a browser automation agent. You receive:
1. The current page URL and title
2. A compact accessibility tree: each node is [ID] role "name"
3. A task to complete

Generate a COMPLETE action plan as a JSON array — ALL steps needed, not just the first one.
The plan executes sequentially with no further LLM calls.

Action types and required fields:
- click:    { "action": "click",    "nodeId": <number>, "reason": "..." }
- type:     { "action": "type",     "nodeId": <number>, "text": "...", "pressEnter": true/false, "reason": "..." }
- select:   { "action": "select",   "nodeId": <number>, "text": "<value>", "reason": "..." }
- scroll:   { "action": "scroll",   "direction": "down"|"up", "amount": 400, "reason": "..." }
- wait:     { "action": "wait",     "condition": "<text or CSS selector>", "timeoutMs": 5000, "reason": "..." }
- navigate: { "action": "navigate", "url": "https://...", "reason": "..." }
- done:     { "action": "done",     "reason": "Task complete" }

Rules:
- Use nodeId from [ID] in the tree whenever possible
- Add selector as CSS fallback when nodeId might be ambiguous
- Set pressEnter: true for search/submit inputs
- End every plan with a "done" step
- Number steps with "step": 1, 2, 3...

Return ONLY a valid JSON array. No markdown, no explanation.`;
const CORRECTION_PROMPT = `Your previous response was not valid JSON.
Return ONLY a valid JSON array of action objects, nothing else.
No \`\`\`json fences, no explanation, just the array.`;
async function generatePlan(task, context, apiKey, debug = false) {
    const userMessage = `URL: ${context.url}\nTitle: ${context.title}\n\nACCESSIBILITY TREE:\n${context.tree}\n\nTASK: ${task}`;
    if (debug) {
        console.log('[planner] Sending to Mercury:');
        console.log('  task:', task);
        console.log('  tree lines:', context.tree.split('\n').length);
    }
    const response = await (0, ai_client_1.callMercury)(SYSTEM_PROMPT, userMessage, { apiKey, temperature: 0.1, maxTokens: 4096 });
    // Attempt parse
    try {
        return parseAndValidate(response, context.nodeMap);
    }
    catch (firstErr) {
        console.warn('[planner] JSON parse failed, retrying with correction prompt...');
        // One retry with correction
        const corrected = await (0, ai_client_1.callMercury)(CORRECTION_PROMPT, `Original response:\n${response}\n\nFix it and return only the JSON array.`, { apiKey, temperature: 0, maxTokens: 4096 });
        try {
            return parseAndValidate(corrected, context.nodeMap);
        }
        catch (secondErr) {
            throw new Error(`Plan parsing failed after retry: ${secondErr.message}\nRaw: ${response.slice(0, 300)}`);
        }
    }
}
function parseAndValidate(raw, nodeMap) {
    // Strip markdown fences
    let json = raw.trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
    // Find first JSON array (greedy-safe: match balanced brackets)
    const start = json.indexOf('[');
    if (start === -1)
        throw new Error('No JSON array found in response');
    let depth = 0;
    let end = -1;
    for (let i = start; i < json.length; i++) {
        if (json[i] === '[')
            depth++;
        else if (json[i] === ']') {
            depth--;
            if (depth === 0) {
                end = i;
                break;
            }
        }
    }
    if (end === -1)
        throw new Error('Unbalanced JSON array in response');
    const steps = JSON.parse(json.slice(start, end + 1));
    if (!Array.isArray(steps))
        throw new Error('Response is not a JSON array');
    const valid = [];
    for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        if (!s || typeof s !== 'object')
            continue;
        if (!s.action)
            continue;
        const step = {
            step: i + 1,
            action: s.action,
            reason: s.reason ?? `Step ${i + 1}`,
        };
        if (s.nodeId !== undefined) {
            const id = Number(s.nodeId);
            if (nodeMap.has(id)) {
                step.nodeId = id;
            }
            else {
                console.warn(`[planner] nodeId ${id} not in nodeMap (hallucinated?), using selector fallback`);
            }
        }
        if (s.selector)
            step.selector = String(s.selector);
        if (s.text)
            step.text = String(s.text);
        if (s.url)
            step.url = String(s.url);
        if (s.direction)
            step.direction = s.direction === 'up' ? 'up' : 'down';
        if (s.amount)
            step.amount = Number(s.amount);
        if (s.condition)
            step.condition = String(s.condition);
        if (s.timeoutMs)
            step.timeoutMs = Number(s.timeoutMs);
        if (s.pressEnter !== undefined)
            step.pressEnter = Boolean(s.pressEnter);
        valid.push(step);
    }
    if (valid.length === 0)
        throw new Error('Plan is empty after validation');
    return valid;
}
