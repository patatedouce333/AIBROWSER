/**
 * Observability: Structured logging, metrics, and request tracing
 * Provides comprehensive visibility into system behavior
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: { message: string; stack?: string };
  duration?: number;
  tags?: string[];
}

export interface Metric {
  name: string;
  value: number;
  timestamp: number;
  type: 'gauge' | 'counter' | 'histogram';
}

export interface Span {
  id: string;
  operation: string;
  startTime: number;
  endTime?: number;
  parent?: Span;
  status: 'RUNNING' | 'SUCCESS' | 'ERROR';
  error?: Error;
}

/**
 * Structured logger with context tracking
 */
export class Logger {
  private context: Record<string, any> = {};
  private logLevel: LogLevel = 'INFO';
  private logs: LogEntry[] = [];

  setLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  setContext(key: string, value: any): void {
    this.context[key] = value;
  }

  clearContext(): void {
    this.context = {};
  }

  debug(message: string, data?: any): void {
    this.log('DEBUG', message, data);
  }

  info(message: string, data?: any): void {
    this.log('INFO', message, data);
  }

  warn(message: string, data?: any): void {
    this.log('WARN', message, data);
  }

  error(message: string, error?: Error, data?: any): void {
    this.log('ERROR', message, data, error);
  }

  private log(level: LogLevel, message: string, data?: any, error?: Error): void {
    const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    if (levels.indexOf(level) < levels.indexOf(this.logLevel)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      tags: [],
    };

    if (data) entry.context = { ...entry.context, ...data };
    if (error) entry.error = { message: error.message, stack: error.stack };

    this.logs.push(entry);
    console.log(`[${level}] ${message}`, entry);
  }

  getLogs(level?: LogLevel): LogEntry[] {
    return level ? this.logs.filter((l) => l.level === level) : this.logs;
  }
}

/**
 * Metrics aggregation
 */
export class Metrics {
  private metrics: Map<string, Metric[]> = new Map();

  recordLatency(operation: string, ms: number): void {
    this.recordMetric(operation, ms, 'histogram');
  }

  recordCounter(name: string, value: number): void {
    this.recordMetric(name, value, 'counter');
  }

  recordGauge(name: string, value: number): void {
    this.recordMetric(name, value, 'gauge');
  }

  private recordMetric(name: string, value: number, type: 'gauge' | 'counter' | 'histogram'): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    this.metrics.get(name)!.push({
      name,
      value,
      timestamp: Date.now(),
      type,
    });
  }

  getMetrics(name?: string): Metric[] {
    if (name) {
      return this.metrics.get(name) || [];
    }

    const all: Metric[] = [];
    for (const metrics of this.metrics.values()) {
      all.push(...metrics);
    }
    return all;
  }

  getLatencyStats(operation: string): {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  } {
    const metrics = this.metrics.get(operation) || [];
    if (metrics.length === 0) {
      return { p50: 0, p95: 0, p99: 0, avg: 0 };
    }

    const values = metrics.map((m) => m.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      p50: values[Math.floor(values.length * 0.5)],
      p95: values[Math.floor(values.length * 0.95)],
      p99: values[Math.floor(values.length * 0.99)],
      avg: Math.round(sum / values.length),
    };
  }

  reset(): void {
    this.metrics.clear();
  }
}

/**
 * Request tracer
 */
export class Tracer {
  private spans: Map<string, Span> = new Map();
  private spanCounter: number = 0;

  startSpan(operation: string, parent?: Span): Span {
    const span: Span = {
      id: `${operation}-${this.spanCounter++}`,
      operation,
      startTime: Date.now(),
      parent,
      status: 'RUNNING',
    };

    this.spans.set(span.id, span);
    return span;
  }

  endSpan(span: Span): void {
    span.endTime = Date.now();
    span.status = 'SUCCESS';
  }

  recordError(span: Span, error: Error): void {
    span.status = 'ERROR';
    span.error = error;
  }

  getSpans(): Span[] {
    return Array.from(this.spans.values());
  }

  getSpanDuration(span: Span): number {
    return (span.endTime || Date.now()) - span.startTime;
  }
}

// Singletons
export const logger = new Logger();
export const metrics = new Metrics();
export const tracer = new Tracer();
