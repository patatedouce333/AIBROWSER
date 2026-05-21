import { ChromeManager, connectSession } from './browser';
import { extractPageContext } from './a11y';
import { generatePlan } from './planner';
import { executePlan, ExecutionResult } from './executor';
import { runWorkflow, WorkflowStep, WorkflowResult } from './workflow';
export { WorkflowStep, WorkflowResult } from './workflow';

const TASK_TIMEOUT_MS = 120_000;
const MAX_CONCURRENT = 3;

export interface AgentConfig {
  apiKey: string;
  keepAlive?: boolean;
  debug?: boolean;
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
  failedAt?: 'plan' | 'execution';
}

class SessionManager {
  private static _instance: SessionManager;
  private _active = 0;

  static getInstance(): SessionManager {
    if (!SessionManager._instance) SessionManager._instance = new SessionManager();
    return SessionManager._instance;
  }

  get activeCount(): number { return this._active; }
  get atCapacity(): boolean { return this._active >= MAX_CONCURRENT; }

  async run(task: string, startUrl: string, config: AgentConfig): Promise<TaskResult> {
    if (this._active >= MAX_CONCURRENT) {
      throw new Error(`Too many concurrent tasks (max ${MAX_CONCURRENT})`);
    }

    this._active++;
    try {
      return await withTimeout(
        this._execute(task, startUrl, config),
        TASK_TIMEOUT_MS,
        'task'
      );
    } finally {
      this._active--;
    }
  }

  async runWorkflow(steps: WorkflowStep[], config: AgentConfig): Promise<WorkflowResult> {
    if (this._active >= MAX_CONCURRENT) {
      throw new Error(`Too many concurrent tasks (max ${MAX_CONCURRENT})`);
    }

    this._active++;
    try {
      return await withTimeout(
        this._executeWorkflow(steps, config),
        TASK_TIMEOUT_MS,
        'workflow'
      );
    } finally {
      this._active--;
    }
  }

  private async _executeWorkflow(steps: WorkflowStep[], config: AgentConfig): Promise<WorkflowResult> {
    if (!config.apiKey) throw new Error('apiKey is required');

    await ChromeManager.getInstance().ensureRunning();
    const session = await connectSession('about:blank');

    try {
      return await runWorkflow(steps, session.client, { apiKey: config.apiKey, debug: config.debug });
    } finally {
      await session.close();
      if (!config.keepAlive) {
        await ChromeManager.getInstance().shutdown();
      }
    }
  }

  private async _execute(task: string, startUrl: string, config: AgentConfig): Promise<TaskResult> {
    if (!config.apiKey) throw new Error('apiKey is required');

    await ChromeManager.getInstance().ensureRunning();

    const session = await connectSession(startUrl);
    const planStart = Date.now();
    let planMs = 0;

    try {
      console.log(`\nTask: "${task}"`);
      console.log(`URL: ${startUrl}\n`);

      console.log('Extracting accessibility tree...');
      const context = await extractPageContext(session.client);
      console.log(`  ${context.tree.split('\n').length} nodes`);

      console.log('Generating plan with Mercury...');
      let plan;
      try {
        plan = await generatePlan(task, context, config.apiKey, config.debug);
      } catch (err: any) {
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
      let result: ExecutionResult;
      try {
        result = await executePlan(plan, session.client, context);
      } catch (err: any) {
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

    } finally {
      await session.close();
      if (!config.keepAlive) {
        await ChromeManager.getInstance().shutdown();
      }
    }
  }
}

export async function runTask(
  task: string,
  startUrl: string,
  config: AgentConfig
): Promise<TaskResult> {
  return SessionManager.getInstance().run(task, startUrl, config);
}

export async function runWorkflowTask(
  steps: WorkflowStep[],
  config: AgentConfig
): Promise<WorkflowResult> {
  return SessionManager.getInstance().runWorkflow(steps, config);
}

export function getActiveCount(): number {
  return SessionManager.getInstance().activeCount;
}

export async function shutdown(): Promise<void> {
  await ChromeManager.getInstance().shutdown();
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}
