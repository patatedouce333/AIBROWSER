"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePlan = generatePlan;
const ai_client_1 = require("./ai-client");
const SYSTEM_PROMPT = `You are a browser automation agent. You receive:
1. The current page URL and title
2. A compact accessibility tree where each node has [ID] role "name"
3. A task to complete

Your job: generate a COMPLETE action plan as a JSON array.
Generate ALL steps needed to complete the task — do NOT stop at one step.
The plan will be executed sequentially without further LLM calls.

Action types:
- click: { action: "click", nodeId: <id>, reason: "..." }
- type: { action: "type", nodeId: <id>, text: "...", reason: "..." }
- select: { action: "select", nodeId: <id>, text: "<option value>", reason: "..." }
- scroll: { action: "scroll", direction: "down"|"up", amount: 300, reason: "..." }
- wait: { action: "wait", condition: "<text or selector to wait for>", timeoutMs: 5000, reason: "..." }
- navigate: { action: "navigate", url: "https://...", reason: "..." }
- done: { action: "done", reason: "Task complete" }

Rules:
- Always use nodeId when possible (from the [ID] in the tree)
- Use CSS selector as fallback if no nodeId works
- Add a "done" step at the end
- Be specific: if the task is "search for X", include click on search box, type X, and press Enter
- For forms: fill all fields before submitting
- Number each step with "step": 1, 2, 3...

Return ONLY the JSON array, no explanation, no markdown fences.`;
async function generatePlan(task, context, apiKey) {
    const userMessage = `URL: ${context.url}
Title: ${context.title}

ACCESSIBILITY TREE:
${context.tree}

TASK: ${task}`;
    const response = await (0, ai_client_1.callMercury)(SYSTEM_PROMPT, userMessage, {
        apiKey,
        temperature: 0.1,
        maxTokens: 4096,
    });
    return parsePlan(response);
}
function parsePlan(response) {
    // Strip markdown fences if present
    let json = response.trim();
    json = json.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    // Extract first JSON array
    const match = json.match(/\[[\s\S]*\]/);
    if (!match) {
        throw new Error(`No JSON array in Mercury response:\n${response.slice(0, 200)}`);
    }
    const steps = JSON.parse(match[0]);
    return steps.map((s, i) => ({ step: i + 1, ...s }));
}
