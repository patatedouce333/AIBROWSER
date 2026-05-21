"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runWorkflow = runWorkflow;
const a11y_1 = require("./a11y");
const planner_1 = require("./planner");
const executor_1 = require("./executor");
async function runWorkflow(steps, client, config) {
    const cdp = client;
    const workflowStart = Date.now();
    const stepResults = [];
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const required = step.required !== false;
        const stepStart = Date.now();
        let replanned = false;
        let stepSuccess = false;
        let stepError;
        let finalUrl;
        try {
            if (step.url) {
                await cdp.Page.navigate({ url: step.url });
                await cdp.Page.loadEventFired();
                await sleep(400);
            }
            const context = await (0, a11y_1.extractPageContext)(cdp);
            const plan = await (0, planner_1.generatePlan)(step.task, context, config.apiKey, config.debug);
            const result = await (0, executor_1.executePlan)(plan, cdp, context);
            finalUrl = result.finalUrl;
            if (result.success) {
                if (step.verify) {
                    stepSuccess = await checkVerify(step.verify, cdp);
                    if (!stepSuccess)
                        stepError = `Verify condition not met: ${step.verify}`;
                }
                else {
                    stepSuccess = true;
                }
            }
            else {
                stepError = `Execution failed: ${result.steps.filter(s => !s.success).map(s => s.error).join('; ')}`;
            }
            if (!stepSuccess && required) {
                replanned = true;
                const context2 = await (0, a11y_1.extractPageContext)(cdp);
                const plan2 = await (0, planner_1.generatePlan)(step.task, context2, config.apiKey, config.debug);
                const result2 = await (0, executor_1.executePlan)(plan2, cdp, context2);
                finalUrl = result2.finalUrl;
                if (result2.success) {
                    if (step.verify) {
                        stepSuccess = await checkVerify(step.verify, cdp);
                        if (!stepSuccess)
                            stepError = `Verify condition not met after re-plan: ${step.verify}`;
                        else
                            stepError = undefined;
                    }
                    else {
                        stepSuccess = true;
                        stepError = undefined;
                    }
                }
                else {
                    stepError = `Re-plan execution failed: ${result2.steps.filter(s => !s.success).map(s => s.error).join('; ')}`;
                }
            }
        }
        catch (err) {
            stepError = err instanceof Error ? err.message : String(err);
            if (required && !replanned) {
                replanned = true;
                try {
                    const context2 = await (0, a11y_1.extractPageContext)(cdp);
                    const plan2 = await (0, planner_1.generatePlan)(step.task, context2, config.apiKey, config.debug);
                    const result2 = await (0, executor_1.executePlan)(plan2, cdp, context2);
                    finalUrl = result2.finalUrl;
                    if (result2.success) {
                        if (step.verify) {
                            stepSuccess = await checkVerify(step.verify, cdp);
                            if (!stepSuccess)
                                stepError = `Verify condition not met after re-plan: ${step.verify}`;
                            else
                                stepError = undefined;
                        }
                        else {
                            stepSuccess = true;
                            stepError = undefined;
                        }
                    }
                    else {
                        stepError = `Re-plan execution failed: ${result2.steps.filter(s => !s.success).map(s => s.error).join('; ')}`;
                    }
                }
                catch (err2) {
                    stepError = err2 instanceof Error ? err2.message : String(err2);
                }
            }
        }
        try {
            const { result: urlResult } = await cdp.Runtime.evaluate({
                expression: 'location.href',
                returnByValue: true,
            });
            finalUrl = urlResult.value ?? finalUrl;
        }
        catch { }
        stepResults.push({
            step: i + 1,
            task: step.task,
            success: stepSuccess,
            replanned,
            durationMs: Date.now() - stepStart,
            error: stepError,
            finalUrl,
        });
        if (!stepSuccess && required) {
            break;
        }
    }
    let workflowFinalUrl;
    if (stepResults.length > 0) {
        workflowFinalUrl = stepResults[stepResults.length - 1].finalUrl;
    }
    const allRequired = stepResults.every(r => {
        const originalStep = steps[r.step - 1];
        const req = originalStep.required !== false;
        return !req || r.success;
    });
    return {
        success: allRequired,
        steps: stepResults,
        totalMs: Date.now() - workflowStart,
        finalUrl: workflowFinalUrl,
    };
}
async function checkVerify(condition, client) {
    try {
        const { result } = await client.Runtime.evaluate({
            expression: `
        document.body.innerText.includes(${JSON.stringify(condition)}) ||
        !!document.querySelector(${JSON.stringify(condition)})
      `,
            returnByValue: true,
        });
        return result.value === true;
    }
    catch {
        return false;
    }
}
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
