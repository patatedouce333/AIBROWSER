/**
 * Observability tests (Logger, Metrics, Tracer)
 */

import { Logger, Metrics, Tracer } from '../../src/shared/observability';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
  });

  test('logs at different levels', () => {
    logger.debug('debug msg');
    logger.info('info msg');
    logger.warn('warn msg');
    logger.error('error msg');

    const logs = logger.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });

  test('respects log level', () => {
    logger.setLevel('WARN');
    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');

    const logs = logger.getLogs();
    expect(logs.some((l) => l.message === 'debug')).toBe(false);
  });

  test('tracks context', () => {
    logger.setContext('userId', '123');
    logger.info('test');

    const logs = logger.getLogs();
    expect(logs[logs.length - 1].context?.userId).toBe('123');
  });

  test('logs errors with stack', () => {
    const error = new Error('Test error');
    logger.error('Failed', error);

    const logs = logger.getLogs('ERROR');
    expect(logs[0].error?.message).toBe('Test error');
  });
});

describe('Metrics', () => {
  let metrics: Metrics;

  beforeEach(() => {
    metrics = new Metrics();
  });

  test('records latency', () => {
    metrics.recordLatency('query', 100);
    metrics.recordLatency('query', 150);

    const stats = metrics.getLatencyStats('query');
    expect(stats.p50).toBeGreaterThan(0);
  });

  test('calculates percentiles', () => {
    for (let i = 1; i <= 100; i++) {
      metrics.recordLatency('op', i);
    }

    const stats = metrics.getLatencyStats('op');
    expect(stats.p50).toBeGreaterThan(stats.p50);
    expect(stats.p99).toBeGreaterThan(stats.p95);
  });

  test('records counters and gauges', () => {
    metrics.recordCounter('requests', 5);
    metrics.recordGauge('memory', 1024);

    const metrics_list = metrics.getMetrics();
    expect(metrics_list.length).toBe(2);
  });

  test('resets metrics', () => {
    metrics.recordLatency('op', 100);
    metrics.reset();

    const stats = metrics.getLatencyStats('op');
    expect(stats.avg).toBe(0);
  });
});

describe('Tracer', () => {
  let tracer: Tracer;

  beforeEach(() => {
    tracer = new Tracer();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('creates and ends spans', () => {
    const span = tracer.startSpan('request');
    expect(span.status).toBe('RUNNING');

    jest.advanceTimersByTime(100);
    tracer.endSpan(span);

    expect(span.status).toBe('SUCCESS');
    expect(span.endTime).toBeDefined();
  });

  test('records errors', () => {
    const span = tracer.startSpan('op');
    const error = new Error('Failed');

    tracer.recordError(span, error);

    expect(span.status).toBe('ERROR');
    expect(span.error).toBe(error);
  });

  test('tracks span duration', () => {
    const span = tracer.startSpan('op');
    jest.advanceTimersByTime(100);
    tracer.endSpan(span);

    const duration = tracer.getSpanDuration(span);
    expect(duration).toBeGreaterThanOrEqual(100);
  });

  test('supports parent spans', () => {
    const parent = tracer.startSpan('parent');
    const child = tracer.startSpan('child', parent);

    expect(child.parent).toBe(parent);
  });
});
