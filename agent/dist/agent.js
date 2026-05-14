"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTask = runTask;
exports.getActiveCount = getActiveCount;
exports.shutdown = shutdown;
const browser_1 = require("./browser");
const a11y_1 = require("./a11y");
const planner_1 = require("./planner");
const executor_1 = require("./executor");
const TASK_TIMEOUT_MS = 120000;
const MAX_CONCURRENT = 3;
class SessionManager {
    constructor() {
        this._active = 0;
    }
    static getInstance() {
        if (!SessionManager._instance)
            SessionManager._instance = new SessionManager();
        return SessionManager._instance;
    }
    get activeCount() { return this._active; }
    get atCapacity() { return this._active >= MAX_CONCURRENT; }
    async run(task, startUrl, config) {
        if (this._active >= MAX_CONCURRENT) {
            throw new Error(`Too many concurrent tasks (max ${MAX_CONCURRENT})`);
        }
        this._active++;
        try {
            return await withTimeout(this._execute(task, startUrl, config), TASK_TIMEOUT_MS, 'task');
        }
        finally {
            this._active--;
        }
    }
    async _execute(task, startUrl, config) {
        if (!config.apiKey)
            throw new Error('apiKey is required');
        await browser_1.ChromeManager.getInstance().ensureRunning();
        const session = await (0, browser_1.connectSession)(startUrl);
        const planStart = Date.now();
        let planMs = 0;
        try {
            console.log(`\nTask: "${task}"`);
            console.log(`URL: ${startUrl}\n`);
            console.log('Extracting accessibility tree...');
            const context = await (0, a11y_1.extractPageContext)(session.client);
            console.log(`  ${context.tree.split('\n').length} nodes`);
            console.log('Generating plan with Mercury...');
            let plan;
            try {
                plan = await (0, planner_1.generatePlan)(task, context, config.apiKey, config.debug);
            }
            catch (err) {
                const planMsFailed = Date.now() - planStart;
                return {
                    success: false,
                    task,
                    planSteps: 0,
                    planMs: planMsFailed,
                    executionMs: 0,
                    steps: [],
                    error: err.message,
                    failedAt: 'plan',
                };
            }
            planMs = Date.now() - planStart;
            console.log(`  Plan: ${plan.length} steps (${planMs}ms)\n`);
            plan.forEach(s => {
                const detail = s.nodeId
                    ? `node[${s.nodeId}]`
                    : (s.selector || s.url || s.text?.slice(0, 30) || '');
                console.log(`  ${s.step}. ${s.action} ${detail} — ${s.reason}`);
            });
            console.log('');
            console.log('Executing plan...');
            const execStart = Date.now();
            let result;
            try {
                result = await (0, executor_1.executePlan)(plan, session.client, context);
            }
            catch (err) {
                return {
                    success: false,
                    task,
                    planSteps: plan.length,
                    planMs,
                    executionMs: Date.now() - execStart,
                    steps: [],
                    error: err.message,
                    failedAt: 'execution',
                };
            }
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
        finally {
            await session.close();
            if (!config.keepAlive) {
                await browser_1.ChromeManager.getInstance().shutdown();
            }
        }
    }
}
async function runTask(task, startUrl, config) {
    return SessionManager.getInstance().run(task, startUrl, config);
}
function getActiveCount() {
    return SessionManager.getInstance().activeCount;
}
async function shutdown() {
    await browser_1.ChromeManager.getInstance().shutdown();
}
function withTimeout(p, ms, label) {
    return Promise.race([
        p,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
    ]);
}
