import { spawn, ChildProcess } from 'child_process';
import * as CDP from 'chrome-remote-interface';

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

export interface BrowserSession {
  client: any;
  close: () => Promise<void>;
}

let chromeProcess: ChildProcess | null = null;

async function findChrome(): Promise<string> {
  const { execSync } = require('child_process');
  for (const p of CHROME_PATHS) {
    try {
      execSync(`test -f "${p}"`, { stdio: 'ignore' });
      return p;
    } catch {}
  }
  // Try which
  try {
    return execSync('which google-chrome || which chromium-browser || which chromium', { encoding: 'utf8' }).trim();
  } catch {}
  throw new Error('Chrome not found. Install google-chrome or chromium.');
}

export async function launchChrome(): Promise<void> {
  const path = await findChrome();
  console.log(`Launching Chrome: ${path}`);

  chromeProcess = spawn(path, [
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

async function waitForChrome(timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const client = await CDP({ port: DEBUG_PORT });
      await client.close();
      return;
    } catch {
      await sleep(200);
    }
  }
  throw new Error(`Chrome did not start within ${timeoutMs}ms`);
}

export async function connectSession(url?: string): Promise<BrowserSession> {
  const client = await CDP({ port: DEBUG_PORT }) as any;

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
    close: async () => { try { await client.close(); } catch {} },
  };
}

export async function killChrome(): Promise<void> {
  if (chromeProcess) {
    chromeProcess.kill();
    chromeProcess = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
