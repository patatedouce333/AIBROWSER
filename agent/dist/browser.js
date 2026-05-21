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
exports.ChromeManager = void 0;
exports.connectSession = connectSession;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const CDP = __importStar(require("chrome-remote-interface"));
const DEBUG_PORT = 9222;
const PROFILE_DIR = path.join(os.tmpdir(), 'agent-chrome-profile');
const CHROME_CANDIDATES = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
function findChrome() {
    for (const p of CHROME_CANDIDATES) {
        if (fs.existsSync(p))
            return p;
    }
    throw new Error('Chrome/Chromium not found. Install google-chrome or chromium.\n' +
        `Searched: ${CHROME_CANDIDATES.join(', ')}`);
}
class ChromeManager {
    static getInstance() {
        if (!ChromeManager._instance)
            ChromeManager._instance = new ChromeManager();
        return ChromeManager._instance;
    }
    constructor() {
        this._process = null;
        this._launchPromise = null;
        this._ready = false;
        process.on('exit', () => this._killSync());
        process.on('SIGINT', () => { this._killSync(); process.exit(0); });
        process.on('SIGTERM', () => { this._killSync(); process.exit(0); });
    }
    async ensureRunning(timeoutMs = 10000) {
        // Already running
        if (this._ready && this._process && !this._process.killed)
            return;
        // Already launching — wait on same promise (mutex)
        if (this._launchPromise)
            return this._launchPromise;
        this._launchPromise = this._launch(timeoutMs).finally(() => {
            this._launchPromise = null;
        });
        return this._launchPromise;
    }
    async _launch(timeoutMs) {
        const chromePath = findChrome();
        this._process = (0, child_process_1.spawn)(chromePath, [
            `--remote-debugging-port=${DEBUG_PORT}`,
            '--headless=new',
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-setuid-sandbox',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-extensions',
            `--user-data-dir=${PROFILE_DIR}`,
        ], { stdio: 'ignore' });
        this._process.on('exit', () => { this._ready = false; });
        this._process.on('error', (err) => {
            console.error('[ChromeManager] process error:', err.message);
            this._ready = false;
        });
        await this._waitReady(timeoutMs);
        this._ready = true;
    }
    async _waitReady(timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        let lastErr = null;
        while (Date.now() < deadline) {
            try {
                const c = await CDP({ port: DEBUG_PORT });
                await c.close();
                return;
            }
            catch (e) {
                lastErr = e;
                await sleep(250);
            }
        }
        throw new Error(`Chrome did not start within ${timeoutMs}ms: ${lastErr?.message}`);
    }
    isAlive() {
        return this._ready && !!this._process && !this._process.killed;
    }
    async shutdown() {
        if (!this._process)
            return;
        this._process.kill('SIGTERM');
        await Promise.race([
            new Promise(res => this._process.on('exit', res)),
            sleep(3000),
        ]);
        if (this._process && !this._process.killed)
            this._process.kill('SIGKILL');
        this._process = null;
        this._ready = false;
        // Clean profile
        try {
            fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
        }
        catch { }
    }
    _killSync() {
        if (this._process && !this._process.killed) {
            this._process.kill('SIGKILL');
        }
    }
}
exports.ChromeManager = ChromeManager;
async function connectSession(url) {
    const client = await CDP({ port: DEBUG_PORT });
    await Promise.all([
        withTimeout(client.Page.enable(), 5000, 'Page.enable'),
        withTimeout(client.Runtime.enable(), 5000, 'Runtime.enable'),
        withTimeout(client.DOM.enable(), 5000, 'DOM.enable'),
        withTimeout(client.Accessibility.enable(), 5000, 'Accessibility.enable'),
        withTimeout(client.Network.enable(), 5000, 'Network.enable'),
    ]);
    if (url) {
        await withTimeout(client.Page.navigate({ url }), 10000, `navigate to ${url}`);
        await withTimeout(new Promise(res => client.Page.loadEventFired(res)), 15000, 'page load');
        await sleep(300);
    }
    return {
        client,
        close: async () => {
            try {
                await client.close();
            }
            catch { /* already closed */ }
        },
    };
}
function withTimeout(p, ms, label) {
    return Promise.race([
        p,
        sleep(ms).then(() => { throw new Error(`Timeout after ${ms}ms: ${label}`); }),
    ]);
}
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
