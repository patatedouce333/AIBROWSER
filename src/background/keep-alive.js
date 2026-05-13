"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startKeepAlive = startKeepAlive;
exports.stopKeepAlive = stopKeepAlive;
exports.registerPort = registerPort;
exports.getActivePortsCount = getActivePortsCount;
// Service worker keep-alive system to prevent termination during long tasks
var keepAliveInterval = null;
var activePorts = new Set();
function startKeepAlive() {
    console.log('Starting service worker keep-alive');
    // Method 1: Chrome alarms (minimum 30s intervals)
    chrome.alarms.create('keep-alive', { periodInMinutes: 0.4 }); // ~25 seconds
    // Method 2: Self-messaging (more reliable)
    if (!keepAliveInterval) {
        keepAliveInterval = setInterval(function () {
            chrome.runtime.getPlatformInfo(function () {
                // The callback keeps SW alive
            });
        }, 25000);
    }
}
function stopKeepAlive() {
    console.log('Stopping service worker keep-alive');
    chrome.alarms.clear('keep-alive');
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
}
function registerPort(port) {
    console.log('Registering port for keep-alive');
    activePorts.add(port);
    port.onDisconnect.addListener(function () {
        console.log('Port disconnected, removing from keep-alive');
        activePorts.delete(port);
        // If no ports left, we could potentially stop keep-alive
        // But keep it running during tasks
    });
}
function getActivePortsCount() {
    return activePorts.size;
}
// Alarm listener
chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name === 'keep-alive') {
        console.log('Keep-alive alarm triggered');
        // No-op, just keeping SW alive
    }
});
