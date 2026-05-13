// Shared types and interfaces for message passing
export interface InteractiveElement {
  id: string;
  role: string;
  tag: string;
  type?: string;
  name: string;
  value: string;
  href?: string;
  disabled: boolean;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PageSnapshot {
  url: string;
  title: string;
  viewport: {
    width: number;
    height: number;
    scrollY: number;
    totalHeight: number;
  };
  content: {
    text: string;
    title: string;
    url: string;
  };
  interactive: InteractiveElement[];
}

export interface Action {
  type: 'click' | 'type' | 'select' | 'scroll' | 'wait' | 'press_key';
  selector?: string;
  value?: string;
  key?: string;
  x?: number;
  y?: number;
  duration?: number;
  description?: string;
}

export interface Plan {
  id: string;
  actions: Action[];
  confidence: number;
  explanation: string;
}

export interface Task {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  plan?: Plan;
  result?: any;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
}

// Message types for background ↔ content communication
export type BackgroundMessage =
  | { type: 'PING' }
  | { type: 'EXECUTE_ACTION'; action: Action }
  | { type: 'EXTRACT_DOM' }
  | { type: 'START_MUTATION_WATCHING' }
  | { type: 'STOP_MUTATION_WATCHING' };

export type ContentMessage =
  | { type: 'PONG' }
  | { type: 'DOM_SNAPSHOT'; snapshot: PageSnapshot }
  | { type: 'ACTION_RESULT'; success: boolean; error?: string }
  | { type: 'MUTATION_DETECTED'; url: string; significant: boolean }
  | { type: 'SPA_NAVIGATION'; url: string };

// Message types for background ↔ sidebar communication
export type SidebarMessage =
  | { type: 'START_TASK'; description: string }
  | { type: 'CANCEL_TASK'; taskId: string }
  | { type: 'GET_TASKS' }
  | { type: 'GET_AUTH_STATUS' };

export type BackgroundResponse =
  | { type: 'TASK_STARTED'; task: Task }
  | { type: 'TASK_CANCELLED'; taskId: string }
  | { type: 'TASKS_LIST'; tasks: Task[] }
  | { type: 'AUTH_STATUS'; authenticated: boolean; tokens?: AuthTokens }
  | { type: 'STREAM_CHUNK'; taskId: string; chunk: string }
  | { type: 'TASK_COMPLETED'; task: Task }
  | { type: 'TASK_FAILED'; task: Task };

// Generic message wrapper
export interface Message<T = any> {
  type: string;
  data?: T;
  requestId?: string;
}