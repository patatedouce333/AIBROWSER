"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTask = runTask;
exports.shutdown = shutdown;
const browser_1 = require("./browser");
const a11y_1 = require("./a11y");
const planner_1 = require("./planner");
const executor_1 = require("./executor");
let chromeRunning = false;
async function runTask(task, startUrl, config) {
    const planStart = Date.now();
    if (!config.apiKey)
        throw new Error('apiKey is required');
    // Launch Chrome if not already running
    if (!chromeRunning) {
        await (0, browser_1.launchChrome)();
        chromeRunning = true;
    }
    const session = await (0, browser_1.connectSession)(startUrl);
    try {
        console.log(`\nTask: "${task}"`);
        console.log(`URL: ${startUrl}\n`);
        // 1. Extract accessibility tree (no screenshot — fast)
        console.log('Extracting accessibility tree...');
        const context = await (0, a11y_1.extractPageContext)(session.client);
        console.log(`  ${context.tree.split('\n').length} nodes extracted`);
        // 2. ONE LLM call — generate complete plan
        console.log('Generating plan with Mercury...');
        const plan = await (0, planner_1.generatePlan)(task, context, config.apiKey);
        const planMs = Date.now() - planStart;
        console.log(`  Plan: ${plan.length} steps (${planMs}ms)\n`);
        plan.forEach(s => {
            const detail = s.nodeId ? `node[${s.nodeId}]` : (s.selector || s.url || s.text?.slice(0, 30) || '');
            console.log(`  ${s.step}. ${s.action} ${detail} — ${s.reason}`);
        });
        console.log('');
        // 3. Execute plan locally — no more LLM calls
        console.log('Executing plan...');
        const execStart = Date.now();
        const result = await (0, executor_1.executePlan)(plan, session.client, context);
        const executionMs = Date.now() - execStart;
        console.log(`\nDone in ${result.totalMs}ms (plan: ${planMs}ms, exec: ${executionMs}ms)`);
        console.log(`${result.steps.filter(s => s.success).length}/${result.steps.length} steps succeeded`);
        return {
            success: result.success,
            task,
            url: result.finalUrl,
            planSteps: plan.length,
            planMs,
            executionMs,
            steps: result.steps,
        };
    }
    catch (err) {
        return {
            success: false,
            task,
            planSteps: 0,
            planMs: 0,
            executionMs: 0,
            steps: [],
            error: err.message,
        };
    }
    finally {
        await session.close();
        if (!config.keepAlive) {
            await (0, browser_1.killChrome)();
            chromeRunning = false;
        }
    }
}
async function shutdown() {
    await (0, browser_1.killChrome)();
    chromeRunning = false;
}
