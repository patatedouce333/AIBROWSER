// Sidebar UI script
import { SidebarMessage, BackgroundResponse, Task } from '../shared/messages';

console.log('Cometeor sidebar loaded');

class SidebarUI {
  private taskInput: HTMLTextAreaElement;
  private sendButton: HTMLButtonElement;
  private authStatus: HTMLElement;
  private tasksList: HTMLElement;
  private tasks: Map<string, Task> = new Map();

  constructor() {
    this.taskInput = document.getElementById('taskInput') as HTMLTextAreaElement;
    this.sendButton = document.getElementById('sendButton') as HTMLButtonElement;
    this.authStatus = document.getElementById('authStatus') as HTMLElement;
    this.tasksList = document.getElementById('tasksList') as HTMLElement;

    this.initializeUI();
    this.checkAuthStatus();
    this.loadTasks();
  }

  private initializeUI() {
    // Send button click handler
    this.sendButton.addEventListener('click', () => this.sendTask());

    // Enter key handler
    this.taskInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendTask();
      }
    });

    // Task input validation
    this.taskInput.addEventListener('input', () => {
      this.updateSendButton();
    });

    this.updateSendButton();
  }

  private updateSendButton() {
    const hasText = this.taskInput.value.trim().length > 0;
    this.sendButton.disabled = !hasText;
  }

  private async sendTask() {
    const description = this.taskInput.value.trim();
    if (!description) return;

    this.setLoading(true);
    try {
      const response = await this.sendMessage<BackgroundResponse>({
        type: 'START_TASK',
        description,
      });

      if (response.type === 'TASK_STARTED') {
        this.addTask(response.task);
        this.taskInput.value = '';
        this.updateSendButton();
      } else if (response.type === 'TASK_FAILED') {
        this.showError('Failed to start task: ' + (response.task.error || 'Unknown error'));
      }
    } catch (error: any) {
      this.showError('Failed to send task: ' + error.message);
    }
    this.setLoading(false);
  }

  private async checkAuthStatus() {
    try {
      const response = await this.sendMessage<BackgroundResponse>({
        type: 'GET_AUTH_STATUS',
      });

      if (response.type === 'AUTH_STATUS') {
        this.updateAuthStatus(response.authenticated);
      }
    } catch (error) {
      console.error('Failed to check auth status:', error);
      this.updateAuthStatus(false);
    }
  }

  private async loadTasks() {
    try {
      const response = await this.sendMessage<BackgroundResponse>({
        type: 'GET_TASKS',
      });

      if (response.type === 'TASKS_LIST') {
        response.tasks.forEach(task => this.addTask(task));
        this.startTaskUpdates();
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  }

  private startTaskUpdates() {
    // Poll for task updates every 2 seconds
    setInterval(() => this.updateTasks(), 2000);
  }

  private async updateTasks() {
    try {
      const response = await this.sendMessage<BackgroundResponse>({
        type: 'GET_TASKS',
      });

      if (response.type === 'TASKS_LIST') {
        response.tasks.forEach(task => {
          const existing = this.tasks.get(task.id);
          if (!existing || existing.updatedAt !== task.updatedAt) {
            this.updateTask(task);
          }
        });
      }
    } catch (error) {
      console.error('Failed to update tasks:', error);
    }
  }

  private updateAuthStatus(authenticated: boolean) {
    if (authenticated) {
      this.authStatus.textContent = '✓ Connected to AI service';
      this.authStatus.classList.remove('error');
    } else {
      this.authStatus.textContent = '✗ Not connected to AI service';
      this.authStatus.classList.add('error');
    }
  }

  private addTask(task: Task) {
    this.tasks.set(task.id, task);
    this.renderTask(task);
  }

  private updateTask(task: Task) {
    this.tasks.set(task.id, task);
    this.renderTask(task);
  }

  private renderTask(task: Task) {
    const existing = this.tasksList.querySelector(`[data-task-id="${task.id}"]`);
    const taskElement = existing || this.createTaskElement(task);

    if (!existing) {
      this.tasksList.insertBefore(taskElement, this.tasksList.firstChild);
    }

    // Update content
    const descriptionEl = taskElement.querySelector('.task-description') as HTMLElement;
    const statusEl = taskElement.querySelector('.task-status') as HTMLElement;
    const progressEl = taskElement.querySelector('.task-progress') as HTMLElement;

    descriptionEl.textContent = task.description;
    statusEl.textContent = task.status;
    statusEl.className = `task-status status-${task.status}`;

    // Show progress info
    let progressText = '';
    if (task.status === 'running') {
      progressText = 'Executing...';
    } else if (task.status === 'completed') {
      progressText = 'Task completed successfully';
    } else if (task.status === 'failed') {
      progressText = `Failed: ${task.error || 'Unknown error'}`;
    } else if (task.status === 'cancelled') {
      progressText = 'Task cancelled';
    }

    progressEl.textContent = progressText;
  }

  private createTaskElement(task: Task): HTMLElement {
    const element = document.createElement('div');
    element.className = 'task-item';
    element.setAttribute('data-task-id', task.id);

    element.innerHTML = `
      <div class="task-header">
        <span class="task-status status-${task.status}">${task.status}</span>
        <button class="cancel-button" style="display: ${task.status === 'running' ? 'block' : 'none'}">×</button>
      </div>
      <div class="task-description">${task.description}</div>
      <div class="task-progress"></div>
    `;

    // Cancel button handler
    const cancelBtn = element.querySelector('.cancel-button') as HTMLButtonElement;
    cancelBtn.addEventListener('click', () => this.cancelTask(task.id));

    return element;
  }

  private async cancelTask(taskId: string) {
    try {
      await this.sendMessage<BackgroundResponse>({
        type: 'CANCEL_TASK',
        taskId,
      });
      this.updateTasks(); // Refresh immediately
    } catch (error) {
      console.error('Failed to cancel task:', error);
    }
  }

  private setLoading(loading: boolean) {
    this.sendButton.disabled = loading;
    if (loading) {
      this.sendButton.innerHTML = '<div class="loading"></div>';
    } else {
      this.sendButton.textContent = 'Send';
    }
  }

  private showError(message: string) {
    // Simple error display - could be enhanced
    console.error(message);
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #f44336;
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      z-index: 1000;
      font-size: 12px;
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 3000);
  }

  private sendMessage<T>(message: SidebarMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new SidebarUI();
});