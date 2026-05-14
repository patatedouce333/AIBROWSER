import { extractPageContext } from './a11y';
import { generatePlan } from './planner';
import { executePlan } from './executor';

export interface WorkflowStep {
  task: string;
  url?: string;
  verify?: string;
  required?: boolean;
}

export interface WorkflowStepResult {
  step: number;
  task: string;
  success: boolean;
  replanned: boolean;
  durationMs: number;
  error?: string;
  finalUrl?: string;
}

export interface WorkflowResult {
  success: boolean;
  steps: WorkflowStepResult[];
  totalMs: number;
  finalUrl?: string;
}

export async function runWorkflow(
  steps: WorkflowStep[],
  client: unknown,
  config: { apiKey: string; debug?: boolean }
): Promise<WorkflowResult> {
  const cdp = client as any;
  const workflowStart = Date.now();
  const stepResults: WorkflowStepResult[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const required = step.required !== false;
    const stepStart = Date.now();
    let replanned = false;
    let stepSuccess = false;
    let stepError: string | undefined;
    let finalUrl: string | undefined;

    try {
      if (step.url) {
        await cdp.Page.navigate({ url: step.url });
        await cdp.Page.loadEventFired();
        await sleep(400);
      }

      const context = await extractPageContext(cdp);
      const plan = await generatePlan(step.task, context, config.apiKey, config.debug);
      const result = await executePlan(plan, cdp, context);
      finalUrl = result.finalUrl;

      if (result.success) {
        if (step.verify) {
          stepSuccess = await checkVerify(step.verify, cdp);
          if (!stepSuccess) stepError = `Verify condition not met: ${step.verify}`;
        } else {
          stepSuccess = true;
        }
      } else {
        stepError = `Execution failed: ${result.steps.filter(s => !s.success).map(s => s.error).join('; ')}`;
      }

      if (!stepSuccess && required) {
        replanned = true;
        const context2 = await extractPageContext(cdp);
        const plan2 = await generatePlan(step.task, context2, config.apiKey, config.debug);
        const result2 = await executePlan(plan2, cdp, context2);
        finalUrl = result2.finalUrl;

        if (result2.success) {
          if (step.verify) {
            stepSuccess = await checkVerify(step.verify, cdp);
            if (!stepSuccess) stepError = `Verify condition not met after re-plan: ${step.verify}`;
            else stepError = undefined;
          } else {
            stepSuccess = true;
            stepError = undefined;
          }
        } else {
          stepError = `Re-plan execution failed: ${result2.steps.filter(s => !s.success).map(s => s.error).join('; ')}`;
        }
      }
    } catch (err: unknown) {
      stepError = err instanceof Error ? err.message : String(err);

      if (required && !replanned) {
        replanned = true;
        try {
          const context2 = await extractPageContext(cdp);
          const plan2 = await generatePlan(step.task, context2, config.apiKey, config.debug);
          const result2 = await executePlan(plan2, cdp, context2);
          finalUrl = result2.finalUrl;

          if (result2.success) {
            if (step.verify) {
              stepSuccess = await checkVerify(step.verify, cdp);
              if (!stepSuccess) stepError = `Verify condition not met after re-plan: ${step.verify}`;
              else stepError = undefined;
            } else {
              stepSuccess = true;
              stepError = undefined;
            }
          } else {
            stepError = `Re-plan execution failed: ${result2.steps.filter(s => !s.success).map(s => s.error).join('; ')}`;
          }
        } catch (err2: unknown) {
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
    } catch {}

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

  let workflowFinalUrl: string | undefined;
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

async function checkVerify(condition: string, client: any): Promise<boolean> {
  try {
    const { result } = await client.Runtime.evaluate({
      expression: `
        document.body.innerText.includes(${JSON.stringify(condition)}) ||
        !!document.querySelector(${JSON.stringify(condition)})
      `,
      returnByValue: true,
    });
    return result.value === true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
