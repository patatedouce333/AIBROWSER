/**
 * Unit tests for Content Script Heartbeat Monitor
 * Tests liveness detection, dead script detection, and re-injection triggers
 */

import { ContentScriptHealthMonitor, HealthCheckResult } from '../../src/background/content-script-monitor';

describe('ContentScriptHealthMonitor', () => {
  let monitor: ContentScriptHealthMonitor;

  beforeEach(() => {
    monitor = new ContentScriptHealthMonitor();
    jest.useFakeTimers();
  });

  afterEach(() => {
    monitor.stopPeriodicCheck();
    jest.useRealTimers();
  });

  describe('Heartbeat Recording', () => {
    test('records heartbeat timestamp', () => {
      monitor.recordHeartbeat(1);

      const status = monitor.getStatus(1);
      expect((status as any).tabId).toBe(1);
      expect((status as any).isAlive).toBe(true);
      expect((status as any).lastHeartbeat).toBeGreaterThan(0);
    });

    test('updates heartbeat for multiple tabs', () => {
      monitor.recordHeartbeat(1);
      monitor.recordHeartbeat(2);
      monitor.recordHeartbeat(3);

      const allStatus = monitor.getStatus() as any[];
      expect(allStatus).toHaveLength(3);
      expect(allStatus.map((s) => s.tabId)).toEqual(expect.arrayContaining([1, 2, 3]));
    });

    test('tracks time since last heartbeat', () => {
      const beforeTime = Date.now();
      monitor.recordHeartbeat(1);
      const afterTime = Date.now();

      jest.advanceTimersByTime(5000); // 5 seconds

      const status = monitor.getStatus(1) as any;
      expect(status.timeSinceLastHeartbeat).toBeGreaterThanOrEqual(5000);
      expect(status.timeSinceLastHeartbeat).toBeLessThan(6000);
    });
  });

  describe('Liveness Detection', () => {
    test('marks content script as alive if recent heartbeat', () => {
      monitor.recordHeartbeat(1);
      const status = monitor.getStatus(1) as any;
      expect(status.isAlive).toBe(true);
    });

    test('marks content script as dead if no heartbeat for 30 seconds', () => {
      monitor.recordHeartbeat(1);
      jest.advanceTimersByTime(31000); // 31 seconds - exceeds 30 second timeout

      const status = monitor.getStatus(1) as any;
      expect(status.isAlive).toBe(false);
      expect(status.timeSinceLastHeartbeat).toBeGreaterThan(30000);
    });

    test('marks as alive if heartbeat within 30 second window', () => {
      monitor.recordHeartbeat(1);
      jest.advanceTimersByTime(25000); // 25 seconds - within window

      const status = monitor.getStatus(1) as any;
      expect(status.isAlive).toBe(true);
    });

    test('marks as dead exactly at 30 second boundary', () => {
      monitor.recordHeartbeat(1);
      jest.advanceTimersByTime(30000); // Exactly 30 seconds

      const status = monitor.getStatus(1) as any;
      // At exactly the boundary, it should still be alive (> not >=)
      expect(status.isAlive).toBe(false);
    });
  });

  describe('Multi-tab Monitoring', () => {
    test('tracks different tabs independently', () => {
      monitor.recordHeartbeat(1);

      jest.advanceTimersByTime(5000);
      monitor.recordHeartbeat(2);

      jest.advanceTimersByTime(20000); // Total 25 seconds
      // Tab 1: 25 seconds old (alive)
      // Tab 2: 20 seconds old (alive)

      const status1 = monitor.getStatus(1) as any;
      const status2 = monitor.getStatus(2) as any;

      expect(status1.isAlive).toBe(true);
      expect(status2.isAlive).toBe(true);

      jest.advanceTimersByTime(10000); // Total 35 seconds
      // Tab 1: 35 seconds old (dead)
      // Tab 2: 30 seconds old (dead)

      const status1Dead = monitor.getStatus(1) as any;
      const status2Dead = monitor.getStatus(2) as any;

      expect(status1Dead.isAlive).toBe(false);
      expect(status2Dead.isAlive).toBe(false);
    });

    test('returns status for all tabs when no tabId specified', () => {
      monitor.recordHeartbeat(1);
      monitor.recordHeartbeat(2);
      monitor.recordHeartbeat(3);

      const allStatus = monitor.getStatus() as any[];
      expect(allStatus).toHaveLength(3);
      expect(allStatus.map((s) => s.tabId).sort()).toEqual([1, 2, 3]);
    });

    test('status for unmonitored tab shows all zeros', () => {
      // No heartbeats recorded for tab 999
      const status = monitor.getStatus(999) as any;
      expect(status.tabId).toBe(999);
      expect(status.lastHeartbeat).toBe(0);
      expect(status.isAlive).toBe(false);
    });
  });

  describe('Periodic Health Check', () => {
    test('starts periodic check with default interval', () => {
      const checkSpy = jest.fn();
      monitor.onContentScriptDead(checkSpy);

      monitor.recordHeartbeat(1);
      monitor.startPeriodicCheck(5000);

      jest.advanceTimersByTime(40000); // Well beyond timeout

      monitor.stopPeriodicCheck();

      expect(checkSpy).toHaveBeenCalledWith(1);
    });

    test('prevents multiple periodic checks', () => {
      monitor.startPeriodicCheck(5000);
      monitor.startPeriodicCheck(5000); // Should warn, not start another

      // No test assertion needed - just check no errors thrown
      monitor.stopPeriodicCheck();
    });

    test('detects dead content scripts during periodic check', () => {
      const deadCallback = jest.fn();
      monitor.onContentScriptDead(deadCallback);

      monitor.recordHeartbeat(1);
      monitor.recordHeartbeat(2);

      monitor.startPeriodicCheck(1000); // Check every 1 second

      // Let time pass so tab 1 becomes dead (>30 seconds)
      jest.advanceTimersByTime(35000);

      monitor.stopPeriodicCheck();

      expect(deadCallback).toHaveBeenCalledWith(1);
    });

    test('calls all registered callbacks when content script dies', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const callback3 = jest.fn();

      monitor.onContentScriptDead(callback1);
      monitor.onContentScriptDead(callback2);
      monitor.onContentScriptDead(callback3);

      monitor.recordHeartbeat(1);
      monitor.startPeriodicCheck(1000);

      jest.advanceTimersByTime(35000);
      monitor.stopPeriodicCheck();

      expect(callback1).toHaveBeenCalledWith(1);
      expect(callback2).toHaveBeenCalledWith(1);
      expect(callback3).toHaveBeenCalledWith(1);
    });

    test('removes dead tab from monitoring after detection', () => {
      monitor.recordHeartbeat(1);
      monitor.startPeriodicCheck(1000);

      jest.advanceTimersByTime(35000); // Tab becomes dead
      monitor.stopPeriodicCheck();

      // Tab should be removed from tracking
      const allStatus = monitor.getStatus() as any[];
      expect(allStatus.length).toBe(0);
    });

    test('handles callback errors gracefully', () => {
      const badCallback = jest.fn(() => {
        throw new Error('Callback error');
      });
      const goodCallback = jest.fn();

      monitor.onContentScriptDead(badCallback);
      monitor.onContentScriptDead(goodCallback);

      monitor.recordHeartbeat(1);
      monitor.startPeriodicCheck(1000);

      jest.advanceTimersByTime(35000);
      monitor.stopPeriodicCheck();

      expect(badCallback).toHaveBeenCalled();
      expect(goodCallback).toHaveBeenCalled(); // Should still be called despite bad callback
    });
  });

  describe('Callback Management', () => {
    test('registers callback for dead content script', () => {
      const callback = jest.fn();
      monitor.onContentScriptDead(callback);

      monitor.recordHeartbeat(1);
      monitor.startPeriodicCheck(1000);

      jest.advanceTimersByTime(35000);
      monitor.stopPeriodicCheck();

      expect(callback).toHaveBeenCalled();
    });

    test('unregisters callback', () => {
      const callback = jest.fn();
      monitor.onContentScriptDead(callback);
      monitor.offContentScriptDead(callback);

      monitor.recordHeartbeat(1);
      monitor.startPeriodicCheck(1000);

      jest.advanceTimersByTime(35000);
      monitor.stopPeriodicCheck();

      expect(callback).not.toHaveBeenCalled();
    });

    test('handles multiple register/unregister cycles', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      monitor.onContentScriptDead(callback1);
      monitor.onContentScriptDead(callback2);
      monitor.offContentScriptDead(callback1);

      monitor.recordHeartbeat(1);
      monitor.startPeriodicCheck(1000);

      jest.advanceTimersByTime(35000);
      monitor.stopPeriodicCheck();

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('Ensure Content Script Alive', () => {
    test('throws error if content script is dead', async () => {
      // Don't record any heartbeat - content script is dead
      await expect(monitor.ensureContentScriptAlive(1)).rejects.toThrow('dead');
    });

    test('completes successfully if content script is alive', async () => {
      monitor.recordHeartbeat(1);
      // Should not throw
      await monitor.ensureContentScriptAlive(1);
    });
  });

  describe('Stop Periodic Check', () => {
    test('stops periodic monitoring', () => {
      const callback = jest.fn();
      monitor.onContentScriptDead(callback);

      monitor.recordHeartbeat(1);
      monitor.startPeriodicCheck(1000);

      jest.advanceTimersByTime(35000);
      const callsWhenRunning = callback.mock.calls.length;

      monitor.stopPeriodicCheck();

      jest.advanceTimersByTime(35000);
      const callsAfterStop = callback.mock.calls.length;

      expect(callsWhenRunning).toBeGreaterThan(0);
      expect(callsAfterStop).toBe(callsWhenRunning); // No new calls
    });

    test('can be stopped multiple times safely', () => {
      monitor.startPeriodicCheck(5000);
      monitor.stopPeriodicCheck();
      monitor.stopPeriodicCheck(); // Should not error
    });
  });

  describe('Integration Scenarios', () => {
    test('complete lifecycle: heartbeat, detection, callback, cleanup', () => {
      const callback = jest.fn();
      monitor.onContentScriptDead(callback);

      // 1. Content script starts sending heartbeats
      monitor.recordHeartbeat(1);
      let status = monitor.getStatus(1) as any;
      expect(status.isAlive).toBe(true);

      // 2. Start periodic monitoring
      monitor.startPeriodicCheck(1000);

      // 3. Content script continues heartbeating
      jest.advanceTimersByTime(5000);
      monitor.recordHeartbeat(1);
      status = monitor.getStatus(1) as any;
      expect(status.isAlive).toBe(true);

      // 4. Content script crashes (no more heartbeats)
      jest.advanceTimersByTime(35000); // >30 seconds without heartbeat

      // 5. Periodic check detects it
      status = monitor.getStatus(1) as any;
      expect(status.isAlive).toBe(false);
      expect(callback).toHaveBeenCalledWith(1);

      monitor.stopPeriodicCheck();
    });

    test('multiple tabs with different lifespans', () => {
      const deadCallback = jest.fn();
      monitor.onContentScriptDead(deadCallback);

      // Tab 1 starts
      monitor.recordHeartbeat(1);
      jest.advanceTimersByTime(5000);

      // Tab 2 starts
      monitor.recordHeartbeat(2);
      jest.advanceTimersByTime(10000);

      // Tab 3 starts
      monitor.recordHeartbeat(3);

      monitor.startPeriodicCheck(1000);

      // Wait for tab 1 to die (25 seconds total, dies at 30)
      jest.advanceTimersByTime(35000); // Now 50 seconds total

      monitor.stopPeriodicCheck();

      // All tabs should be dead by now
      expect(deadCallback).toHaveBeenCalledWith(1);
      expect(deadCallback).toHaveBeenCalledWith(2);
      expect(deadCallback).toHaveBeenCalledWith(3);
    });
  });
});
