"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.launchChrome = launchChrome;
exports.connectSession = connectSession;
exports.killChrome = killChrome;
const child_process_1 = require("child_process");
const CDP = __importStar(require("chrome-remote-interface"));
const DEBUG_PORT = 9222;
// Common Chrome paths across platforms
const CHROME_PATHS = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
let chromeProcess = null;
async function findChrome() {
    const { execSync } = require('child_process');
    for (const p of CHROME_PATHS) {
        try {
            execSync(`test -f "${p}"`, { stdio: 'ignore' });
            return p;
        }
        catch { }
    }
    // Try which
    try {
        return execSync('which google-chrome || which chromium-browser || which chromium', { encoding: 'utf8' }).trim();
    }
    catch { }
    throw new Error('Chrome not found. Install google-chrome or chromium.');
}
async function launchChrome() {
    const path = await findChrome();
    console.log(`Launching Chrome: ${path}`);
    chromeProcess = (0, child_process_1.spawn)(path, [
        `--remote-debugging-port=${DEBUG_PORT}`,
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--user-data-dir=/tmp/agent-chrome-profile',
    ], { stdio: 'ignore', detached: false });
    chromeProcess.on('error', (err) => {
        console.error('Chrome process error:', err);
    });
    // Wait for Chrome to start accepting connections
    await waitForChrome(5000);
}
async function waitForChrome(timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const client = await CDP({ port: DEBUG_PORT });
            await client.close();
            return;
        }
        catch {
            await sleep(200);
        }
    }
    throw new Error(`Chrome did not start within ${timeoutMs}ms`);
}
async function connectSession(url) {
    const client = await CDP({ port: DEBUG_PORT });
    const { Page, Runtime, DOM, Input, Accessibility, Network } = client;
    await Promise.all([
        Page.enable(),
        Runtime.enable(),
        DOM.enable(),
        Accessibility.enable(),
        Network.enable(),
    ]);
    if (url) {
        await Page.navigate({ url });
        await Page.loadEventFired();
        await sleep(500); // let JS settle
    }
    return {
        client,
        close: async () => { try {
            await client.close();
        }
        catch { } },
    };
}
async function killChrome() {
    if (chromeProcess) {
        chromeProcess.kill();
        chromeProcess = null;
    }
}
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
