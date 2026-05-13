/**
 * DOM Cache tests
 */

import { DOMCache, DOMSnapshot } from '../../src/shared/dom-cache';

describe('DOMCache', () => {
  let cache: DOMCache;
  let snapshot: DOMSnapshot;

  beforeEach(() => {
    cache = new DOMCache({
      maxTotalSize: 1000000,
      maxTabSize: 100000,
      defaultTtlMs: 5000,
      compressionThreshold: 100,
    });

    snapshot = {
      tabId: 1,
      html: '<div>Test HTML</div>',
      timestamp: Date.now(),
      size: 20,
      compressed: false,
    };

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('stores and retrieves snapshot', () => {
    cache.setSnapshot(1, snapshot);
    const retrieved = cache.getSnapshot(1);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.html).toBe(snapshot.html);
  });

  test('returns null for expired snapshot', () => {
    cache.setSnapshot(1, snapshot);
    jest.advanceTimersByTime(6000);

    const retrieved = cache.getSnapshot(1);
    expect(retrieved).toBeNull();
  });

  test('tracks hit/miss rates', () => {
    cache.setSnapshot(1, snapshot);
    cache.getSnapshot(1); // Hit
    cache.getSnapshot(2); // Miss

    const stats = cache.getStats();
    expect(stats.hitRate).toBeGreaterThan(0);
  });

  test('invalidates by tab', () => {
    cache.setSnapshot(1, snapshot);
    cache.invalidate(1);

    const retrieved = cache.getSnapshot(1);
    expect(retrieved).toBeNull();
  });

  test('enforces size limits', () => {
    const largeCache = new DOMCache({ maxTabSize: 100 });
    const large = { ...snapshot, size: 200 };

    largeCache.setSnapshot(1, large);
    largeCache.setSnapshot(1, snapshot); // Should evict

    const stats = largeCache.getStats();
    expect(stats.size).toBeLessThanOrEqual(100);
  });
});
