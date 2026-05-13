// Task manager for orchestrating AI-powered web automation
import { ActionPlanner } from './action-planner';
import { ContextManager } from './context-manager';
import { ActionExecutor } from './action-executor';
import { TabManager } from './tab-manager';
import { getChrome } from '../shared/dependency-container';
import { Task, Plan, PageSnapshot } from '../shared/messages';

export class TaskManager {
  private tasks = new Map<string, Task>();
  private activeTaskId: string | null = null;

  async createTask(description: string): Promise<Task> {
    const task: Task = {
      id: crypto.randomUUID(),
      description,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.tasks.set(task.id, task);
    console.log(`Created task ${task.id}: ${description}`);

    // Start processing immediately
    this.processTask(task);

    return task;
  }

  async cancelTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'cancelled';
      task.updatedAt = Date.now();
      console.log(`Cancelled task ${taskId}`);
    }
  }

  getTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  private async processTask(task: Task) {
    try {
      task.status = 'running';
      task.updatedAt = Date.now();

      console.log(`Processing task ${task.id}: ${task.description}`);

      // Get active tab
      const tab = await TabManager.getActiveTab();

      // Ensure content script is ready
      await TabManager.ensureContentScript(tab.id!);

      // Extract page context
      const snapshot = await this.extractPageSnapshot(tab.id!);

      // Generate plan using AI
      const plan = await ActionPlanner.generatePlan(task.description, snapshot);

      task.plan = plan;
      task.updatedAt = Date.now();

      console.log(`Generated plan for task ${task.id} with ${plan.actions.length} actions`);

      // Execute plan
      const result = await ActionExecutor.executePlan(plan, tab.id!);

      task.status = 'completed';
      task.result = result;
      task.updatedAt = Date.now();

      console.log(`Completed task ${task.id}`);

    } catch (error: any) {
      console.error(`Task ${task.id} failed:`, error);
      task.status = 'failed';
      task.error = error.message;
      task.updatedAt = Date.now();
    }
  }

  private async extractPageSnapshot(tabId: number): Promise<PageSnapshot> {
    return new Promise((resolve, reject) => {
      const chrome = getChrome();
      const timeout = setTimeout(() => {
        reject(new Error('DOM extraction timeout'));
      }, 5000);

      chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_DOM' }, (response: any) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.snapshot) {
          resolve(response.snapshot);
        } else {
          reject(new Error('Invalid DOM extraction response'));
        }
      });
    });
  }

  handleDomSnapshot(snapshot: PageSnapshot, tabId?: number) {
    console.log(`Received DOM snapshot from tab ${tabId}: ${snapshot.content.title}`);
    // Store for context if needed
  }

  handleMutation(url: string, significant: boolean, tabId?: number) {
    if (significant) {
      console.log(`Significant mutation detected in tab ${tabId}: ${url}`);
      // Could trigger re-planning if task is active
    }
  }

  handleSpaNavigation(url: string, tabId?: number) {
    console.log(`SPA navigation detected in tab ${tabId}: ${url}`);
    // Handle SPA navigation for active tasks
  }
}