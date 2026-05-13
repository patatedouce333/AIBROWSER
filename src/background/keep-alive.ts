// Service worker keep-alive system to prevent termination during long tasks
import { getChrome } from '../shared/dependency-container';

let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
let activePorts = new Set<any>();

export function startKeepAlive() {
  console.log('Starting service worker keep-alive');

  const chrome = getChrome();

  // Method 1: Chrome alarms (minimum 30s intervals)
  chrome.alarms.create('keep-alive', { periodInMinutes: 0.4 }); // ~25 seconds

  // Method 2: Self-messaging (more reliable)
  if (!keepAliveInterval) {
    keepAliveInterval = setInterval(() => {
      chrome.runtime.getPlatformInfo(() => {
        // The callback keeps SW alive
      });
    }, 25000);
  }
}

export function stopKeepAlive() {
  console.log('Stopping service worker keep-alive');

  const chrome = getChrome();
  chrome.alarms.clear('keep-alive');

  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

export function registerPort(port: chrome.runtime.Port) {
  console.log('Registering port for keep-alive');
  activePorts.add(port);

  port.onDisconnect.addListener(() => {
    console.log('Port disconnected, removing from keep-alive');
    activePorts.delete(port);

    // If no ports left, we could potentially stop keep-alive
    // But keep it running during tasks
  });
}

export function getActivePortsCount(): number {
  return activePorts.size;
}

// Alarm listener - only register if chrome.alarms is available
const initAlarmListener = () => {
  try {
    const chrome = getChrome();
    if (typeof chrome !== 'undefined' && chrome.alarms && chrome.alarms.onAlarm) {
      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'keep-alive') {
          console.log('Keep-alive alarm triggered');
          // No-op, just keeping SW alive
        }
      });
    }
  } catch (error) {
    console.warn('Could not initialize alarm listener:', error);
  }
};

// Initialize on module load
initAlarmListener();