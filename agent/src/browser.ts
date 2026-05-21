import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as CDP from 'chrome-remote-interface';

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

function findChrome(): string {
  for (const p of CHROME_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    'Chrome/Chromium not found. Install google-chrome or chromium.\n' +
    `Searched: ${CHROME_CANDIDATES.join(', ')}`
  );
}

export class ChromeManager {
  private static _instance: ChromeManager;
  private _process: ChildProcess | null = null;
  private _launchPromise: Promise<void> | null = null;
  private _ready = false;

  static getInstance(): ChromeManager {
    if (!ChromeManager._instance) ChromeManager._instance = new ChromeManager();
    return ChromeManager._instance;
  }

  private constructor() {
    process.on('exit', () => this._killSync());
    process.on('SIGINT', () => { this._killSync(); process.exit(0); });
    process.on('SIGTERM', () => { this._killSync(); process.exit(0); });
  }

  async ensureRunning(timeoutMs = 10_000): Promise<void> {
    // Already running
    if (this._ready && this._process && !this._process.killed) return;

    // Already launching — wait on same promise (mutex)
    if (this._launchPromise) return this._launchPromise;

    this._launchPromise = this._launch(timeoutMs).finally(() => {
      this._launchPromise = null;
    });
    return this._launchPromise;
  }

  private async _launch(timeoutMs: number): Promise<void> {
    const chromePath = findChrome();

    this._process = spawn(chromePath, [
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

  private async _waitReady(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastErr: Error | null = null;

    while (Date.now() < deadline) {
      try {
        const c = await CDP({ port: DEBUG_PORT });
        await c.close();
        return;
      } catch (e: any) {
        lastErr = e;
        await sleep(250);
      }
    }
    throw new Error(`Chrome did not start within ${timeoutMs}ms: ${lastErr?.message}`);
  }

  isAlive(): boolean {
    return this._ready && !!this._process && !this._process.killed;
  }

  async shutdown(): Promise<void> {
    if (!this._process) return;
    this._process.kill('SIGTERM');
    await Promise.race([
      new Promise<void>(res => this._process!.on('exit', res)),
      sleep(3000),
    ]);
    if (this._process && !this._process.killed) this._process.kill('SIGKILL');
    this._process = null;
    this._ready = false;
    // Clean profile
    try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch {}
  }

  private _killSync(): void {
    if (this._process && !this._process.killed) {
      this._process.kill('SIGKILL');
    }
  }
}

export interface BrowserSession {
  client: any;
  close: () => Promise<void>;
}

export async function connectSession(url?: string): Promise<BrowserSession> {
  const client = await CDP({ port: DEBUG_PORT }) as any;

  await Promise.all([
    withTimeout(client.Page.enable(), 5000, 'Page.enable'),
    withTimeout(client.Runtime.enable(), 5000, 'Runtime.enable'),
    withTimeout(client.DOM.enable(), 5000, 'DOM.enable'),
    withTimeout(client.Accessibility.enable(), 5000, 'Accessibility.enable'),
    withTimeout(client.Network.enable(), 5000, 'Network.enable'),
  ]);

  if (url) {
    await withTimeout(client.Page.navigate({ url }), 10_000, `navigate to ${url}`);
    await withTimeout(
      new Promise<void>(res => client.Page.loadEventFired(res)),
      15_000,
      'page load'
    );
    await sleep(300);
  }

  return {
    client,
    close: async () => {
      try { await client.close(); } catch { /* already closed */ }
    },
  };
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    sleep(ms).then(() => { throw new Error(`Timeout after ${ms}ms: ${label}`); }),
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
