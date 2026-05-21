import express, { Request, Response, NextFunction } from 'express';
import { runTask, runWorkflowTask, getActiveCount, shutdown, WorkflowStep } from './agent';

const app = express();
app.use(express.json({ limit: '256kb' }));

const PORT = parseInt(process.env.PORT || '3000');
const ENV_API_KEY = process.env.INCEPTION_API_KEY || '';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '';
const MAX_CONCURRENT = 5;
const REQUEST_TIMEOUT_MS = 125_000; // slightly over task timeout so 504 fires first

if (!ENV_API_KEY) {
  console.warn('Warning: INCEPTION_API_KEY not set — clients must supply apiKey in Authorization header');
}

// CORS
if (CORS_ORIGIN) {
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    next();
  });
  app.options('*', (_req: Request, res: Response) => res.sendStatus(204));
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers['authorization'];
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

// POST /run
app.post('/run', async (req: Request, res: Response) => {
  const { task, url } = req.body;

  if (!task || !url) {
    return res.status(400).json({ error: 'task and url are required' });
  }

  // Auth: prefer Authorization header, fall back to env key
  const apiKey = extractBearerToken(req) || ENV_API_KEY;
  if (!apiKey) {
    return res.status(401).json({ error: 'Inception API key required (Authorization: Bearer <key>)' });
  }

  // Rate limit
  if (getActiveCount() >= MAX_CONCURRENT) {
    return res.status(429).json({ error: 'Too many concurrent requests, try again later' });
  }

  // Per-request timeout
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: 'Task timed out (>120s)' });
    }
  }, REQUEST_TIMEOUT_MS);

  try {
    const result = await runTask(task, url, { apiKey, keepAlive: true });
    clearTimeout(timer);
    if (!res.headersSent) res.json(result);
  } catch (err: any) {
    clearTimeout(timer);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// POST /workflow
app.post('/workflow', async (req: Request, res: Response) => {
  const { steps, apiKey: bodyApiKey } = req.body as { steps: WorkflowStep[]; apiKey?: string };

  if (!Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: 'steps must be a non-empty array' });
  }

  for (let i = 0; i < steps.length; i++) {
    if (!steps[i].task) {
      return res.status(400).json({ error: `steps[${i}].task is required` });
    }
  }

  const apiKey = extractBearerToken(req) || bodyApiKey || ENV_API_KEY;
  if (!apiKey) {
    return res.status(401).json({ error: 'Inception API key required (Authorization: Bearer <key>)' });
  }

  if (getActiveCount() >= MAX_CONCURRENT) {
    return res.status(429).json({ error: 'Too many concurrent requests, try again later' });
  }

  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: 'Workflow timed out (>120s)' });
    }
  }, REQUEST_TIMEOUT_MS);

  try {
    const result = await runWorkflowTask(steps, { apiKey, keepAlive: true });
    clearTimeout(timer);
    if (!res.headersSent) res.json(result);
  } catch (err: any) {
    clearTimeout(timer);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// GET /health
app.get('/health', async (_req: Request, res: Response) => {
  const { ChromeManager } = await import('./browser');
  const chromeAlive = ChromeManager.getInstance().isAlive();
  res.json({
    status: 'ok',
    model: 'mercury-2',
    chrome: chromeAlive ? 'up' : 'not started',
    activeTasks: getActiveCount(),
  });
});

const server = app.listen(PORT, () => {
  console.log(`Cometeor Agent HTTP API running on http://localhost:${PORT}`);
  console.log(`  POST /run      { task, url }         (Authorization: Bearer <key>)`);
  console.log(`  POST /workflow { steps: WorkflowStep[] }`);
  console.log(`  GET  /health`);
});

let shuttingDown = false;

async function gracefulShutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\nShutting down...');

  // Stop accepting new requests
  server.close();

  // Wait for in-flight tasks (up to 10s)
  const deadline = Date.now() + 10_000;
  while (getActiveCount() > 0 && Date.now() < deadline) {
    await sleep(200);
  }

  await shutdown();
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
