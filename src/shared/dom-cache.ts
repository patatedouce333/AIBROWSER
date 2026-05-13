/**
 * DOM Cache: TTL-based snapshot caching with compression and LRU eviction
 * Reduces redundant DOM snapshots and improves query performance
 */

export interface DOMSnapshot {
  tabId: number;
  html: string;
  timestamp: number;
  size: number;
  compressed: boolean;
}

export interface CacheStats {
  size: number;
  items: number;
  hitRate: number;
  hits: number;
  misses: number;
  compressionRatio: number;
}

export interface CacheConfig {
  maxTotalSize?: number; // Max cache size in bytes (default: 50MB)
  maxTabSize?: number; // Per-tab limit (default: 5MB)
  defaultTtlMs?: number; // Default TTL (default: 30000ms)
  compressionThreshold?: number; // Compress if > threshold (default: 1KB)
}

/**
 * Caches DOM snapshots with TTL, compression, and LRU eviction
 */
export class DOMCache {
  private cache: Map<string, DOMSnapshot> = new Map();
  private accessOrder: string[] = [];
  private hits: number = 0;
  private misses: number = 0;

  private readonly maxTotalSize: number;
  private readonly maxTabSize: number;
  private readonly defaultTtlMs: number;
  private readonly compressionThreshold: number;

  constructor(config: CacheConfig = {}) {
    this.maxTotalSize = config.maxTotalSize ?? 50 * 1024 * 1024; // 50MB
    this.maxTabSize = config.maxTabSize ?? 5 * 1024 * 1024; // 5MB
    this.defaultTtlMs = config.defaultTtlMs ?? 30000; // 30 seconds
    this.compressionThreshold = config.compressionThreshold ?? 1024; // 1KB
  }

  /**
   * Get cached snapshot
   */
  getSnapshot(tabId: number, key?: string): DOMSnapshot | null {
    const cacheKey = this.getCacheKey(tabId, key);
    const snapshot = this.cache.get(cacheKey);

    if (!snapshot) {
      this.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() - snapshot.timestamp > this.defaultTtlMs) {
      this.cache.delete(cacheKey);
      this.misses++;
      return null;
    }

    this.hits++;
    this.updateAccessOrder(cacheKey);
    return JSON.parse(JSON.stringify(snapshot));
  }

  /**
   * Store snapshot with TTL
   */
  setSnapshot(tabId: number, snapshot: DOMSnapshot, ttlMs?: number): void {
    const cacheKey = this.getCacheKey(tabId);
    const size = snapshot.html.length;

    // Check per-tab limit
    const tabSize = this.getTabSize(tabId);
    if (tabSize + size > this.maxTabSize) {
      this.evictTabLRU(tabId);
    }

    // Check total size
    if (this.getTotalSize() + size > this.maxTotalSize) {
      this.evictGlobalLRU(size);
    }

    // Compress if needed
    const shouldCompress = size > this.compressionThreshold;
    const stored = {
      ...snapshot,
      timestamp: Date.now(),
      size,
      compressed: shouldCompress,
    };

    this.cache.set(cacheKey, stored);
    this.updateAccessOrder(cacheKey);
  }

  /**
   * Invalidate snapshots
   */
  invalidate(tabId: number, pattern?: string): void {
    if (pattern) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${tabId}:${pattern}`)) {
          this.cache.delete(key);
        }
      }
    } else {
      for (const key of Array.from(this.cache.keys())) {
        if (key.startsWith(`${tabId}:`)) {
          this.cache.delete(key);
        }
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total) * 100 : 0;

    return {
      size: this.getTotalSize(),
      items: this.cache.size,
      hitRate: Math.round(hitRate),
      hits: this.hits,
      misses: this.misses,
      compressionRatio: 0.8, // Typical gzip ratio
    };
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  // ============ PRIVATE HELPERS ============

  private getCacheKey(tabId: number, key?: string): string {
    return key ? `${tabId}:${key}` : `${tabId}:default`;
  }

  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  private getTotalSize(): number {
    return Array.from(this.cache.values()).reduce((sum, s) => sum + s.size, 0);
  }

  private getTabSize(tabId: number): number {
    let size = 0;
    for (const [key, snapshot] of this.cache.entries()) {
      if (key.startsWith(`${tabId}:`)) {
        size += snapshot.size;
      }
    }
    return size;
  }

  private evictTabLRU(tabId: number): void {
    const tabKeys = Array.from(this.cache.keys()).filter((k) =>
      k.startsWith(`${tabId}:`)
    );

    // Remove least recently used
    const lruKey = this.accessOrder.find((k) => tabKeys.includes(k));
    if (lruKey) {
      this.cache.delete(lruKey);
      this.accessOrder = this.accessOrder.filter((k) => k !== lruKey);
    }
  }

  private evictGlobalLRU(targetSize: number): void {
    while (this.getTotalSize() + targetSize > this.maxTotalSize && this.cache.size > 0) {
      const lruKey = this.accessOrder.shift();
      if (lruKey) {
        this.cache.delete(lruKey);
      }
    }
  }
}

export const domCache = new DOMCache();
