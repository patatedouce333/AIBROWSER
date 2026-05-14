import { launchChrome, connectSession, killChrome } from './browser';
import { extractPageContext } from './a11y';
import { generatePlan } from './planner';
import { executePlan, ExecutionResult } from './executor';

export interface AgentConfig {
  apiKey: string;
  headless?: boolean;
  keepAlive?: boolean; // keep Chrome running between tasks
}

export interface TaskResult {
  success: boolean;
  task: string;
  url?: string;
  planSteps: number;
  executionMs: number;
  planMs: number;
  steps: Array<{ step: number; action: string; success: boolean; durationMs: number; error?: string }>;
  error?: string;
}

let chromeRunning = false;

export async function runTask(
  task: string,
  startUrl: string,
  config: AgentConfig
): Promise<TaskResult> {
  const planStart = Date.now();

  if (!config.apiKey) throw new Error('apiKey is required');

  // Launch Chrome if not already running
  if (!chromeRunning) {
    await launchChrome();
    chromeRunning = true;
  }

  const session = await connectSession(startUrl);

  try {
    console.log(`\nTask: "${task}"`);
    console.log(`URL: ${startUrl}\n`);

    // 1. Extract accessibility tree (no screenshot — fast)
    console.log('Extracting accessibility tree...');
    const context = await extractPageContext(session.client);
    console.log(`  ${context.tree.split('\n').length} nodes extracted`);

    // 2. ONE LLM call — generate complete plan
    console.log('Generating plan with Mercury...');
    const plan = await generatePlan(task, context, config.apiKey);
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
    const result = await executePlan(plan, session.client, context);
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

  } catch (err: any) {
    return {
      success: false,
      task,
      planSteps: 0,
      planMs: 0,
      executionMs: 0,
      steps: [],
      error: err.message,
    };
  } finally {
    await session.close();
    if (!config.keepAlive) {
      await killChrome();
      chromeRunning = false;
    }
  }
}

export async function shutdown(): Promise<void> {
  await killChrome();
  chromeRunning = false;
}
